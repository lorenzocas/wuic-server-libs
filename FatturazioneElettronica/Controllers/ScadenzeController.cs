using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #14: bulk actions su scadenze.
///
/// Endpoint:
///   POST /api/scadenze/marca-pagate  body { Ids: number[] }
///
/// Stored: dbo.sp_marca_scadenze_pagate(@ids_csv, @aggiornate OUTPUT)
/// </summary>
[ApiController]
[Route("api/scadenze")]
public class ScadenzeController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class MarcaPagateRequest
    {
        public int[]? Ids { get; set; }
    }

    [HttpPost("marca-pagate")]
    public IActionResult MarcaPagate([FromBody] MarcaPagateRequest? req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        var ids = req?.Ids ?? Array.Empty<int>();
        if (ids.Length == 0)
            return BadRequest(new { ok = false, error = "Nessun id selezionato" });

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_marca_scadenze_pagate", cn) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.AddWithValue("@ids_csv", string.Join(",", ids));
            var outParam = new SqlParameter("@aggiornate", SqlDbType.Int) { Direction = ParameterDirection.Output };
            cmd.Parameters.Add(outParam);

            cmd.ExecuteNonQuery();
            int n = outParam.Value is DBNull ? 0 : Convert.ToInt32(outParam.Value);
            return Ok(new { ok = true, updated = n, requested = ids.Length });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
