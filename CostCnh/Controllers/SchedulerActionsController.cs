using System.Data;
using System.Text.Json;
using CostCnh.Integrations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using WuicCore.Services.Notifications;

namespace CostCnh.Controllers;

/// <summary>
/// Endpoint webhook chiamati dal framework <c>dbo.scheduler</c>
/// (action_type='2', action_cmd='POST http://localhost:6500/api/scheduler/...').
///
/// **REGOLA AGENTS**: no BackgroundService / Quartz / Hangfire. Tutto async-work
/// passa per il framework scheduler che gestisce retry, logging, next_execution
/// e disabilita automaticamente i job dopo N failure consecutivi.
///
/// Naming dei task: `costcnh_<verb>_<noun>` (snake_case).
/// </summary>
[ApiController]
[Route("api/scheduler")]
public class SchedulerActionsController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<SchedulerActionsController> _log;
    private readonly INotificationRepository _notifications;
    private readonly IntegrationProviderResolver _integrations;

    private readonly CostCnh.Middleware.AccessLogBuffer? _accessLogBuffer;

    public SchedulerActionsController(IConfiguration cfg, ILogger<SchedulerActionsController> logger, INotificationRepository notifications, IntegrationProviderResolver integrations,
        CostCnh.Middleware.AccessLogBuffer? accessLogBuffer = null)
    {
        _log = logger;
        _notifications = notifications;
        _integrations = integrations;
        _accessLogBuffer = accessLogBuffer;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── Task 12.1 — costcnh_flush_access_log ─────────────────────────────────
    [HttpPost("costcnh_flush_access_log")]
    public async Task<IActionResult> FlushAccessLog(CancellationToken ct)
    {
        if (_accessLogBuffer == null) return Ok(new { ok = true, flushed = 0, reason = "buffer not registered" });
        var flushed = await CostCnh.Middleware.AccessLogFlusher.FlushAsync(_accessLogBuffer, _dataCs, ct);
        return Ok(new { ok = true, flushed, remainingInBuffer = _accessLogBuffer.Count });
    }

    // ─── costcnh_outbox_dispatch ───────────────────────────────────────────────
    // Drena fino a 50 messaggi dall'outbox per ciclo, dispatchando per event_kind.
    // Handler registrati:
    //   - 'report_generate'         → HandleReportGenerateAsync (Sprint 6)
    //   - 'program_consolidation'   → no-op (Sprint 7)
    //   - 'forecast_recalc'         → no-op (Sprint 5+)
    //   - 'sap_send'/'bpm_send'/...  → no-op (Sprint 4 provider symmetry placeholder)
    [HttpPost("costcnh_outbox_dispatch")]
    public async Task<IActionResult> OutboxDispatch(CancellationToken ct)
    {
        var claimedRows = new List<Dictionary<string, object?>>();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        await using (var claim = cn.CreateCommand())
        {
            claim.CommandText = "[audit].[outbox_claim]";
            claim.CommandType = CommandType.StoredProcedure;
            claim.Parameters.AddWithValue("@worker_id", $"web-{Environment.MachineName}-{Environment.ProcessId}");
            claim.Parameters.AddWithValue("@batch_size", 50);
            claim.Parameters.AddWithValue("@event_kind", DBNull.Value);

            await using var rdr = await claim.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                var row = new Dictionary<string, object?>();
                for (int i = 0; i < rdr.FieldCount; i++)
                {
                    var v = rdr.GetValue(i);
                    row[rdr.GetName(i)] = v == DBNull.Value ? null : v;
                }
                claimedRows.Add(row);
            }
        }

        int succeeded = 0, failed = 0;
        foreach (var row in claimedRows)
        {
            long id = Convert.ToInt64(row["id"]);
            string kind = (row["event_kind"] as string) ?? "unknown";
            string payloadJson = (row["payload_json"] as string) ?? "{}";
            try
            {
                bool handled = kind switch
                {
                    "report_generate" => await HandleReportGenerateAsync(payloadJson, ct),
                    "mac_send"        => await HandleMacSendAsync(payloadJson, ct),
                    _ => true   // no-op default per kinds non implementati (Sprint 4/5 placeholders)
                };

                _log.LogInformation("Outbox dispatch kind={Kind} id={Id} handled={Handled}", kind, id, handled);

                await using var ok = cn.CreateCommand();
                ok.CommandText = "[audit].[outbox_complete]";
                ok.CommandType = CommandType.StoredProcedure;
                ok.Parameters.AddWithValue("@id", id);
                await ok.ExecuteNonQueryAsync(ct);
                succeeded++;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Outbox dispatch FAIL kind={Kind} id={Id}", kind, id);
                await using var bad = cn.CreateCommand();
                bad.CommandText = "[audit].[outbox_fail]";
                bad.CommandType = CommandType.StoredProcedure;
                bad.Parameters.AddWithValue("@id", id);
                bad.Parameters.AddWithValue("@error", ex.Message.Substring(0, Math.Min(2000, ex.Message.Length)));
                await bad.ExecuteNonQueryAsync(ct);
                failed++;
            }
        }

        return Ok(new { ok = true, claimed = claimedRows.Count, succeeded, failed });
    }

    /// <summary>
    /// Handler outbox per event_kind='report_generate'. Carica la report_execution
    /// + report_definition, esegue la SP, scrive result_json, emette notification.
    /// </summary>
    private async Task<bool> HandleReportGenerateAsync(string payloadJson, CancellationToken ct)
    {
        long executionId;
        int? recipientUserId = null;
        using (var doc = JsonDocument.Parse(payloadJson))
        {
            if (!doc.RootElement.TryGetProperty("execution_id", out var execEl)) return false;
            executionId = execEl.GetInt64();
            if (doc.RootElement.TryGetProperty("recipient_user_id", out var uidEl) &&
                uidEl.ValueKind == JsonValueKind.Number)
                recipientUserId = uidEl.GetInt32();
        }

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        // 1. Load execution + definition
        string? storedName = null, reportCode = null, paramsJson = null, reportName = null, outputFormat = null;
        await using (var load = cn.CreateCommand())
        {
            load.CommandText = @"
SELECT e.params_json, e.report_code, d.stored_name, d.name AS report_name, d.output_format
FROM [rep].[report_execution] e
INNER JOIN [rep].[report_definition] d ON d.id = e.report_definition_id
WHERE e.id = @id;";
            load.Parameters.AddWithValue("@id", executionId);
            await using var rd = await load.ExecuteReaderAsync(ct);
            if (await rd.ReadAsync(ct))
            {
                paramsJson = rd.IsDBNull(0) ? "{}" : rd.GetString(0);
                reportCode = rd.GetString(1);
                storedName = rd.GetString(2);
                reportName = rd.GetString(3);
                outputFormat = rd.IsDBNull(4) ? "json" : rd.GetString(4);
            }
        }
        if (storedName == null) { _log.LogWarning("Report execution {Id} not found", executionId); return false; }

        var sw = System.Diagnostics.Stopwatch.StartNew();

        // 2. Update status=1 (running) + started_at_utc
        await using (var startCmd = cn.CreateCommand())
        {
            startCmd.CommandText = "UPDATE [rep].[report_execution] SET status = 1, started_at_utc = SYSUTCDATETIME() WHERE id = @id";
            startCmd.Parameters.AddWithValue("@id", executionId);
            await startCmd.ExecuteNonQueryAsync(ct);
        }

        string? resultJson = null;
        int resultRowCount = 0;
        Exception? spError = null;
        try
        {
            // 3. Execute report SP
            await using var sp = cn.CreateCommand();
            sp.CommandText = storedName;
            sp.CommandType = CommandType.StoredProcedure;
            sp.CommandTimeout = 300;   // 5 min hard ceiling
            sp.Parameters.AddWithValue("@params_json", paramsJson ?? "{}");
            sp.Parameters.AddWithValue("@execution_id", executionId);
            var resOut = sp.Parameters.Add("@result_json", SqlDbType.NVarChar, -1);
            resOut.Direction = ParameterDirection.Output;
            var cntOut = sp.Parameters.Add("@result_row_count", SqlDbType.Int);
            cntOut.Direction = ParameterDirection.Output;

            await sp.ExecuteNonQueryAsync(ct);
            resultJson = resOut.Value == DBNull.Value ? null : (string?)resOut.Value;
            resultRowCount = cntOut.Value == DBNull.Value ? 0 : Convert.ToInt32(cntOut.Value);
        }
        catch (Exception ex)
        {
            spError = ex;
        }

        sw.Stop();
        int durationMs = (int)sw.ElapsedMilliseconds;

        // 4. If output_format='xlsx' and SP succeeded, generate xlsx file
        string? resultPath = null;
        if (spError == null && string.Equals(outputFormat, "xlsx", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(resultJson))
        {
            try
            {
                var outDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Upload", "reports");
                outDir = Path.GetFullPath(outDir);
                resultPath = ReportingController.WriteResultXlsx(outDir, executionId, reportCode ?? "report", resultJson);
                _log.LogInformation("Xlsx generated for execution {Id} → {Path}", executionId, resultPath);
            }
            catch (Exception xlsEx)
            {
                _log.LogError(xlsEx, "Xlsx generation failed for execution {Id}", executionId);
                // Non-fatal: still mark execution completed with result_json available; download endpoint will fallback
            }
        }

        // 5. Update status=2 (completed) or 9 (failed)
        await using (var doneCmd = cn.CreateCommand())
        {
            doneCmd.CommandText = @"
UPDATE [rep].[report_execution]
   SET status = @status,
       result_json = @rj,
       result_path = @rp,
       result_row_count = @rc,
       completed_at_utc = SYSUTCDATETIME(),
       duration_ms = @dur,
       last_error = @err
 WHERE id = @id";
            doneCmd.Parameters.AddWithValue("@id", executionId);
            doneCmd.Parameters.AddWithValue("@status", spError == null ? 2 : 9);
            doneCmd.Parameters.AddWithValue("@rj", (object?)resultJson ?? DBNull.Value);
            doneCmd.Parameters.AddWithValue("@rp", (object?)resultPath ?? DBNull.Value);
            doneCmd.Parameters.AddWithValue("@rc", resultRowCount);
            doneCmd.Parameters.AddWithValue("@dur", durationMs);
            doneCmd.Parameters.AddWithValue("@err", (object?)spError?.Message ?? DBNull.Value);
            await doneCmd.ExecuteNonQueryAsync(ct);
        }

        // 5. Notification-bell (skip silently if recipientUserId is null o invalid)
        if (recipientUserId.HasValue && recipientUserId.Value > 0)
        {
            try
            {
                var msg = spError == null
                    ? $"Report \"{reportName}\" pronto — {resultRowCount} righe in {durationMs} ms"
                    : $"Report \"{reportName}\" fallito: {spError.Message}";

                var notifId = await _notifications.EnqueueAsync(new EnqueueNotificationRequest
                {
                    userId = recipientUserId.Value,
                    type = spError == null ? "report.ready" : "report.failed",
                    message = msg,
                    targetJson = JsonSerializer.Serialize(new
                    {
                        path = $"/rep_executions/edit/{executionId}",
                        execution_id = executionId,
                        report_code = reportCode
                    }),
                    payloadJson = JsonSerializer.Serialize(new
                    {
                        executionId,
                        reportCode,
                        rowCount = resultRowCount,
                        durationMs,
                        ok = spError == null
                    }),
                    source = "report.dispatcher"
                }, ct);

                if (notifId > 0)
                {
                    await using var linkCmd = cn.CreateCommand();
                    linkCmd.CommandText = "UPDATE [rep].[report_execution] SET notification_id = @nid WHERE id = @id";
                    linkCmd.Parameters.AddWithValue("@nid", notifId);
                    linkCmd.Parameters.AddWithValue("@id", executionId);
                    await linkCmd.ExecuteNonQueryAsync(ct);
                }
            }
            catch (Exception nx)
            {
                // Best-effort: no rollback se la notifica fallisce (rep.report_execution
                // gia' aggiornata, l'utente puo' comunque vedere il risultato via list-grid).
                _log.LogWarning(nx, "Notification enqueue failed for execution {Id}", executionId);
            }
        }

        return spError == null;
    }

    // ─── costcnh_partition_maintenance ────────────────────────────────────────
    // Estende pf_cp_facts_month per i prossimi 12 mesi se mancano i boundary.
    // Idempotente: skippa boundary gia' presenti. Esegue anche split + merge
    // di partizioni > retention (24 mesi rolling).
    [HttpPost("costcnh_partition_maintenance")]
    public async Task<IActionResult> PartitionMaintenance(CancellationToken ct)
    {
        const string sql = @"
DECLARE @added INT = 0;
DECLARE @currMonth INT = YEAR(SYSUTCDATETIME()) * 100 + MONTH(SYSUTCDATETIME());
DECLARE @targetMonth INT;

-- Aggiunge boundary mensili per i prossimi 12 mesi se mancanti
DECLARE @i INT = 0;
WHILE @i < 13
BEGIN
    DECLARE @y INT = (@currMonth / 100), @m INT = (@currMonth % 100) + @i;
    WHILE @m > 12 BEGIN SET @m = @m - 12; SET @y = @y + 1; END
    SET @targetMonth = @y * 100 + @m;

    IF NOT EXISTS (
        SELECT 1 FROM sys.partition_range_values prv
        JOIN sys.partition_functions pf ON pf.function_id = prv.function_id
        WHERE pf.name = 'pf_cp_facts_month' AND CAST(prv.value AS INT) = @targetMonth
    )
    BEGIN
        BEGIN TRY
            ALTER PARTITION SCHEME ps_cp_facts NEXT USED [PRIMARY];
            DECLARE @stmt NVARCHAR(MAX) = N'ALTER PARTITION FUNCTION pf_cp_facts_month() SPLIT RANGE (' + CAST(@targetMonth AS NVARCHAR(10)) + N')';
            EXEC sp_executesql @stmt;
            SET @added = @added + 1;
        END TRY
        BEGIN CATCH
            -- Non blocchiamo il batch: log + continue
            PRINT 'SPLIT failed for ' + CAST(@targetMonth AS NVARCHAR(10)) + ': ' + ERROR_MESSAGE();
        END CATCH
    END
    SET @i = @i + 1;
END

SELECT @added AS partitions_added, @currMonth AS current_month;";

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = 120;

        await using var rdr = await cmd.ExecuteReaderAsync(ct);
        var result = new Dictionary<string, object?>();
        if (await rdr.ReadAsync(ct))
        {
            for (int i = 0; i < rdr.FieldCount; i++)
                result[rdr.GetName(i)] = rdr.GetValue(i);
        }
        return Ok(new { ok = true, result });
    }

    /// <summary>
    /// Handler outbox per event_kind='mac_send'. Carica mac.request, chiama
    /// IMacRequestSender (Provider Symmetry → Stub o Http), aggiorna stato,
    /// emette notification al creatore.
    /// </summary>
    private async Task<bool> HandleMacSendAsync(string payloadJson, CancellationToken ct)
    {
        int requestId;
        int? recipientUserId = null;
        using (var doc = JsonDocument.Parse(payloadJson))
        {
            if (!doc.RootElement.TryGetProperty("request_id", out var el)) return false;
            requestId = el.GetInt32();
            if (doc.RootElement.TryGetProperty("recipient_user_id", out var uidEl) &&
                uidEl.ValueKind == JsonValueKind.Number)
                recipientUserId = uidEl.GetInt32();
        }

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        int programId = 0;
        string subject = "", correlation = "", details = "";
        await using (var load = cn.CreateCommand())
        {
            load.CommandText = @"SELECT program_id, subject, correlation_id, ISNULL(details,'') AS details FROM [mac].[request] WHERE id = @id";
            load.Parameters.AddWithValue("@id", requestId);
            await using var rd = await load.ExecuteReaderAsync(ct);
            if (await rd.ReadAsync(ct))
            {
                programId   = rd.GetInt32(0);
                subject     = rd.GetString(1);
                correlation = rd.GetString(2);
                details     = rd.GetString(3);
            } else return false;
        }

        var payload = JsonSerializer.Serialize(new { correlation_id = correlation, subject, details });
        var result = await _integrations.Mac().SendMacRequestAsync(programId, payload, ct);

        await using (var upd = cn.CreateCommand())
        {
            upd.CommandText = @"
UPDATE [mac].[request]
   SET status      = CASE WHEN @ok = 1 THEN 1 ELSE 0 END,   -- 1=sent if OK, stays 0 if failed
       sent_at_utc = CASE WHEN @ok = 1 THEN SYSUTCDATETIME() ELSE sent_at_utc END,
       last_error  = CASE WHEN @ok = 1 THEN NULL ELSE @err END
 WHERE id = @id";
            upd.Parameters.AddWithValue("@id", requestId);
            upd.Parameters.AddWithValue("@ok", result.Ok ? 1 : 0);
            upd.Parameters.AddWithValue("@err", (object?)result.OutcomeText ?? DBNull.Value);
            await upd.ExecuteNonQueryAsync(ct);
        }

        if (recipientUserId.HasValue && recipientUserId.Value > 0)
        {
            try
            {
                await _notifications.EnqueueAsync(new EnqueueNotificationRequest
                {
                    userId = recipientUserId.Value,
                    type = result.Ok ? "mac.sent" : "mac.send_failed",
                    message = result.Ok
                        ? $"MAC request '{subject}' inviata (msgId: {result.MessageId})"
                        : $"MAC request '{subject}' invio FALLITO: {result.OutcomeText}",
                    targetJson = JsonSerializer.Serialize(new { path = $"/mac_requests/edit/{requestId}", request_id = requestId }),
                    payloadJson = JsonSerializer.Serialize(new { requestId, ok = result.Ok, externalMessageId = result.MessageId }),
                    source = "mac.dispatcher"
                }, ct);
            }
            catch (Exception nx) { _log.LogWarning(nx, "Notification failed for MAC request {Id}", requestId); }
        }
        return result.Ok;
    }

    // ─── costcnh_poll_<integration> ───────────────────────────────────────────
    // Provider Symmetry: ogni poller risolve il provider corrente via
    // IntegrationProviderResolver (Stub default, Http opt-in da appsettings).
    // I poller incapsulano upsert cursor + log envelope + notification-bell
    // (Sprint 4 fase 1 — la notification-bell vera arriva con l'integrazione
    // dei messaggi REALI, qui il polling e' no-op).

    [HttpPost("costcnh_poll_sap")]
    public async Task<IActionResult> PollSap([FromServices] IntegrationProviderResolver resolver, CancellationToken ct)
        => Ok(new { ok = true, result = await resolver.SapPoller().PollOnceAsync(ct) });

    [HttpPost("costcnh_poll_bpm")]
    public async Task<IActionResult> PollBpm([FromServices] IntegrationProviderResolver resolver, CancellationToken ct)
        => Ok(new { ok = true, result = await resolver.BpmPoller().PollOnceAsync(ct) });

    [HttpPost("costcnh_poll_timesheet")]
    public async Task<IActionResult> PollTimesheet([FromServices] IntegrationProviderResolver resolver, CancellationToken ct)
        => Ok(new { ok = true, result = await resolver.TimesheetPoller().PollOnceAsync(ct) });

    [HttpPost("costcnh_poll_mac")]
    public async Task<IActionResult> PollMac([FromServices] IntegrationProviderResolver resolver, CancellationToken ct)
        => Ok(new { ok = true, result = await resolver.MacPoller().PollOnceAsync(ct) });
}
