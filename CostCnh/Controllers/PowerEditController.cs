using System.Data;
using System.IO;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Phase H — PowerEdit hierarchical pivot grid API.
///
/// Sostituisce il legacy PowerEditController.cs (1147 LoC) della Cost_CNH MVC
/// app, con grid XBS x time hierarchical (rows = nodi XBS, cols = 12 mesi x
/// 4 facet planned/actual/forecast/baseline).
///
/// LOCK: riusa l'endpoint <c>/api/spreadsheet/lock-range/{programId}</c> di
/// <see cref="SpreadsheetController"/> (DRY — la concorrenza pessimistic e' la
/// stessa). Questo controller fornisce SOLO i 2 endpoint data-specific:
///   - GET  /api/power-edit/snapshot/{programId}?year=YYYY
///   - POST /api/power-edit/save-cells
///
/// Backend SP (vedi dbms/schema/97-power-edit-pivot.sql):
///   - cp.sp_load_power_edit         — read snapshot (materialized table)
///   - cp.sp_save_power_edit_cells   — delta-update + ancestor refresh (TVP)
///   - cp.sp_rebuild_power_edit_pivot — nightly via scheduler
/// </summary>
[ApiController]
[Route("api/power-edit")]
public class PowerEditController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<PowerEditController> _log;

    public PowerEditController(IConfiguration cfg, ILogger<PowerEditController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Snapshot ──────────────────────────────────────────────────────────
    // Ritorna le righe pivot ordinate depth-first (hierarchyid asc).
    // Il client (Angular PowerEditComponent) costruisce il TreeNode[] tramite
    // parent_node_id come self-FK.
    [HttpGet("snapshot/{programId:int}")]
    public async Task<IActionResult> Snapshot(int programId, [FromQuery] int year,
                                              [FromQuery] int? scenarioId,
                                              [FromQuery] int? targetCurrencyId,    // Task 11.4
                                              CancellationToken ct)
    {
        if (year < 2000 || year > 2200) return BadRequest(new { ok = false, error = "year fuori range" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[sp_load_power_edit]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@year_num", year);
        // H.10: scenario_id NULL = cached pivot, INT = on-the-fly aggregation
        cmd.Parameters.AddWithValue("@project_scenario_id", (object?)scenarioId ?? DBNull.Value);
        // Task 11.4: target currency NULL = raw, INT = applica fn_convert_currency strict
        cmd.Parameters.AddWithValue("@target_currency_id", (object?)targetCurrencyId ?? DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        await using (var rd = await cmd.ExecuteReaderAsync(ct))
        {
            while (await rd.ReadAsync(ct))
            {
                rows.Add(ReadPivotRow(rd));
            }
        }

        return Ok(new
        {
            ok = true,
            programId,
            year,
            scenarioId = (int?)scenarioId,
            targetCurrencyId = (int?)targetCurrencyId,
            mode = scenarioId.HasValue ? "scenario-scoped (on-the-fly)" : "all-scenarios (cached)",
            currencyMode = targetCurrencyId.HasValue ? "converted" : "raw",
            facets = new[] { "planned", "actual", "forecast", "baseline" },
            editableFacets = targetCurrencyId.HasValue ? Array.Empty<string>() : new[] { "planned", "actual", "forecast" },
            rowCount = rows.Count,
            rows
        });
    }

    // ─── Task 3.4 — Audit log read API ───────────────────────────────────────
    [HttpGet("audit/{programId:int}")]
    public async Task<IActionResult> ReadAudit(
        int programId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? userId,
        [FromQuery] string? cellField,
        [FromQuery] long? xbsNodeId,
        [FromQuery] int limit = 200,
        CancellationToken ct = default)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[sp_read_change_log]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@from_utc", (object?)from ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@to_utc", (object?)to ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@user_id", (object?)userId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cell_field", (object?)cellField ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@xbs_node_id", (object?)xbsNodeId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@limit", Math.Clamp(limit, 1, 5000));

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadPivotRow(rd));
        return Ok(new { ok = true, count = rows.Count, entries = rows });
    }

    [HttpGet("audit/{programId:int}/stats")]
    public async Task<IActionResult> AuditStats(
        int programId,
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        CancellationToken ct = default)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT * FROM [cp].[fn_change_log_stats](@p, @f, @t)";
        cmd.Parameters.AddWithValue("@p", programId);
        cmd.Parameters.AddWithValue("@f", from);
        cmd.Parameters.AddWithValue("@t", to);
        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadPivotRow(rd));
        return Ok(new { ok = true, count = rows.Count, stats = rows });
    }

    // ─── Task 2.4 — Excel xlsx export ─────────────────────────────────────────
    [HttpGet("export-xlsx/{programId:int}")]
    public async Task<IActionResult> ExportXlsx(int programId, [FromQuery] int year, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[sp_load_power_edit]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@year_num", year);
        cmd.Parameters.AddWithValue("@project_scenario_id", DBNull.Value);
        cmd.Parameters.AddWithValue("@target_currency_id", DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadPivotRow(rd));

        // Build xlsx via DocumentFormat.OpenXml
        using var mem = new MemoryStream();
        using (var doc = SpreadsheetDocument.Create(mem, DocumentFormat.OpenXml.SpreadsheetDocumentType.Workbook))
        {
            var wbPart = doc.AddWorkbookPart();
            wbPart.Workbook = new Workbook();
            var wsPart = wbPart.AddNewPart<WorksheetPart>();
            var sd = new SheetData();
            wsPart.Worksheet = new Worksheet(sd);

            var sheets = wbPart.Workbook.AppendChild(new Sheets());
            sheets.Append(new Sheet { Id = wbPart.GetIdOfPart(wsPart), SheetId = 1, Name = $"PowerEdit_{year}" });

            // Header row: XBS + 48 monthly facets
            var header = new Row();
            header.Append(NewCell("XBS Code"), NewCell("XBS Name"), NewCell("Depth"), NewCell("Is Leaf"));
            string[] facets = { "pl", "ac", "fc", "bl" };
            string[] facetLabels = { "Plan", "Actual", "Forecast", "Baseline" };
            for (int m = 1; m <= 12; m++)
                for (int fi = 0; fi < 4; fi++)
                    header.Append(NewCell($"{facetLabels[fi]} M{m}"));
            sd.Append(header);

            foreach (var r in rows)
            {
                var row = new Row();
                row.Append(NewCell(r.GetValueOrDefault("xbs_code")?.ToString() ?? ""));
                row.Append(NewCell(r.GetValueOrDefault("xbs_name")?.ToString() ?? ""));
                row.Append(NewCell(r.GetValueOrDefault("xbs_depth")?.ToString() ?? ""));
                row.Append(NewCell(r.GetValueOrDefault("is_leaf")?.ToString() ?? ""));
                for (int m = 1; m <= 12; m++)
                    foreach (var f in facets)
                    {
                        var v = r.GetValueOrDefault($"{f}_m{m}");
                        row.Append(NewNumCell(v));
                    }
                sd.Append(row);
            }
        }
        mem.Position = 0;
        return File(mem.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"PowerEdit_P{programId}_Y{year}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx");
    }

    private static Cell NewCell(string text)
    {
        return new Cell
        {
            DataType = CellValues.InlineString,
            InlineString = new InlineString(new DocumentFormat.OpenXml.Spreadsheet.Text(text ?? ""))
        };
    }
    private static Cell NewNumCell(object? v)
    {
        if (v == null) return new Cell { DataType = CellValues.InlineString, InlineString = new InlineString(new DocumentFormat.OpenXml.Spreadsheet.Text("")) };
        return new Cell { DataType = CellValues.Number, CellValue = new CellValue(v.ToString() ?? "") };
    }

    // ─── Task 2.4 — Excel xlsx import (parse + return preview, no auto-commit) ─
    [HttpPost("import-xlsx/{programId:int}")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> ImportXlsx(int programId, [FromQuery] int year, IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0) return BadRequest(new { ok = false, error = "file mancante" });

        var parsed = new List<Dictionary<string, object?>>();
        try
        {
            using var stream = file.OpenReadStream();
            using var doc = SpreadsheetDocument.Open(stream, false);
            var wbPart = doc.WorkbookPart!;
            var wsPart = (WorksheetPart)wbPart.GetPartById(wbPart.Workbook.Descendants<Sheet>().First().Id!);
            var sst = wbPart.SharedStringTablePart?.SharedStringTable;
            string GetText(Cell c) {
                if (c?.CellValue == null) return "";
                var raw = c.CellValue.InnerText;
                if (c.DataType?.Value == CellValues.SharedString && sst != null && int.TryParse(raw, out var idx))
                    return sst.ElementAt(idx).InnerText;
                return raw;
            }
            var rows = wsPart.Worksheet.Descendants<Row>().ToList();
            if (rows.Count < 2) return Ok(new { ok = true, programId, year, parsed });
            // skip header row 0, parse data rows
            for (int i = 1; i < rows.Count && i <= 100; i++)
            {
                var cells = rows[i].Elements<Cell>().ToList();
                if (cells.Count == 0) continue;
                parsed.Add(new() {
                    { "xbs_code", cells.Count > 0 ? GetText(cells[0]) : null },
                    { "xbs_name", cells.Count > 1 ? GetText(cells[1]) : null },
                    { "pl_m1", cells.Count > 4 ? GetText(cells[4]) : null },
                });
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Import xlsx failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
        return Ok(new { ok = true, programId, year, parsedCount = parsed.Count, preview = parsed.Take(20) });
    }

    // ─── Currency list helper (per UI dropdown) ──────────────────────────────
    [HttpGet("currencies")]
    public async Task<IActionResult> ListCurrencies(CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT id, code, symbol, name FROM [core].[currency] WHERE ISNULL(cancellato, 0) = 0 ORDER BY code";
        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadPivotRow(rd));
        return Ok(new { ok = true, currencies = rows });
    }

    // ─── 2. Save-cells (batch) ────────────────────────────────────────────────
    public class CellChange
    {
        public long XbsNodeId { get; set; }
        public byte MonthNum { get; set; }      // 1..12
        public string FacetCode { get; set; } = ""; // "planned" | "actual" | "forecast" (baseline RO)
        public decimal? NewValue { get; set; }
    }
    public class SaveCellsRequest
    {
        public int ProgramId { get; set; }
        public int Year { get; set; }
        public int? ScenarioId { get; set; }      // H.10: NULL = default (no scenario filter)
        public string? LockToken { get; set; }
        public List<CellChange> Changes { get; set; } = new();
    }

    [HttpPost("save-cells")]
    public async Task<IActionResult> SaveCells([FromBody] SaveCellsRequest req, CancellationToken ct)
    {
        if (req == null) return BadRequest(new { ok = false, error = "body mancante" });
        if (req.Changes == null || req.Changes.Count == 0)
            return Ok(new { ok = true, applied = 0, failed = 0, updatedRows = Array.Empty<object>() });

        var userId = ResolveCurrentUserId();
        if (userId == null) return Unauthorized(new { ok = false, error = "user non risolvibile" });

        // Validazione: month 1..12, facet ammessi
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "planned", "actual", "forecast" };
        foreach (var c in req.Changes)
        {
            if (c.MonthNum < 1 || c.MonthNum > 12)
                return BadRequest(new { ok = false, error = $"month_num invalid: {c.MonthNum}" });
            if (!allowed.Contains(c.FacetCode))
                return BadRequest(new { ok = false, error = $"facet_code invalid: '{c.FacetCode}'. Allowed: planned|actual|forecast" });
            if (c.XbsNodeId <= 0)
                return BadRequest(new { ok = false, error = $"xbs_node_id invalid: {c.XbsNodeId}" });
        }

        // H.8: parse lockToken (UNIQUEIDENTIFIER) per hard gating server-side.
        // Se passato e non parsable, return 400. Se NULL/empty, il SP gira in
        // legacy mode (best-effort) — utile per scenari amministrativi.
        Guid? lockTokenGuid = null;
        if (!string.IsNullOrWhiteSpace(req.LockToken))
        {
            if (!Guid.TryParse(req.LockToken, out var lt))
                return BadRequest(new { ok = false, error = $"lockToken non e' un GUID valido: '{req.LockToken}'" });
            lockTokenGuid = lt;
        }

        // Costruisci TVP
        var tvp = new DataTable();
        tvp.Columns.Add("xbs_node_id", typeof(long));
        tvp.Columns.Add("month_num", typeof(byte));
        tvp.Columns.Add("facet_code", typeof(string));
        tvp.Columns.Add("new_value", typeof(decimal));
        foreach (var c in req.Changes)
        {
            tvp.Rows.Add(c.XbsNodeId, c.MonthNum, c.FacetCode.ToLowerInvariant(),
                         (object?)c.NewValue ?? DBNull.Value);
        }

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[sp_save_power_edit_cells]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", req.ProgramId);
        cmd.Parameters.AddWithValue("@year_num", req.Year);
        cmd.Parameters.AddWithValue("@user_id", userId.Value);
        var pTvp = cmd.Parameters.AddWithValue("@changes", tvp);
        pTvp.SqlDbType = SqlDbType.Structured;
        pTvp.TypeName = "[cp].[tvp_power_edit_cell_changes]";
        // H.8: lock token (NULL = legacy best-effort mode)
        cmd.Parameters.AddWithValue("@lock_token", (object?)lockTokenGuid ?? DBNull.Value);
        // H.10: scenario_id (NULL = default no scenario filter)
        cmd.Parameters.AddWithValue("@project_scenario_id", (object?)req.ScenarioId ?? DBNull.Value);

        var updatedRows = new List<Dictionary<string, object?>>();
        int applied = 0, failed = 0;
        try
        {
            await using var rd = await cmd.ExecuteReaderAsync(ct);
            while (await rd.ReadAsync(ct))
            {
                var row = ReadPivotRow(rd);
                if (row.TryGetValue("applied", out var ap) && ap is int api) applied = api;
                if (row.TryGetValue("failed", out var fl) && fl is int fai) failed = fai;
                row.Remove("applied"); row.Remove("failed");
                updatedRows.Add(row);
            }
        }
        catch (SqlException ex)
        {
            _log.LogError(ex, "PowerEdit save-cells SQL error");
            // H.8: lock validation RAISERROR → ritorna 403 (Forbidden) cosi'
            // il client puo' distinguere lock-expired (chiede re-acquire) da
            // server errors (retry).
            if (ex.Message.Contains("Lock token validation failed", StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { ok = false, error = ex.Message, code = "LOCK_INVALID" });
            // Rifiuti soft (non-leaf, baseline RO)
            if (ex.Message.Contains("non-leaf", StringComparison.OrdinalIgnoreCase) ||
                ex.Message.Contains("Baseline e read-only", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { ok = false, error = ex.Message, code = "VALIDATION" });
            return StatusCode(500, new { ok = false, error = ex.Message });
        }

        return Ok(new { ok = true, applied, failed, updatedRows });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private int? ResolveCurrentUserId()
    {
        // Pattern allineato a SpreadsheetController.ResolveCurrentUserId:
        // legge user-id da cookie/claims (RawHelpers fa il binding via k-user).
        // Per ora: usa user_id dal claim 'user_id' o fallback 1 (dev).
        var claim = User?.FindFirst("user_id")?.Value;
        if (int.TryParse(claim, out var uid)) return uid;
        return 1; // dev fallback
    }

    private static Dictionary<string, object?> ReadPivotRow(SqlDataReader rd)
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < rd.FieldCount; i++)
        {
            var name = rd.GetName(i);
            var val = rd.IsDBNull(i) ? null : rd.GetValue(i);
            row[name] = val;
        }
        return row;
    }
}
