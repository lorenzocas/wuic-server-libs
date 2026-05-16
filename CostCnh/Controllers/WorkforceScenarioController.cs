using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Task 8.3 frontend — Workforce scenario manager API.
///
/// Endpoints:
///   GET  /api/workforce-scenario/list/{programId}      — lista scenarios per program
///   POST /api/workforce-scenario/branch                — crea nuovo scenario (snapshot)
///   POST /api/workforce-scenario/promote/{scenarioId}  — promote come active
///   GET  /api/workforce-scenario/diff?a=N&b=M          — diff tra 2 scenari
/// </summary>
[ApiController]
[Route("api/workforce-scenario")]
public class WorkforceScenarioController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<WorkforceScenarioController> _log;

    public WorkforceScenarioController(IConfiguration cfg, ILogger<WorkforceScenarioController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    [HttpGet("list/{programId:int}")]
    public async Task<IActionResult> List(int programId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT s.id, s.program_id, s.scenario_code, s.scenario_name, s.descr, s.status,
                   s.parent_scenario_id, parent.scenario_code AS parent_code,
                   s.is_baseline, s.captured_at_utc, s.captured_by_user_id,
                   s.promoted_at_utc, s.promoted_by_user_id,
                   (SELECT COUNT(*) FROM [wf].[allocation_history] h WHERE h.scenario_id = s.id) AS allocation_count
              FROM [wf].[allocation_scenario] s
              LEFT JOIN [wf].[allocation_scenario] parent ON parent.id = s.parent_scenario_id
             WHERE s.program_id = @prog AND ISNULL(s.cancellato, 0) = 0
             ORDER BY s.captured_at_utc DESC";
        cmd.Parameters.AddWithValue("@prog", programId);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            var r = new Dictionary<string, object?>();
            for (int i = 0; i < rd.FieldCount; i++) r[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
            rows.Add(r);
        }
        return Ok(new { ok = true, count = rows.Count, scenarios = rows });
    }

    public class BranchRequest
    {
        public int ProgramId { get; set; }
        public string ScenarioCode { get; set; } = "";
        public string ScenarioName { get; set; } = "";
        public int? ParentScenarioId { get; set; }
    }
    [HttpPost("branch")]
    public async Task<IActionResult> Branch([FromBody] BranchRequest req, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[wf].[sp_branch_workforce_scenario]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@program_id", req.ProgramId);
        cmd.Parameters.AddWithValue("@new_scenario_code", req.ScenarioCode);
        cmd.Parameters.AddWithValue("@new_scenario_name", req.ScenarioName);
        cmd.Parameters.AddWithValue("@parent_scenario_id", (object?)req.ParentScenarioId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@user_id", userId ?? 1);
        var pOut = cmd.Parameters.Add("@new_scenario_id", SqlDbType.Int); pOut.Direction = ParameterDirection.Output;
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, scenarioId = (int)pOut.Value });
    }

    [HttpPost("promote/{scenarioId:int}")]
    public async Task<IActionResult> Promote(int scenarioId, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[wf].[sp_promote_workforce_scenario]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@scenario_id", scenarioId);
        cmd.Parameters.AddWithValue("@user_id", userId ?? 1);
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, scenarioId, promoted = true });
    }

    [HttpGet("diff")]
    public async Task<IActionResult> Diff([FromQuery] int a, [FromQuery] int b, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[wf].[sp_diff_workforce_scenarios]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@scenario_a", a);
        cmd.Parameters.AddWithValue("@scenario_b", b);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            var r = new Dictionary<string, object?>();
            for (int i = 0; i < rd.FieldCount; i++) r[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
            rows.Add(r);
        }
        return Ok(new { ok = true, a, b, count = rows.Count, diff = rows });
    }

    private int? ResolveCurrentUserId()
    {
        var claim = User?.FindFirst("user_id")?.Value;
        if (int.TryParse(claim, out var uid)) return uid;
        return null;
    }
}
