using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #15: Dashboard widget configurabili per utente.
///
/// Endpoint:
///   GET    /api/board-pref?route=&lt;route&gt;&amp;user_id=&lt;id&gt;     -&gt; { ok, layout_json|null }
///   POST   /api/board-pref { route, user_id, layout_json }       -&gt; { ok, saved }
///   DELETE /api/board-pref?route=&lt;route&gt;&amp;user_id=&lt;id&gt;     -&gt; { ok, deleted }
///
/// Tabella: dbo.dom_board_user_pref (DB Metadati).
///
/// Auth: usa Claims/Header X-User-Id se presenti (compat con
/// FatturazioneElettronicaActionsController.ResolveLoggedUserId);
/// fallback al param `user_id` esplicito (test e2e).
/// </summary>
[ApiController]
[Route("api/board-pref")]
public class BoardPrefController : ControllerBase
{
    private static string MetaConn =>
        ConfigurationManager.ConnectionStrings["MetaDataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("MetaDataSQLConnection non configurata");

    public class SavePrefRequest
    {
        [JsonProperty("route")]
        public string? Route { get; set; }
        [JsonProperty("user_id")]
        public int? UserId { get; set; }
        [JsonProperty("layout_json")]
        public string? LayoutJson { get; set; }
    }

    [HttpGet]
    public IActionResult Get([FromQuery] string? route, [FromQuery(Name = "user_id")] int? userId)
    {
        if (string.IsNullOrWhiteSpace(route))
            return BadRequest(new { ok = false, error = "route obbligatoria" });

        var uid = ResolveUserId(userId);
        if (uid == null)
            return BadRequest(new { ok = false, error = "user_id non risolvibile" });

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "SELECT layout_json, updated_at FROM dbo.dom_board_user_pref WHERE user_id = @uid AND board_route = @r",
                cn);
            cmd.Parameters.AddWithValue("@uid", uid.Value);
            cmd.Parameters.AddWithValue("@r", route.Trim());

            using var reader = cmd.ExecuteReader();
            if (reader.Read())
            {
                return Ok(new
                {
                    ok = true,
                    layout_json = reader["layout_json"]?.ToString(),
                    updated_at = reader["updated_at"] is DBNull ? null : (DateTime?)Convert.ToDateTime(reader["updated_at"])
                });
            }

            return Ok(new { ok = true, layout_json = (string?)null });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpPost]
    public IActionResult Save([FromBody] SavePrefRequest? req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Route))
            return BadRequest(new { ok = false, error = "route obbligatoria" });
        if (string.IsNullOrWhiteSpace(req.LayoutJson))
            return BadRequest(new { ok = false, error = "layout_json obbligatorio" });

        var uid = ResolveUserId(req.UserId);
        if (uid == null)
            return BadRequest(new { ok = false, error = "user_id non risolvibile" });

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            // upsert: MERGE per atomicita'
            using var cmd = new SqlCommand(@"
                MERGE dbo.dom_board_user_pref AS tgt
                USING (SELECT @uid AS user_id, @r AS board_route) AS src
                   ON tgt.user_id = src.user_id AND tgt.board_route = src.board_route
                WHEN MATCHED THEN UPDATE SET layout_json = @lj, updated_at = GETDATE()
                WHEN NOT MATCHED THEN INSERT (user_id, board_route, layout_json, updated_at)
                                      VALUES (@uid, @r, @lj, GETDATE());", cn);
            cmd.Parameters.AddWithValue("@uid", uid.Value);
            cmd.Parameters.AddWithValue("@r", req.Route.Trim());
            cmd.Parameters.AddWithValue("@lj", req.LayoutJson);

            int rows = cmd.ExecuteNonQuery();
            return Ok(new { ok = true, saved = rows, user_id = uid.Value, route = req.Route.Trim() });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpDelete]
    public IActionResult Delete([FromQuery] string? route, [FromQuery(Name = "user_id")] int? userId)
    {
        if (string.IsNullOrWhiteSpace(route))
            return BadRequest(new { ok = false, error = "route obbligatoria" });

        var uid = ResolveUserId(userId);
        if (uid == null)
            return BadRequest(new { ok = false, error = "user_id non risolvibile" });

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "DELETE FROM dbo.dom_board_user_pref WHERE user_id = @uid AND board_route = @r", cn);
            cmd.Parameters.AddWithValue("@uid", uid.Value);
            cmd.Parameters.AddWithValue("@r", route.Trim());
            int rows = cmd.ExecuteNonQuery();
            return Ok(new { ok = true, deleted = rows });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    private int? ResolveUserId(int? explicitId)
    {
        // 1) Claims (auth real)
        var claimCandidates = new[] { ClaimTypes.NameIdentifier, "nameid", "sub", "user_id", "userid", "id" };
        foreach (var ct in claimCandidates)
        {
            var v = User?.FindFirst(ct)?.Value;
            if (int.TryParse(v, out var parsed)) return parsed;
        }

        // 2) Header X-User-Id (test/dev)
        if (Request?.Headers?.TryGetValue("X-User-Id", out var hv) == true &&
            int.TryParse(hv.ToString(), out var hp)) return hp;

        // 3) parametro esplicito (fallback test)
        if (explicitId is > 0) return explicitId;

        return null;
    }
}
