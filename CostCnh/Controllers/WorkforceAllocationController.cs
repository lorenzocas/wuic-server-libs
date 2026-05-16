using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Task 8.1 — Workforce Allocation 2D matrix grid API (clone pattern PowerEdit).
///
/// Endpoints:
///   GET  /api/workforce-alloc/snapshot/{programId}?year=YYYY[&projectId=N]
///   POST /api/workforce-alloc/save-cells
///
/// Pattern: identico a PowerEdit ma flat (no hierarchy).
///   rows = resource × cols = 12 mesi × 3 measure (fte/hours/cost).
/// </summary>
[ApiController]
[Route("api/workforce-alloc")]
public class WorkforceAllocationController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<WorkforceAllocationController> _log;

    public WorkforceAllocationController(IConfiguration cfg, ILogger<WorkforceAllocationController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Snapshot ──────────────────────────────────────────────────────────
    [HttpGet("snapshot/{programId:int}")]
    public async Task<IActionResult> Snapshot(int programId, [FromQuery] int year, CancellationToken ct)
    {
        if (year < 2000 || year > 2200) return BadRequest(new { ok = false, error = "year out of range" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[wf].[sp_load_alloc_grid]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", programId);
        cmd.Parameters.AddWithValue("@year_num", year);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new
        {
            ok = true,
            programId, year,
            measures = new[] { "fte", "hours", "cost" },
            editableMeasures = new[] { "fte", "hours", "cost" },
            rowCount = rows.Count,
            rows
        });
    }

    // ─── 2. Save cells ───────────────────────────────────────────────────────
    public class AllocCellChange
    {
        public int ResourceId { get; set; }
        public byte MonthNum { get; set; }
        public string MeasureCode { get; set; } = "";       // 'fte' | 'hours' | 'cost'
        public decimal? NewValue { get; set; }
        public DateTime? LastSeenUtc { get; set; }          // optimistic concurrency
    }
    public class SaveCellsRequest
    {
        public int ProgramId { get; set; }
        public int Year { get; set; }
        public int? ProjectId { get; set; }
        public List<AllocCellChange> Changes { get; set; } = new();
    }

    [HttpPost("save-cells")]
    public async Task<IActionResult> SaveCells([FromBody] SaveCellsRequest req, CancellationToken ct)
    {
        if (req?.Changes == null || req.Changes.Count == 0)
            return Ok(new { ok = true, applied = 0, updatedRows = Array.Empty<object>() });

        var userId = ResolveCurrentUserId();
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "fte", "hours", "cost" };
        foreach (var c in req.Changes)
        {
            if (c.MonthNum < 1 || c.MonthNum > 12)
                return BadRequest(new { ok = false, error = $"month_num invalid: {c.MonthNum}" });
            if (!allowed.Contains(c.MeasureCode))
                return BadRequest(new { ok = false, error = $"measure_code invalid: '{c.MeasureCode}'. Allowed: fte|hours|cost" });
        }

        var tvp = new DataTable();
        tvp.Columns.Add("resource_id",   typeof(int));
        tvp.Columns.Add("month_num",     typeof(byte));
        tvp.Columns.Add("measure_code",  typeof(string));
        tvp.Columns.Add("new_value",     typeof(decimal));
        tvp.Columns.Add("last_seen_utc", typeof(DateTime));
        foreach (var c in req.Changes)
        {
            tvp.Rows.Add(
                c.ResourceId, c.MonthNum, c.MeasureCode.ToLowerInvariant(),
                (object?)c.NewValue ?? DBNull.Value,
                (object?)c.LastSeenUtc ?? DBNull.Value
            );
        }

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[wf].[sp_save_alloc_cells]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", req.ProgramId);
        cmd.Parameters.AddWithValue("@year_num", req.Year);
        cmd.Parameters.AddWithValue("@user_id", userId ?? 1);
        cmd.Parameters.AddWithValue("@project_id", (object?)req.ProjectId ?? DBNull.Value);
        var pTvp = cmd.Parameters.AddWithValue("@changes", tvp);
        pTvp.SqlDbType = SqlDbType.Structured;
        pTvp.TypeName = "[wf].[tvp_alloc_cell_changes]";

        var updatedRows = new List<Dictionary<string, object?>>();
        int applied = 0;
        try
        {
            await using var rd = await cmd.ExecuteReaderAsync(ct);
            while (await rd.ReadAsync(ct))
            {
                var row = ReadRow(rd);
                if (row.TryGetValue("applied", out var ap) && ap is int api) applied = api;
                row.Remove("applied");
                updatedRows.Add(row);
            }
        }
        catch (SqlException ex)
        {
            _log.LogError(ex, "WorkforceAlloc save-cells SQL error");
            if (ex.Message.Contains("Optimistic concurrency", StringComparison.OrdinalIgnoreCase))
                return StatusCode(409, new { ok = false, code = "STALE_SNAPSHOT", error = ex.Message });
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
        return Ok(new { ok = true, applied, updatedRows });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    private int? ResolveCurrentUserId()
    {
        var claim = User?.FindFirst("user_id")?.Value;
        if (int.TryParse(claim, out var uid)) return uid;
        return 1;
    }

    private static Dictionary<string, object?> ReadRow(SqlDataReader rd)
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < rd.FieldCount; i++)
            row[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
        return row;
    }
}
