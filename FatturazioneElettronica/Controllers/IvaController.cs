using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #17: Riepilogo IVA periodico (LIPE-style).
///
/// Endpoint:
///   GET /api/iva/riepilogo?anno=2026&periodo=Q1
///
/// Stored: dbo.sp_riepilogo_iva_periodo(@anno, @periodo)
/// Output: array di { aliquota, imponibile_vendite, iva_vendite, num_fatture_emesse,
///                    imponibile_acquisti, iva_acquisti, num_fatture_ricevute, saldo_iva }
///         + totali aggregati (saldo complessivo, totale_imponibile_vendite, ecc.)
/// </summary>
[ApiController]
[Route("api/iva")]
public class IvaController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    [HttpGet("riepilogo")]
    public IActionResult Riepilogo([FromQuery] int? anno, [FromQuery] string? periodo)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (!anno.HasValue || anno < 1900 || anno > 9999)
            return BadRequest(new { ok = false, error = "anno obbligatorio (1900..9999)" });
        var p = string.IsNullOrWhiteSpace(periodo) ? "YEAR" : periodo.Trim().ToUpperInvariant();

        // Validation periodo: YEAR | Q1..Q4 | 01..12
        var valid = p == "YEAR" || p == "Q1" || p == "Q2" || p == "Q3" || p == "Q4"
                    || (int.TryParse(p, out var m) && m >= 1 && m <= 12);
        if (!valid)
            return BadRequest(new { ok = false, error = "periodo non valido. Atteso YEAR | Q1..Q4 | 01..12" });

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_riepilogo_iva_periodo", cn) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.AddWithValue("@anno", anno.Value);
            cmd.Parameters.AddWithValue("@periodo", p);

            var rows = new List<object>();
            decimal totImpV = 0, totIvaV = 0, totImpA = 0, totIvaA = 0;
            int totEmesse = 0, totRicevute = 0;

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                decimal aliquota = reader["aliquota"] is DBNull ? 0 : Convert.ToDecimal(reader["aliquota"]);
                decimal impV = reader["imponibile_vendite"] is DBNull ? 0 : Convert.ToDecimal(reader["imponibile_vendite"]);
                decimal ivaV = reader["iva_vendite"] is DBNull ? 0 : Convert.ToDecimal(reader["iva_vendite"]);
                int nE = reader["num_fatture_emesse"] is DBNull ? 0 : Convert.ToInt32(reader["num_fatture_emesse"]);
                decimal impA = reader["imponibile_acquisti"] is DBNull ? 0 : Convert.ToDecimal(reader["imponibile_acquisti"]);
                decimal ivaA = reader["iva_acquisti"] is DBNull ? 0 : Convert.ToDecimal(reader["iva_acquisti"]);
                int nR = reader["num_fatture_ricevute"] is DBNull ? 0 : Convert.ToInt32(reader["num_fatture_ricevute"]);
                decimal saldo = reader["saldo_iva"] is DBNull ? 0 : Convert.ToDecimal(reader["saldo_iva"]);

                totImpV += impV; totIvaV += ivaV; totEmesse += nE;
                totImpA += impA; totIvaA += ivaA; totRicevute += nR;

                rows.Add(new
                {
                    aliquota,
                    imponibile_vendite = impV,
                    iva_vendite = ivaV,
                    num_fatture_emesse = nE,
                    imponibile_acquisti = impA,
                    iva_acquisti = ivaA,
                    num_fatture_ricevute = nR,
                    saldo_iva = saldo
                });
            }

            return Ok(new
            {
                ok = true,
                anno = anno.Value,
                periodo = p,
                results = rows,
                totali = new
                {
                    imponibile_vendite = totImpV,
                    iva_vendite = totIvaV,
                    num_fatture_emesse = totEmesse,
                    imponibile_acquisti = totImpA,
                    iva_acquisti = totIvaA,
                    num_fatture_ricevute = totRicevute,
                    saldo_iva = totIvaV - totIvaA,
                    a_debito = (totIvaV - totIvaA) > 0,
                    a_credito = (totIvaV - totIvaA) < 0
                }
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
