using System.Data;
using System.Globalization;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Task 8.4 frontend — Workforce xlsx upload pipeline.
///
/// Endpoint:
///   POST /api/workforce-upload/parse           — multipart/form-data file upload, parse + staging insert
///   POST /api/workforce-upload/validate/{batch} — run validation SP
///   POST /api/workforce-upload/commit/{batch}   — commit valid rows
///   GET  /api/workforce-upload/{batch}          — read staging rows (UI verifica)
///
/// Excel schema atteso (header row 1):
///   program_id | project_id | year_num | month_num | resource_code | fte_percent | hours | cost_amount | currency_code
/// </summary>
[ApiController]
[Route("api/workforce-upload")]
public class WorkforceUploadController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<WorkforceUploadController> _log;

    public WorkforceUploadController(IConfiguration cfg, ILogger<WorkforceUploadController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Parse + staging insert ───────────────────────────────────────────
    [HttpPost("parse")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> Parse(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { ok = false, error = "file mancante" });

        var batchId = Guid.NewGuid();
        var userId = ResolveCurrentUserId() ?? 1;
        var parsed = new List<Dictionary<string, object?>>();

        try
        {
            using var stream = file.OpenReadStream();
            using var doc = SpreadsheetDocument.Open(stream, false);
            var wbPart = doc.WorkbookPart ?? throw new InvalidOperationException("Empty xlsx");
            var sheetEl = wbPart.Workbook.Descendants<Sheet>().FirstOrDefault() ?? throw new InvalidOperationException("No sheet");
            var wsPart = (WorksheetPart)wbPart.GetPartById(sheetEl.Id!);
            var sst = wbPart.SharedStringTablePart?.SharedStringTable;

            string GetCellText(Cell? c)
            {
                if (c == null || c.CellValue == null) return "";
                var raw = c.CellValue.InnerText;
                if (c.DataType?.Value == CellValues.SharedString && sst != null && int.TryParse(raw, out var idx))
                    return sst.ElementAt(idx).InnerText;
                return raw;
            }

            int ColIndex(string reference)
            {
                int col = 0;
                foreach (var ch in reference)
                    if (char.IsLetter(ch)) col = col * 26 + (char.ToUpperInvariant(ch) - 'A' + 1);
                return col;   // 1-based
            }

            var rows = wsPart.Worksheet.Descendants<Row>().ToList();
            if (rows.Count == 0) return BadRequest(new { ok = false, error = "Empty sheet" });

            // Header parsing (row 1)
            var hMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var cell in rows[0].Elements<Cell>())
            {
                var header = GetCellText(cell).Trim().ToLowerInvariant();
                var ref_ = cell.CellReference?.Value ?? "";
                if (!string.IsNullOrEmpty(header))
                    hMap[header] = ColIndex(System.Text.RegularExpressions.Regex.Replace(ref_, "[0-9]", ""));
            }

            var required = new[] { "program_id", "year_num", "month_num", "resource_code" };
            foreach (var r in required)
                if (!hMap.ContainsKey(r))
                    return BadRequest(new { ok = false, error = $"Header mancante: {r}" });

            string? GetCellByCol(Row row, int colIdx)
            {
                foreach (var c in row.Elements<Cell>())
                {
                    var ref_ = c.CellReference?.Value ?? "";
                    var cIdx = ColIndex(System.Text.RegularExpressions.Regex.Replace(ref_, "[0-9]", ""));
                    if (cIdx == colIdx) return GetCellText(c);
                }
                return null;
            }

            await using var cn = new SqlConnection(_dataCs);
            await cn.OpenAsync(ct);
            await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
            try
            {
                for (int i = 1; i < rows.Count; i++)
                {
                    var row = rows[i];
                    string? programIdStr = GetCellByCol(row, hMap["program_id"]);
                    if (string.IsNullOrWhiteSpace(programIdStr)) continue;   // skip empty row

                    int programId = int.Parse(programIdStr, CultureInfo.InvariantCulture);
                    int? projectId = hMap.ContainsKey("project_id") && int.TryParse(GetCellByCol(row, hMap["project_id"]), out var p) ? p : null;
                    int yearNum = int.Parse(GetCellByCol(row, hMap["year_num"]) ?? "0", CultureInfo.InvariantCulture);
                    int monthNum = int.Parse(GetCellByCol(row, hMap["month_num"]) ?? "0", CultureInfo.InvariantCulture);
                    string resourceCode = GetCellByCol(row, hMap["resource_code"])?.Trim() ?? "";
                    decimal? fte = hMap.ContainsKey("fte_percent") && decimal.TryParse(GetCellByCol(row, hMap["fte_percent"]), NumberStyles.Any, CultureInfo.InvariantCulture, out var f) ? f : null;
                    decimal? hours = hMap.ContainsKey("hours") && decimal.TryParse(GetCellByCol(row, hMap["hours"]), NumberStyles.Any, CultureInfo.InvariantCulture, out var h) ? h : null;
                    decimal? cost = hMap.ContainsKey("cost_amount") && decimal.TryParse(GetCellByCol(row, hMap["cost_amount"]), NumberStyles.Any, CultureInfo.InvariantCulture, out var co) ? co : null;
                    string? currencyCode = hMap.ContainsKey("currency_code") ? GetCellByCol(row, hMap["currency_code"])?.Trim() : null;

                    await using var ins = cn.CreateCommand();
                    ins.Transaction = tx;
                    ins.CommandText = @"
                        INSERT INTO [uploads].[wf_allocation_staging] (
                            upload_batch_id, program_id, project_id, year_num, month_num,
                            resource_code, fte_percent, hours, cost_amount, currency_code, uploaded_by
                        ) VALUES (@batch, @prog, @proj, @yr, @mo, @rc, @fte, @hrs, @cost, @cc, @uid)";
                    ins.Parameters.AddWithValue("@batch", batchId);
                    ins.Parameters.AddWithValue("@prog", programId);
                    ins.Parameters.AddWithValue("@proj", (object?)projectId ?? DBNull.Value);
                    ins.Parameters.AddWithValue("@yr", yearNum);
                    ins.Parameters.AddWithValue("@mo", (byte)monthNum);
                    ins.Parameters.AddWithValue("@rc", resourceCode);
                    ins.Parameters.AddWithValue("@fte", (object?)fte ?? DBNull.Value);
                    ins.Parameters.AddWithValue("@hrs", (object?)hours ?? DBNull.Value);
                    ins.Parameters.AddWithValue("@cost", (object?)cost ?? DBNull.Value);
                    ins.Parameters.AddWithValue("@cc", (object?)currencyCode ?? DBNull.Value);
                    ins.Parameters.AddWithValue("@uid", userId);
                    await ins.ExecuteNonQueryAsync(ct);

                    parsed.Add(new() {
                        { "program_id", programId }, { "year_num", yearNum }, { "month_num", monthNum },
                        { "resource_code", resourceCode }, { "fte_percent", fte },
                    });
                }
                await tx.CommitAsync(ct);
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Workforce xlsx parse failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }

        return Ok(new { ok = true, batchId, parsedCount = parsed.Count, preview = parsed.Take(10) });
    }

    // ─── 2. Validate ─────────────────────────────────────────────────────────
    [HttpPost("validate/{batchId:guid}")]
    public async Task<IActionResult> Validate(Guid batchId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[uploads].[sp_validate_wf_alloc_batch]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@batch_id", batchId);
        var pV = cmd.Parameters.Add("@valid_count", SqlDbType.Int); pV.Direction = ParameterDirection.Output;
        var pI = cmd.Parameters.Add("@invalid_count", SqlDbType.Int); pI.Direction = ParameterDirection.Output;
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, batchId, valid = (int)pV.Value, invalid = (int)pI.Value });
    }

    // ─── 3. Commit ───────────────────────────────────────────────────────────
    [HttpPost("commit/{batchId:guid}")]
    public async Task<IActionResult> Commit(Guid batchId, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId() ?? 1;
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[uploads].[sp_commit_wf_alloc_batch]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@batch_id", batchId);
        cmd.Parameters.AddWithValue("@user_id", userId);
        var pC = cmd.Parameters.Add("@committed_count", SqlDbType.Int); pC.Direction = ParameterDirection.Output;
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, batchId, committed = (int)pC.Value });
    }

    // ─── 4. List staging rows ────────────────────────────────────────────────
    [HttpGet("{batchId:guid}")]
    public async Task<IActionResult> ListStaging(Guid batchId, [FromQuery] string? status, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT id, program_id, project_id, year_num, month_num, resource_code,
                   fte_percent, hours, cost_amount, currency_code,
                   resolved_resource_id, resolved_currency_id,
                   validation_status, validation_error
              FROM [uploads].[wf_allocation_staging]
             WHERE upload_batch_id = @batch
               AND (@status IS NULL OR validation_status = @status)
             ORDER BY id";
        cmd.Parameters.AddWithValue("@batch", batchId);
        cmd.Parameters.AddWithValue("@status", (object?)status ?? DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            var r = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rd.FieldCount; i++)
                r[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
            rows.Add(r);
        }
        return Ok(new { ok = true, batchId, count = rows.Count, rows });
    }

    private int? ResolveCurrentUserId()
    {
        var claim = User?.FindFirst("user_id")?.Value;
        if (int.TryParse(claim, out var uid)) return uid;
        return null;
    }
}
