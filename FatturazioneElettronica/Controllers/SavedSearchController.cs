using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #19: Saved Searches per utente.
///
/// Endpoint:
///   GET    /api/saved-searches?route=&amp;user_id=
///   POST   /api/saved-searches { route, user_id, label, filter_json }
///   DELETE /api/saved-searches/{id}?user_id=
///
/// Tabella: dbo.user_saved_searches (DB Metadati).
/// </summary>
[ApiController]
[Route("api/saved-searches")]
public class SavedSearchController : ControllerBase
{
    private static string MetaConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("MetaDataSQLConnection")
        ?? throw new InvalidOperationException("MetaDataSQLConnection non configurata");

    public class SaveRequest
    {
        [JsonProperty("route")]      public string? Route { get; set; }
        [JsonProperty("user_id")]    public int? UserId { get; set; }
        [JsonProperty("label")]      public string? Label { get; set; }
        [JsonProperty("filter_json")] public string? FilterJson { get; set; }
    }

    [HttpGet]
    public IActionResult List([FromQuery] string? route, [FromQuery(Name = "user_id")] int? userId)
    {
        // user_id viene SEMPRE dal cookie auth, mai dal query/claim (IDOR defense).
        var gate = AuthGate.RequireAuth(out var authUserId);
        if (gate != null) return gate;
        var uid = int.Parse(authUserId);

        if (string.IsNullOrWhiteSpace(route))
            return BadRequest(new { ok = false, error = "route obbligatoria" });

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "SELECT id, label, filter_json, created_at, updated_at " +
                "FROM dbo.user_saved_searches " +
                "WHERE user_id = @uid AND route = @r " +
                "ORDER BY label", cn);
            cmd.Parameters.AddWithValue("@uid", uid);
            cmd.Parameters.AddWithValue("@r", route.Trim());

            var rows = new List<object>();
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                rows.Add(new
                {
                    id = Convert.ToInt32(reader["id"]),
                    label = reader["label"]?.ToString(),
                    filter_json = reader["filter_json"]?.ToString(),
                    created_at = reader["created_at"] is DBNull ? null : (DateTime?)Convert.ToDateTime(reader["created_at"]),
                    updated_at = reader["updated_at"] is DBNull ? null : (DateTime?)Convert.ToDateTime(reader["updated_at"])
                });
            }
            return Ok(new { ok = true, route = route.Trim(), user_id = uid, results = rows });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpPost]
    public IActionResult Save([FromBody] SaveRequest? req)
    {
        var gate = AuthGate.RequireAuth(out var authUserId);
        if (gate != null) return gate;
        var uid = int.Parse(authUserId);

        if (req == null || string.IsNullOrWhiteSpace(req.Route))
            return BadRequest(new { ok = false, error = "route obbligatoria" });
        if (string.IsNullOrWhiteSpace(req.Label))
            return BadRequest(new { ok = false, error = "label obbligatoria" });
        if (string.IsNullOrWhiteSpace(req.FilterJson))
            return BadRequest(new { ok = false, error = "filter_json obbligatorio" });

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "INSERT INTO dbo.user_saved_searches (user_id, route, label, filter_json) " +
                "OUTPUT INSERTED.id " +
                "VALUES (@uid, @r, @l, @fj)", cn);
            cmd.Parameters.AddWithValue("@uid", uid);
            cmd.Parameters.AddWithValue("@r", req.Route.Trim());
            cmd.Parameters.AddWithValue("@l", req.Label.Trim());
            cmd.Parameters.AddWithValue("@fj", req.FilterJson);

            var newId = (int)(cmd.ExecuteScalar() ?? 0);
            return Ok(new { ok = true, id = newId, label = req.Label.Trim() });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public IActionResult Delete([FromRoute] int id, [FromQuery(Name = "user_id")] int? userId)
    {
        var gate = AuthGate.RequireAuth(out var authUserId);
        if (gate != null) return gate;
        var uid = int.Parse(authUserId);

        try
        {
            using var cn = new SqlConnection(MetaConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "DELETE FROM dbo.user_saved_searches WHERE id = @id AND user_id = @uid", cn);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@uid", uid);
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
        var claimCandidates = new[] { ClaimTypes.NameIdentifier, "nameid", "sub", "user_id", "userid", "id" };
        foreach (var ct in claimCandidates)
        {
            var v = User?.FindFirst(ct)?.Value;
            if (int.TryParse(v, out var parsed)) return parsed;
        }
        if (Request?.Headers?.TryGetValue("X-User-Id", out var hv) == true &&
            int.TryParse(hv.ToString(), out var hp)) return hp;
        if (explicitId is > 0) return explicitId;
        return null;
    }
}
