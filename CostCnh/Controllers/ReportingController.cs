using System.Data;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using WuicCore.Services.Notifications;

namespace CostCnh.Controllers;

/// <summary>
/// Reporting pipeline (Sprint 6 — Long Running Task + Notification When Ready).
///
/// Pattern:
///   1. UI: POST /api/reports/run/{reportDefId}  → return execution_id immediato
///   2. INSERT rep.report_execution (status=0 queued)
///   3. EXEC audit.outbox_enqueue(event_kind='report_generate', payload={execution_id})
///   4. costcnh_outbox_dispatch (scheduler 30s) claima, executes SP, write result,
///      EnqueueAsync notification al recipient (deep-link a /rep_executions/edit/{id})
///   5. UI vede badge notification-bell → click → naviga al detail con result_json
///
/// REGOLA AGENTS: no BackgroundService/Quartz/Hangfire — tutto async-work passa
/// per il framework scheduler che gestisce retry/logging/disabling automatico.
/// </summary>
[ApiController]
[Route("api/reports")]
public class ReportingController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<ReportingController> _log;

    public ReportingController(IConfiguration cfg, ILogger<ReportingController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    public class RunReportRequest
    {
        public Dictionary<string, object>? @params { get; set; }
    }

    [HttpPost("run/{reportDefId:int}")]
    public async Task<IActionResult> Run(int reportDefId, [FromBody] RunReportRequest? body, CancellationToken ct)
    {
        // 1. Validate report definition exists + is active
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        string? code = null;
        bool isActive = false;
        await using (var def = cn.CreateCommand())
        {
            def.CommandText = "SELECT code, is_active FROM [rep].[report_definition] WHERE id = @id AND ISNULL(cancellato,0) = 0";
            def.Parameters.AddWithValue("@id", reportDefId);
            await using var rd = await def.ExecuteReaderAsync(ct);
            if (await rd.ReadAsync(ct))
            {
                code = rd.GetString(0);
                isActive = rd.GetBoolean(1);
            }
        }
        if (code == null) return NotFound(new { ok = false, error = $"Report definition {reportDefId} non trovata" });
        if (!isActive) return BadRequest(new { ok = false, error = $"Report '{code}' disattivato" });

        // Resolve recipient user (current authenticated)
        int? recipientUserId = ResolveCurrentUserId();
        string paramsJson = body?.@params != null
            ? JsonSerializer.Serialize(body.@params)
            : "{}";

        // 2. INSERT execution row + 3. enqueue outbox in single transaction
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        long executionId;
        try
        {
            await using (var ins = cn.CreateCommand())
            {
                ins.Transaction = tx;
                ins.CommandText = @"
INSERT INTO [rep].[report_execution]
    (report_definition_id, report_code, params_json, status, requested_by_user_id)
OUTPUT INSERTED.id
VALUES (@def, @code, @params, 0, @uid);";
                ins.Parameters.AddWithValue("@def", reportDefId);
                ins.Parameters.AddWithValue("@code", code);
                ins.Parameters.AddWithValue("@params", paramsJson);
                ins.Parameters.AddWithValue("@uid", (object?)recipientUserId ?? DBNull.Value);
                executionId = Convert.ToInt64(await ins.ExecuteScalarAsync(ct));
            }

            // Enqueue outbox event
            long outboxId;
            await using (var enq = cn.CreateCommand())
            {
                enq.Transaction = tx;
                enq.CommandText = "[audit].[outbox_enqueue]";
                enq.CommandType = CommandType.StoredProcedure;
                enq.Parameters.AddWithValue("@event_kind", "report_generate");
                enq.Parameters.AddWithValue("@entity_schema", "rep");
                enq.Parameters.AddWithValue("@entity_name", "report_execution");
                enq.Parameters.AddWithValue("@entity_id", executionId.ToString());
                enq.Parameters.AddWithValue("@payload_json", JsonSerializer.Serialize(new
                {
                    execution_id = executionId,
                    report_code = code,
                    recipient_user_id = recipientUserId
                }));
                enq.Parameters.AddWithValue("@enqueued_by_user_id", (object?)recipientUserId ?? DBNull.Value);
                var idParam = enq.Parameters.Add("@id", SqlDbType.BigInt);
                idParam.Direction = ParameterDirection.Output;
                await enq.ExecuteNonQueryAsync(ct);
                outboxId = Convert.ToInt64(idParam.Value);
            }

            // Update execution.outbox_id link
            await using (var upd = cn.CreateCommand())
            {
                upd.Transaction = tx;
                upd.CommandText = "UPDATE [rep].[report_execution] SET outbox_id = @ob WHERE id = @id";
                upd.Parameters.AddWithValue("@ob", outboxId);
                upd.Parameters.AddWithValue("@id", executionId);
                await upd.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);

            _log.LogInformation("Report '{Code}' enqueued — executionId={ExecId} outboxId={OutId} user={Uid}",
                code, executionId, outboxId, recipientUserId);

            return Ok(new
            {
                ok = true,
                executionId,
                outboxId,
                reportCode = code,
                message = $"Generazione report '{code}' avviata. Riceverai una notifica quando pronto."
            });
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _log.LogError(ex, "Failed to enqueue report '{Code}'", code);
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    /// <summary>
    /// Download del result xlsx generato dall'outbox handler (Sprint 7 Phase B).
    /// Restituisce il file da <c>Upload/reports/{executionId}.xlsx</c>.
    /// </summary>
    [HttpGet("download/{executionId:long}")]
    public async Task<IActionResult> Download(long executionId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT result_path, status, report_code FROM [rep].[report_execution] WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", executionId);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (!await rd.ReadAsync(ct))
            return NotFound(new { ok = false, error = $"Execution {executionId} non trovata" });

        var status = rd.GetByte(1);
        var reportCode = rd.GetString(2);
        if (status != 2)
            return BadRequest(new { ok = false, error = $"Execution {executionId} non completata (status={status})" });
        if (rd.IsDBNull(0))
            return NotFound(new { ok = false, error = $"Execution {executionId} non ha result_path (output_format=json?)" });

        var path = rd.GetString(0);
        if (!System.IO.File.Exists(path))
            return NotFound(new { ok = false, error = $"File {path} non trovato sul filesystem" });

        var bytes = await System.IO.File.ReadAllBytesAsync(path, ct);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"{reportCode}_{executionId}.xlsx");
    }

    /// <summary>
    /// Statico helper: converte result_json (top-level con array di rows) in file xlsx.
    /// Chiamato da SchedulerActionsController.HandleReportGenerateAsync quando
    /// rep.report_definition.output_format = 'xlsx'.
    /// </summary>
    public static string WriteResultXlsx(string outputDir, long executionId, string reportCode, string resultJson)
    {
        if (!Directory.Exists(outputDir)) Directory.CreateDirectory(outputDir);
        var path = Path.Combine(outputDir, $"{executionId}.xlsx");

        // result_json shape: { rows: [...], plus other top-level scalar/array fields }
        // Scriviamo: 1 sheet "Result" con le rows tabulari + 1 sheet "Meta" con altri scalar
        using var doc = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook);
        var wbPart = doc.AddWorkbookPart();
        wbPart.Workbook = new Workbook();
        var sheets = wbPart.Workbook.AppendChild(new Sheets());

        using var json = JsonDocument.Parse(resultJson);
        var root = json.RootElement;

        // Find first array property to treat as main table
        JsonElement? mainArray = null;
        string mainName = "Result";
        foreach (var p in root.EnumerateObject())
        {
            if (p.Value.ValueKind == JsonValueKind.Array)
            {
                mainArray = p.Value;
                mainName = p.Name;
                break;
            }
        }

        // Sheet 1: main rows
        AddSheet(wbPart, sheets, 1, mainName.Length > 31 ? mainName.Substring(0, 31) : mainName, mainArray);

        // Sheet 2: meta (scalar fields)
        var metaPairs = new List<(string k, string v)>();
        foreach (var p in root.EnumerateObject())
        {
            if (p.Value.ValueKind != JsonValueKind.Array && p.Value.ValueKind != JsonValueKind.Object)
                metaPairs.Add((p.Name, p.Value.ToString()));
        }
        AddMetaSheet(wbPart, sheets, 2, "Meta", metaPairs, reportCode, executionId);

        wbPart.Workbook.Save();
        return path;
    }

    private static void AddSheet(WorkbookPart wbPart, Sheets sheets, uint sheetId, string sheetName, JsonElement? rowsArray)
    {
        var wsPart = wbPart.AddNewPart<WorksheetPart>();
        var sheetData = new SheetData();
        wsPart.Worksheet = new Worksheet(sheetData);

        if (rowsArray.HasValue && rowsArray.Value.ValueKind == JsonValueKind.Array)
        {
            var headers = new List<string>();
            // Pass 1: collect headers from first row
            foreach (var row in rowsArray.Value.EnumerateArray())
            {
                if (row.ValueKind == JsonValueKind.Object)
                {
                    foreach (var p in row.EnumerateObject()) headers.Add(p.Name);
                    break;
                }
            }
            // Header row
            var hr = new Row();
            foreach (var h in headers) hr.Append(NewCell(h));
            sheetData.Append(hr);
            // Data rows
            foreach (var row in rowsArray.Value.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object) continue;
                var dr = new Row();
                foreach (var h in headers)
                {
                    if (row.TryGetProperty(h, out var v))
                        dr.Append(NewCell(v.ValueKind == JsonValueKind.Null ? "" : (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.GetRawText())));
                    else
                        dr.Append(NewCell(""));
                }
                sheetData.Append(dr);
            }
        }

        sheets.Append(new Sheet { Id = wbPart.GetIdOfPart(wsPart), SheetId = sheetId, Name = sheetName });
    }

    private static void AddMetaSheet(WorkbookPart wbPart, Sheets sheets, uint sheetId, string sheetName,
        List<(string k, string v)> pairs, string reportCode, long executionId)
    {
        var wsPart = wbPart.AddNewPart<WorksheetPart>();
        var sheetData = new SheetData();
        wsPart.Worksheet = new Worksheet(sheetData);

        var hr = new Row();
        hr.Append(NewCell("Key"));
        hr.Append(NewCell("Value"));
        sheetData.Append(hr);

        foreach (var meta in new[] {
            ("report_code", reportCode),
            ("execution_id", executionId.ToString()),
            ("generated_at_utc", DateTime.UtcNow.ToString("O"))
        }) { var r = new Row(); r.Append(NewCell(meta.Item1)); r.Append(NewCell(meta.Item2)); sheetData.Append(r); }

        foreach (var p in pairs)
        {
            var r = new Row();
            r.Append(NewCell(p.k));
            r.Append(NewCell(p.v));
            sheetData.Append(r);
        }
        sheets.Append(new Sheet { Id = wbPart.GetIdOfPart(wsPart), SheetId = sheetId, Name = sheetName });
    }

    private static Cell NewCell(string text)
        => new Cell { DataType = CellValues.String, CellValue = new CellValue(text ?? "") };

    private int? ResolveCurrentUserId()
    {
        // 1. Try X-User-Id header (set by some test harnesses)
        if (Request?.Headers?.TryGetValue("X-User-Id", out var headerVals) == true &&
            int.TryParse(headerVals.ToString(), out var hid))
            return hid;

        // 2. Try Cookie k-user → JSON.user_id (framework standard)
        if (Request?.Cookies?.TryGetValue("k-user", out var ckRaw) == true && !string.IsNullOrEmpty(ckRaw))
        {
            try
            {
                var decoded = Uri.UnescapeDataString(ckRaw);
                using var doc = JsonDocument.Parse(decoded);
                if (doc.RootElement.TryGetProperty("user_id", out var uidEl))
                {
                    var raw = uidEl.ValueKind == JsonValueKind.String ? uidEl.GetString() : uidEl.GetRawText();
                    if (int.TryParse(raw, out var parsed)) return parsed;
                }
            }
            catch { }
        }
        return null;
    }
}
