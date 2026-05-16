using System.Data;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Spreadsheet PowerEdit API (Sprint 9.4) per editing batch su cp.facts.
/// Sostituisce il flow legacy AddinController (6684 LoC) Excel addin.
///
/// Pattern atteso dal frontend:
///   1. POST /lock-range/{program_id}  → acquire lock (token + expires_utc)
///   2. GET  /snapshot/{program_id}    → returns pivot data (rows × months)
///   3. user edita celle in memoria (Angular component: revogrid/handsontable)
///   4. ogni 60s POST /heartbeat (refresh lock TTL)
///   5. POST /save-cells               → batch UPDATE + change_log
///   6. POST /release-lock             → libera
///   7. (opzionale) GET  /export-xlsx  → download attuale view
///   8. (opzionale) POST /import-xlsx  → parse xlsx + save-cells server-side
///
/// Concurrency: lock pessimistic per (program_id × scenario_id × year_num).
/// Heartbeat ogni 60s estende TTL 30 min. Su disconnect frontend, lock scade
/// e altro user puo' acquisirlo.
/// </summary>
[ApiController]
[Route("api/spreadsheet")]
public class SpreadsheetController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<SpreadsheetController> _log;

    public SpreadsheetController(IConfiguration cfg, ILogger<SpreadsheetController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Acquire lock ───────────────────────────────────────────────────────
    public class LockRequest
    {
        public int? ScenarioId { get; set; }
        public int? YearNum { get; set; }
    }
    [HttpPost("lock-range/{programId:int}")]
    public async Task<IActionResult> AcquireLock(int programId, [FromBody] LockRequest? req, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        if (userId == null) return Unauthorized(new { ok = false, error = "User non risolvibile" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[spreadsheet_acquire_lock]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@project_scenario_id", (object?)req?.ScenarioId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@year_num", (object?)req?.YearNum ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@locked_by_user_id", userId.Value);
        cmd.Parameters.AddWithValue("@locked_by_session", HttpContext.TraceIdentifier);

        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (!await rd.ReadAsync(ct)) return StatusCode(500, new { ok = false, error = "SP returned no rows" });
        var outcome = rd.GetString(0);
        if (outcome == "conflict")
        {
            return Conflict(new
            {
                ok = false,
                outcome,
                conflictUserId = rd.IsDBNull(4) ? (int?)null : rd.GetInt32(4),
                lockExpiresUtc = rd.IsDBNull(3) ? (DateTime?)null : rd.GetDateTime(3)
            });
        }
        return Ok(new
        {
            ok = true,
            outcome,
            lockToken = rd.GetGuid(1),
            lockId = rd.GetInt64(2),
            lockExpiresUtc = rd.GetDateTime(3)
        });
    }

    // ─── 2. Snapshot pivot data ────────────────────────────────────────────────
    // Returns rows: { xbs_node_id, xbs_code, xbs_name, project_id, project_code,
    //                  monthly: { '202501': {planned, actual, committed}, '202502': {...}, ... } }
    [HttpGet("snapshot/{programId:int}")]
    public async Task<IActionResult> Snapshot(int programId, [FromQuery] int? scenarioId, [FromQuery] int? year, CancellationToken ct)
    {
        var monthFrom = (year ?? DateTime.UtcNow.Year) * 100 + 1;
        var monthTo   = (year ?? DateTime.UtcNow.Year) * 100 + 12;

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        // Query: all cp.facts rows for program × scenario in time window
        const string sql = @"
SELECT f.id, f.time_month_id, f.xbs_node_id, n.code AS xbs_code, n.name AS xbs_name,
       f.project_id, p.code AS project_code,
       f.planned, f.actual, f.committed, f.balance,
       f.data_modifica
FROM [cp].[facts] f
LEFT JOIN [xbs].[node]    n ON n.id = f.xbs_node_id
LEFT JOIN [core].[project] p ON p.id = f.project_id
WHERE f.program_id = @prog
  AND f.time_month_id BETWEEN @mf AND @mt
  AND (@scn IS NULL OR f.project_scenario_id = @scn)
  AND ISNULL(f.cancellato, 0) = 0
ORDER BY n.code, f.project_id, f.time_month_id;";
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@prog", programId);
        cmd.Parameters.AddWithValue("@scn", (object?)scenarioId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@mf", monthFrom);
        cmd.Parameters.AddWithValue("@mt", monthTo);

        var rows = new List<Dictionary<string, object?>>();
        await using (var rd = await cmd.ExecuteReaderAsync(ct))
        {
            while (await rd.ReadAsync(ct))
            {
                var r = new Dictionary<string, object?>();
                for (int i = 0; i < rd.FieldCount; i++)
                {
                    var v = rd.GetValue(i);
                    r[rd.GetName(i)] = v == DBNull.Value ? null : v;
                }
                rows.Add(r);
            }
        }
        return Ok(new
        {
            ok = true,
            programId,
            scenarioId,
            year = year ?? DateTime.UtcNow.Year,
            monthFrom,
            monthTo,
            rowCount = rows.Count,
            rows
        });
    }

    // ─── 3. Heartbeat lock TTL ────────────────────────────────────────────────
    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat([FromBody] HeartbeatRequest req, CancellationToken ct)
    {
        if (req == null || req.LockToken == Guid.Empty)
            return BadRequest(new { ok = false, error = "lockToken mancante" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
UPDATE [cp].[spreadsheet_lock]
   SET last_heartbeat_utc = SYSUTCDATETIME(),
       lock_expires_utc   = DATEADD(MINUTE, 30, SYSUTCDATETIME())
 WHERE lock_token = @t AND released_at_utc IS NULL;
SELECT @@ROWCOUNT, lock_expires_utc FROM [cp].[spreadsheet_lock] WHERE lock_token = @t;";
        cmd.Parameters.AddWithValue("@t", req.LockToken);

        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (!await rd.ReadAsync(ct)) return NotFound(new { ok = false, error = "Lock token non valido" });
        var affected = rd.GetInt32(0);
        if (affected == 0) return Gone(new { ok = false, error = "Lock scaduto o released" });
        return Ok(new { ok = true, lockExpiresUtc = rd.GetDateTime(1) });
    }
    public class HeartbeatRequest { public Guid LockToken { get; set; } }

    // ─── 4. Save cells (batch) ─────────────────────────────────────────────────
    public class SaveCellsRequest
    {
        public Guid LockToken { get; set; }
        public List<CellChange> Changes { get; set; } = new();
    }
    public class CellChange
    {
        public long FactsId { get; set; }
        public string Field { get; set; } = "";       // 'planned' | 'actual' | 'committed' | 'balance'
        public decimal? NewValue { get; set; }
    }
    [HttpPost("save-cells")]
    public async Task<IActionResult> SaveCells([FromBody] SaveCellsRequest req, CancellationToken ct)
    {
        if (req == null || req.LockToken == Guid.Empty || req.Changes.Count == 0)
            return BadRequest(new { ok = false, error = "lockToken + changes obbligatori" });

        var allowedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "planned", "actual", "committed", "balance" };
        foreach (var c in req.Changes)
        {
            if (!allowedFields.Contains(c.Field))
                return BadRequest(new { ok = false, error = $"Field '{c.Field}' non consentito. Ammessi: {string.Join(",", allowedFields)}" });
        }

        var userId = ResolveCurrentUserId();

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        // 1) Validate lock
        long lockId;
        await using (var lockCheck = cn.CreateCommand())
        {
            lockCheck.CommandText = "SELECT id, lock_expires_utc FROM [cp].[spreadsheet_lock] WHERE lock_token = @t AND released_at_utc IS NULL";
            lockCheck.Parameters.AddWithValue("@t", req.LockToken);
            await using var rd = await lockCheck.ExecuteReaderAsync(ct);
            if (!await rd.ReadAsync(ct)) return Conflict(new { ok = false, error = "Lock scaduto o non valido" });
            lockId = rd.GetInt64(0);
            if (rd.GetDateTime(1) < DateTime.UtcNow) return Conflict(new { ok = false, error = "Lock scaduto (lock_expires_utc < now)" });
        }

        int applied = 0, failed = 0;
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        try
        {
            foreach (var c in req.Changes)
            {
                // Log change BEFORE applying (capture old value)
                await using var logCmd = cn.CreateCommand();
                logCmd.Transaction = tx;
                logCmd.CommandText = $@"
DECLARE @old DECIMAL(19,4);
SELECT @old = [{c.Field}] FROM [cp].[facts] WHERE id = @fid;
INSERT INTO [cp].[spreadsheet_change_log] (lock_id, facts_id, time_month_id, program_id, cell_field, old_value, new_value, changed_by_user_id)
SELECT @lid, f.id, f.time_month_id, f.program_id, @field, @old, @new, @uid
FROM [cp].[facts] f WHERE f.id = @fid;
UPDATE [cp].[facts] SET [{c.Field}] = @new, data_modifica = SYSUTCDATETIME(), utente_modifica = @uid WHERE id = @fid AND ISNULL(cancellato,0)=0;
SELECT @@ROWCOUNT;";
                logCmd.Parameters.AddWithValue("@lid", lockId);
                logCmd.Parameters.AddWithValue("@fid", c.FactsId);
                logCmd.Parameters.AddWithValue("@field", c.Field);
                logCmd.Parameters.AddWithValue("@new", (object?)c.NewValue ?? DBNull.Value);
                logCmd.Parameters.AddWithValue("@uid", (object?)userId ?? DBNull.Value);
                var rows = (int)(await logCmd.ExecuteScalarAsync(ct) ?? 0);
                if (rows == 1) applied++; else failed++;
            }

            // Update cells_changed_count on lock
            await using var bumpCmd = cn.CreateCommand();
            bumpCmd.Transaction = tx;
            bumpCmd.CommandText = "UPDATE [cp].[spreadsheet_lock] SET cells_changed_count = cells_changed_count + @n, last_heartbeat_utc = SYSUTCDATETIME() WHERE id = @lid";
            bumpCmd.Parameters.AddWithValue("@n", applied);
            bumpCmd.Parameters.AddWithValue("@lid", lockId);
            await bumpCmd.ExecuteNonQueryAsync(ct);

            await tx.CommitAsync(ct);
            return Ok(new { ok = true, applied, failed, totalRequested = req.Changes.Count });
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _log.LogError(ex, "save-cells failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    // ─── 5. Release lock ──────────────────────────────────────────────────────
    [HttpPost("release-lock")]
    public async Task<IActionResult> ReleaseLock([FromBody] HeartbeatRequest req, CancellationToken ct)
    {
        if (req == null || req.LockToken == Guid.Empty)
            return BadRequest(new { ok = false, error = "lockToken mancante" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[spreadsheet_release_lock]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@lock_token", req.LockToken);
        var outParam = cmd.Parameters.Add("@released", SqlDbType.Int);
        outParam.Direction = ParameterDirection.Output;
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, released = (int)outParam.Value });
    }

    // ─── Task 3.2: Admin force-release ───────────────────────────────────────
    [HttpPost("admin-force-release")]
    public async Task<IActionResult> AdminForceRelease(
        [FromQuery] int programId, [FromQuery] int? year, CancellationToken ct)
    {
        // TODO: gating role-based (oggi solo log). In produzione, controllare User.IsInRole("admin").
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            UPDATE [cp].[spreadsheet_lock]
               SET released_at_utc = SYSUTCDATETIME()
             WHERE program_id = @program_id
               AND (year_num IS NULL OR year_num = @year_num)
               AND released_at_utc IS NULL;
            SELECT @@ROWCOUNT;";
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@year_num", (object?)year ?? DBNull.Value);
        var released = (int)((await cmd.ExecuteScalarAsync(ct)) ?? 0);
        _log.LogWarning("Admin force-release: programId={ProgramId} released={Released}", programId, released);
        return Ok(new { ok = true, released });
    }

    // ─── 6. Export xlsx ───────────────────────────────────────────────────────
    [HttpGet("export-xlsx/{programId:int}")]
    public async Task<IActionResult> ExportXlsx(int programId, [FromQuery] int? scenarioId, [FromQuery] int? year, CancellationToken ct)
    {
        // Reuse snapshot data
        var snapshotResult = await Snapshot(programId, scenarioId, year, ct);
        if (snapshotResult is not OkObjectResult ok) return snapshotResult;
        var payload = ok.Value;

        var outDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Upload", "spreadsheets"));
        if (!Directory.Exists(outDir)) Directory.CreateDirectory(outDir);
        var filename = $"plan_facts_{programId}_{year ?? DateTime.UtcNow.Year}_{Guid.NewGuid():N}.xlsx";
        var path = Path.Combine(outDir, filename);

        using (var doc = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook))
        {
            var wbPart = doc.AddWorkbookPart();
            wbPart.Workbook = new Workbook();
            var sheets = wbPart.Workbook.AppendChild(new Sheets());
            var wsPart = wbPart.AddNewPart<WorksheetPart>();
            var sd = new SheetData();
            wsPart.Worksheet = new Worksheet(sd);

            var hr = new Row();
            foreach (var h in new[] { "facts_id", "time_month_id", "xbs_code", "xbs_name", "project_code", "planned", "actual", "committed", "balance" })
                hr.Append(NewCell(h));
            sd.Append(hr);

            // Use reflection to walk anonymous payload rows
            var rowsField = payload?.GetType().GetProperty("rows")?.GetValue(payload) as IEnumerable<Dictionary<string, object?>>;
            if (rowsField != null)
            {
                foreach (var r in rowsField)
                {
                    var dr = new Row();
                    foreach (var k in new[] { "id", "time_month_id", "xbs_code", "xbs_name", "project_code", "planned", "actual", "committed", "balance" })
                        dr.Append(NewCell(r.TryGetValue(k, out var v) && v != null ? v.ToString() ?? "" : ""));
                    sd.Append(dr);
                }
            }
            sheets.Append(new Sheet { Id = wbPart.GetIdOfPart(wsPart), SheetId = 1, Name = "PlanFacts" });
            wbPart.Workbook.Save();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(path, ct);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
    }

    private static Cell NewCell(string text)
        => new Cell { DataType = CellValues.String, CellValue = new CellValue(text ?? "") };

    private IActionResult Gone(object value) => StatusCode(410, value);

    private int? ResolveCurrentUserId()
    {
        if (Request?.Headers?.TryGetValue("X-User-Id", out var headerVals) == true && int.TryParse(headerVals.ToString(), out var hid))
            return hid;
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
