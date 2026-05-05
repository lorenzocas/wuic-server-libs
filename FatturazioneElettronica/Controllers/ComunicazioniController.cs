using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Text;
using System.Xml;
using Microsoft.AspNetCore.Mvc;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5: comunicazioni finanziarie (LIPE + esterometro).
///
/// Endpoint:
///   GET  /api/comunicazioni/lipe?anno=2026&trimestre=1   -> dati LIPE trimestre
///   GET  /api/comunicazioni/lipeXml?anno=2026&trimestre=1 -> XML LIPE
///   GET  /api/comunicazioni/esterometro?anno=2026&mese=3 -> operazioni estere periodo
///
/// Stored: dbo.sp_lipe_aggregate_quarter, dbo.sp_esterometro_period
///
/// **Limite scaffolding**: l'XML LIPE prodotto e' una struttura
/// minimale conforme alla traccia AdE 27/03/2020 ma NON sostituisce
/// il pacchetto di firma + sigillatura richiesto per l'invio
/// effettivo. Per produzione integrare:
///   - mapping completo dei campi opzionali (ContribuenteIVAGruppo,
///     ContribuenteEnteCommerciale, ecc.)
///   - validazione XSD `Trasmissione_Liquidazioni_Periodiche.xsd`
///   - firma CADES o XADES
///   - invio tramite Desktop Telematico AdE / Entratel
/// </summary>
[ApiController]
[Route("api/comunicazioni")]
public class ComunicazioniController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    [HttpGet("lipe")]
    public IActionResult GetLipe([FromQuery] int anno, [FromQuery] int trimestre)
    {
        if (trimestre < 1 || trimestre > 4)
            return BadRequest(new { ok = false, error = "trimestre deve essere 1..4" });

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("dbo.sp_lipe_aggregate_quarter", cn) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@anno", anno);
        cmd.Parameters.AddWithValue("@trimestre", trimestre);
        using var rdr = cmd.ExecuteReader();
        if (!rdr.Read()) return Ok(new { ok = true, data = (object?)null });
        var d = new Dictionary<string, object?>();
        for (int i = 0; i < rdr.FieldCount; i++)
            d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
        return Ok(new { ok = true, data = d });
    }

    [HttpGet("lipeXml")]
    public IActionResult GetLipeXml([FromQuery] int anno, [FromQuery] int trimestre)
    {
        var lipeData = GetLipeRaw(anno, trimestre);
        if (lipeData == null) return NotFound(new { ok = false, error = "Nessun dato per il trimestre" });

        var sb = new StringBuilder();
        var settings = new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false) };
        using var sw = new StringWriter(sb);
        using (var w = XmlWriter.Create(sw, settings))
        {
            w.WriteStartDocument();
            w.WriteStartElement("Comunicazione");
            w.WriteAttributeString("identificativo", $"LIPE-{anno}-T{trimestre}");

            w.WriteStartElement("Frontespizio");
            w.WriteElementString("CodiceFiscale", "00000000000");  // TODO: leggere da config azienda
            w.WriteElementString("AnnoImposta", anno.ToString());
            w.WriteEndElement();

            w.WriteStartElement("Comunicazione");
            w.WriteElementString("Periodo", trimestre.ToString());
            w.WriteElementString("OperazioniAttive", AsDec(lipeData, "imponibile_op_attive"));
            w.WriteElementString("OperazioniPassive", AsDec(lipeData, "imponibile_op_passive"));
            w.WriteElementString("IvaEsigibile", AsDec(lipeData, "iva_debito"));
            w.WriteElementString("IvaDetratta", AsDec(lipeData, "iva_credito"));
            w.WriteElementString("IvaDovuta", AsDec(lipeData, "saldo_iva"));
            w.WriteEndElement();

            w.WriteEndElement();
            w.WriteEndDocument();
        }

        return Content(sb.ToString(), "application/xml", Encoding.UTF8);
    }

    [HttpGet("esterometro")]
    public IActionResult GetEsterometro([FromQuery] int anno, [FromQuery] int mese)
    {
        if (mese < 1 || mese > 12)
            return BadRequest(new { ok = false, error = "mese deve essere 1..12" });

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("dbo.sp_esterometro_period", cn) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@anno", anno);
        cmd.Parameters.AddWithValue("@mese", mese);
        using var rdr = cmd.ExecuteReader();
        var rows = new List<Dictionary<string, object?>>();
        while (rdr.Read())
        {
            var d = new Dictionary<string, object?>();
            for (int i = 0; i < rdr.FieldCount; i++)
                d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { ok = true, anno, mese, count = rows.Count, rows });
    }

    private Dictionary<string, object?>? GetLipeRaw(int anno, int trimestre)
    {
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("dbo.sp_lipe_aggregate_quarter", cn) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@anno", anno);
        cmd.Parameters.AddWithValue("@trimestre", trimestre);
        using var rdr = cmd.ExecuteReader();
        if (!rdr.Read()) return null;
        var d = new Dictionary<string, object?>();
        for (int i = 0; i < rdr.FieldCount; i++)
            d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
        return d;
    }

    private static string AsDec(Dictionary<string, object?> d, string k)
    {
        if (!d.TryGetValue(k, out var v) || v == null) return "0.00";
        if (v is decimal dec) return dec.ToString("F2", CultureInfo.InvariantCulture);
        return Convert.ToDecimal(v, CultureInfo.InvariantCulture).ToString("F2", CultureInfo.InvariantCulture);
    }
}
