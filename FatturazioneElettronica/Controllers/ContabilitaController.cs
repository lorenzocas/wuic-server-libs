using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #22 (Block 5): Export prima nota per software contabili.
///
/// Endpoint:
///   GET /api/contabilita/export-primanota?anno=2026&amp;mese=5&amp;tipo=TUTTI
///
/// Stored: dbo.sp_export_contabilita_primanota(@anno, @mese, @tipo)
/// Output: file pipe-delimited (16 campi) importabile in Profis/Zucchetti.
///
/// Parametri query string:
///   - anno: int (default = anno corrente)
///   - mese: int 1..12 (default = mese corrente; 0 = tutto l'anno)
///   - tipo: 'VENDITE' | 'ACQUISTI' | 'TUTTI' (default 'TUTTI')
/// </summary>
[ApiController]
[Route("api/contabilita")]
public class ContabilitaController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    [HttpGet("export-primanota")]
    public IActionResult ExportPrimanota(
        [FromQuery] int? anno = null,
        [FromQuery] int? mese = null,
        [FromQuery] string? tipo = "TUTTI")
    {
        var oggi = DateTime.Today;
        int annoEff = anno ?? oggi.Year;
        int meseEff = mese ?? oggi.Month;
        string tipoEff = string.IsNullOrWhiteSpace(tipo) ? "TUTTI" : tipo!.ToUpperInvariant();

        if (meseEff < 0 || meseEff > 12)
            return BadRequest(new { ok = false, error = "mese deve essere 0..12 (0 = anno intero)" });
        if (annoEff < 2000 || annoEff > 2100)
            return BadRequest(new { ok = false, error = "anno fuori range" });
        if (tipoEff != "TUTTI" && tipoEff != "VENDITE" && tipoEff != "ACQUISTI")
            return BadRequest(new { ok = false, error = "tipo deve essere TUTTI/VENDITE/ACQUISTI" });

        var sb = new StringBuilder();
        int rowCount = 0;
        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_export_contabilita_primanota", cn) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.AddWithValue("@anno", annoEff);
            cmd.Parameters.AddWithValue("@mese", meseEff);
            cmd.Parameters.AddWithValue("@tipo", tipoEff);

            using var rd = cmd.ExecuteReader();
            while (rd.Read())
            {
                sb.AppendLine(rd.GetString(0));
                rowCount++;
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }

        // Filename suggerito: primanota_2026_05_TUTTI.txt
        var filename = string.Format(CultureInfo.InvariantCulture,
            "primanota_{0:0000}_{1:00}_{2}.txt", annoEff, meseEff, tipoEff);

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        Response.Headers["X-Export-Rows"] = rowCount.ToString(CultureInfo.InvariantCulture);
        return File(bytes, "text/plain; charset=utf-8", filename);
    }
}
