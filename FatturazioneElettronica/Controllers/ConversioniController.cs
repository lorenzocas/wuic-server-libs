using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5: conversioni documento → documento (workflow #8).
///
/// Endpoint:
///   POST /api/conversioni/preventivo-to-fattura  → genera fattura inviata da preventivo
///
/// Stored:
///   dbo.sp_conv_preventivo_to_fattura(@preventivo_id, @user_id, @new_fattura_id OUTPUT)
///
/// Idempotency: se la causale "Da preventivo #N" esiste gia', ritorna l'id esistente
/// (non duplica). Lo stato del preventivo passa a 'CONVERTITO'.
/// </summary>
[ApiController]
[Route("api/conversioni")]
public class ConversioniController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class PreventivoToFatturaRequest
    {
        public int PreventivoId { get; set; }
        public string? UserId { get; set; }
    }

    public class GeneraSollecitiRequest
    {
        public int? GiorniMinDalUltimoSollecito { get; set; } = 7;
    }

    /// <summary>
    /// Workflow #11: genera record `email_log` PENDING per scadenze SCADUTA / APERTA-overdue.
    /// Il job invio mail processa poi i PENDING. Idempotente sui giorni minimi.
    /// </summary>
    [HttpPost("genera-solleciti")]
    public IActionResult GeneraSolleciti([FromBody] GeneraSollecitiRequest? req)
    {
        // Genera record email_log batch → admin gate (effetti reali downstream).
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_genera_solleciti_scadenze", cn)
            {
                CommandType = CommandType.StoredProcedure
            };
            cmd.Parameters.AddWithValue("@giorni_min_dal_ultimo_sollecito", (object?)req?.GiorniMinDalUltimoSollecito ?? 7);
            var outParam = new SqlParameter("@numero_solleciti_generati", SqlDbType.Int) { Direction = ParameterDirection.Output };
            cmd.Parameters.Add(outParam);

            cmd.ExecuteNonQuery();
            int n = outParam.Value is DBNull ? 0 : Convert.ToInt32(outParam.Value);

            return Ok(new { ok = true, generated = n });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpPost("preventivo-to-fattura")]
    public IActionResult PreventivoToFattura([FromBody] PreventivoToFatturaRequest req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (req.PreventivoId <= 0)
            return BadRequest(new { ok = false, error = "preventivo_id mancante" });

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_conv_preventivo_to_fattura", cn)
            {
                CommandType = CommandType.StoredProcedure
            };
            cmd.Parameters.AddWithValue("@preventivo_id", req.PreventivoId);
            cmd.Parameters.AddWithValue("@user_id", (object?)req.UserId ?? DBNull.Value);
            var outParam = new SqlParameter("@new_fattura_id", SqlDbType.Int) { Direction = ParameterDirection.Output };
            cmd.Parameters.Add(outParam);

            cmd.ExecuteNonQuery();
            int newFatturaId = outParam.Value is DBNull ? 0 : Convert.ToInt32(outParam.Value);

            if (newFatturaId <= 0)
                return StatusCode(500, new { ok = false, error = "stored procedure non ha valorizzato @new_fattura_id" });

            return Ok(new
            {
                ok = true,
                preventivo_id = req.PreventivoId,
                fattura_id = newFatturaId
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
