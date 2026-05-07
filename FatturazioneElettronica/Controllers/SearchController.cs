using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #12: search globale cross-route.
///
/// Endpoint:
///   GET /api/search/global?q=&lt;query&gt;&top=&lt;n&gt;
///
/// Stored: dbo.sp_global_search(@q, @top)
/// Output: array di { entity_type, id, primary_label, secondary_label, route, score }
/// </summary>
[ApiController]
[Route("api/search")]
public class SearchController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    [HttpGet("global")]
    public IActionResult Global([FromQuery] string? q, [FromQuery] int top = 5)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Ok(new { ok = true, results = Array.Empty<object>() });

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_global_search", cn) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.AddWithValue("@q", q.Trim());
            cmd.Parameters.AddWithValue("@top", top);

            var results = new List<object>();
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                results.Add(new
                {
                    entity_type = reader["entity_type"]?.ToString(),
                    id = reader["id"] is DBNull ? 0 : Convert.ToInt32(reader["id"]),
                    primary_label = reader["primary_label"]?.ToString(),
                    secondary_label = reader["secondary_label"]?.ToString(),
                    route = reader["route"]?.ToString(),
                    score = reader["score"] is DBNull ? 0 : Convert.ToInt32(reader["score"])
                });
            }

            return Ok(new { ok = true, query = q, results });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
