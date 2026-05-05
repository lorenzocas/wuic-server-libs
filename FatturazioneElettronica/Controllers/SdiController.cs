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
/// Controller livello 5 (decision-ladder skill app-creation): export
/// XML FatturaPA per Sistema di Interscambio (SDI).
///
/// Endpoint:
///   POST /api/sdi/generateXml          -> ritorna XML FatturaPA + path file
///   POST /api/sdi/markAsSent           -> aggiorna stato_sdi + sdi_id
///   GET  /api/sdi/download/{fatturaId} -> download file XML generato
///
/// Stored di supporto: dbo.sp_sdi_get_fattura_payload
///
/// **Limiti scaffolding**: il mapping XML implementato e' una versione
/// minimale dello schema FatturaPA v1.2.x (CedentePrestatore +
/// CessionarioCommittente + DatiGenerali + DatiBeniServizi +
/// DatiPagamento + DatiRiepilogo). Per produzione vanno integrati:
///   - firma digitale CADES-BES (SmartCard / HSM)
///   - validazione XSD prima dell'invio
///   - integrazione provider SDI (Aruba PEC, FatturePEC, ecc.)
///   - tutti i campi opzionali dello schema (es. DatiCassaPrevidenziale,
///     DatiOrdineAcquisto, DatiContratto, AltriDatiGestionali, ...)
/// </summary>
[ApiController]
[Route("api/sdi")]
public class SdiController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class GenerateXmlRequest { public int FatturaId { get; set; } }
    public class MarkAsSentRequest { public int FatturaId { get; set; } public string SdiId { get; set; } = ""; public string SdiMessaggio { get; set; } = ""; }

    [HttpPost("generateXml")]
    public IActionResult GenerateXml([FromBody] GenerateXmlRequest req)
    {
        if (req.FatturaId <= 0) return BadRequest(new { ok = false, error = "fattura_id mancante" });

        try
        {
            // Carica payload via stored
            var payload = LoadPayload(req.FatturaId);
            if (payload.Header == null) return NotFound(new { ok = false, error = $"Fattura {req.FatturaId} non trovata" });

            // Costruisci XML
            string xml = BuildFatturaPaXml(payload);

            // Salva su disco usando `FeAppPaths.HostProjectRoot` (csproj folder
            // della FE app). NON `Directory.GetCurrentDirectory()` ne'
            // `IWebHostEnvironment.ContentRootPath` (che punta a KonvergenceCore
            // per riuso workspace Angular — vedi FeAppPaths.cs e
            // Program.CreateHostBuilder per il razionale).
            string xmlDir = Path.Combine(FatturazioneElettronica.FeAppPaths.HostProjectRoot, "wwwroot", "Upload", "sdi-out");
            Directory.CreateDirectory(xmlDir);
            string fileName = $"IT{(payload.Header["cliente_piva"] as string ?? "00000000000")}_{payload.Header["progressivo"]:00000}.xml";
            string xmlPath = Path.Combine(xmlDir, fileName);
            System.IO.File.WriteAllText(xmlPath, xml, new UTF8Encoding(false));

            // Aggiorna fatture_inviate.file_xml
            using (var cn = new SqlConnection(DataConn))
            {
                cn.Open();
                using var cmd = new SqlCommand("UPDATE dbo.fatture_inviate SET file_xml = @p WHERE id = @id", cn);
                cmd.Parameters.AddWithValue("@p", xmlPath);
                cmd.Parameters.AddWithValue("@id", req.FatturaId);
                cmd.ExecuteNonQuery();
            }

            return Ok(new { ok = true, fattura_id = req.FatturaId, file_xml = xmlPath, file_name = fileName, xml_size_bytes = xml.Length });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpPost("markAsSent")]
    public IActionResult MarkAsSent([FromBody] MarkAsSentRequest req)
    {
        if (req.FatturaId <= 0) return BadRequest(new { ok = false, error = "fattura_id mancante" });

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
UPDATE dbo.fatture_inviate
SET stato_sdi = 'INVIATA',
    sdi_id = @sdi_id,
    sdi_messaggio = @msg,
    stato = CASE WHEN stato = 'BOZZA' THEN 'EMESSA' ELSE stato END,
    data_modifica = GETDATE()
WHERE id = @id", cn);
        cmd.Parameters.AddWithValue("@sdi_id", (object?)req.SdiId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@msg",    (object?)req.SdiMessaggio ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id",     req.FatturaId);
        int n = cmd.ExecuteNonQuery();

        return Ok(new { ok = true, rows_updated = n });
    }

    [HttpGet("download/{fatturaId}")]
    public IActionResult Download(int fatturaId)
    {
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("SELECT file_xml FROM dbo.fatture_inviate WHERE id = @id", cn);
        cmd.Parameters.AddWithValue("@id", fatturaId);
        var path = cmd.ExecuteScalar() as string;
        if (string.IsNullOrEmpty(path) || !System.IO.File.Exists(path))
            return NotFound(new { ok = false, error = "XML non trovato. Generare prima con generateXml." });
        var bytes = System.IO.File.ReadAllBytes(path);
        return File(bytes, "application/xml", Path.GetFileName(path));
    }

    // ── helpers ──────────────────────────────────────────────────────

    private class FatturaPayload
    {
        public IDictionary<string, object>? Header { get; set; }
        public List<IDictionary<string, object>> Righe { get; } = new();
        public List<IDictionary<string, object>> RiepilogoIva { get; } = new();
    }

    private FatturaPayload LoadPayload(int fatturaId)
    {
        var p = new FatturaPayload();
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("dbo.sp_sdi_get_fattura_payload", cn) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fattura_id", fatturaId);
        using var rdr = cmd.ExecuteReader();

        if (rdr.Read()) p.Header = ReaderToDict(rdr);
        rdr.NextResult();
        while (rdr.Read()) p.Righe.Add(ReaderToDict(rdr));
        rdr.NextResult();
        while (rdr.Read()) p.RiepilogoIva.Add(ReaderToDict(rdr));
        return p;
    }

    private static IDictionary<string, object> ReaderToDict(SqlDataReader rdr)
    {
        var d = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < rdr.FieldCount; i++)
            d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null! : rdr.GetValue(i);
        return d;
    }

    /// <summary>
    /// Mapping minimale FatturaPA v1.2.x. Per produzione: usare
    /// generatori XSD-driven (xsd2code o System.Xml.Serialization).
    /// </summary>
    private static string BuildFatturaPaXml(FatturaPayload p)
    {
        var h = p.Header!;
        // Uso MemoryStream + UTF-8 (no BOM) per avere "encoding=utf-8" nella
        // dichiarazione XML — SDI richiede UTF-8. StringWriter default e' UTF-16
        // e fa fallire la validazione XSD del SDI.
        using var ms = new MemoryStream();
        var settings = new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false), OmitXmlDeclaration = false };
        using (var w = XmlWriter.Create(ms, settings))
        {
            w.WriteStartDocument();
            w.WriteStartElement("p", "FatturaElettronica", "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2");
            w.WriteAttributeString("versione", "FPR12");

            // ── FatturaElettronicaHeader ────────────────────────────────
            w.WriteStartElement("FatturaElettronicaHeader");

            // DatiTrasmissione (placeholder mittente — produzione: prendere dai dati cedente)
            w.WriteStartElement("DatiTrasmissione");
            w.WriteStartElement("IdTrasmittente");
            w.WriteElementString("IdPaese", "IT");
            w.WriteElementString("IdCodice", "00000000000");
            w.WriteEndElement();
            w.WriteElementString("ProgressivoInvio", h["progressivo"]?.ToString() ?? "1");
            w.WriteElementString("FormatoTrasmissione", "FPR12");
            w.WriteElementString("CodiceDestinatario", AsString(h, "cliente_cod_destinatario") ?? "0000000");
            if (!string.IsNullOrEmpty(AsString(h, "cliente_pec")))
                w.WriteElementString("PECDestinatario", AsString(h, "cliente_pec"));
            w.WriteEndElement(); // DatiTrasmissione

            // CedentePrestatore (mittente — placeholder, produzione: leggere da config azienda)
            w.WriteStartElement("CedentePrestatore");
            w.WriteStartElement("DatiAnagrafici");
            w.WriteStartElement("IdFiscaleIVA");
            w.WriteElementString("IdPaese", "IT");
            w.WriteElementString("IdCodice", "00000000000");
            w.WriteEndElement();
            w.WriteStartElement("Anagrafica");
            w.WriteElementString("Denominazione", "FatturazioneElettronica Test SRL");
            w.WriteEndElement();
            w.WriteElementString("RegimeFiscale", "RF01");
            w.WriteEndElement(); // DatiAnagrafici
            w.WriteStartElement("Sede");
            w.WriteElementString("Indirizzo", "Via Esempio 1");
            w.WriteElementString("CAP", "00100");
            w.WriteElementString("Comune", "Roma");
            w.WriteElementString("Provincia", "RM");
            w.WriteElementString("Nazione", "IT");
            w.WriteEndElement();
            w.WriteEndElement(); // CedentePrestatore

            // CessionarioCommittente (destinatario)
            w.WriteStartElement("CessionarioCommittente");
            w.WriteStartElement("DatiAnagrafici");
            if (!string.IsNullOrEmpty(AsString(h, "cliente_piva")))
            {
                w.WriteStartElement("IdFiscaleIVA");
                w.WriteElementString("IdPaese", AsString(h, "cliente_nazione") ?? "IT");
                w.WriteElementString("IdCodice", AsString(h, "cliente_piva")!);
                w.WriteEndElement();
            }
            if (!string.IsNullOrEmpty(AsString(h, "cliente_cf")))
                w.WriteElementString("CodiceFiscale", AsString(h, "cliente_cf"));
            w.WriteStartElement("Anagrafica");
            w.WriteElementString("Denominazione", AsString(h, "cliente_ragione_sociale") ?? "");
            w.WriteEndElement();
            w.WriteEndElement(); // DatiAnagrafici
            w.WriteStartElement("Sede");
            w.WriteElementString("Indirizzo", AsString(h, "cliente_indirizzo") ?? "Indirizzo non specificato");
            w.WriteElementString("CAP", AsString(h, "cliente_cap") ?? "00000");
            w.WriteElementString("Comune", AsString(h, "cliente_citta") ?? "");
            if (!string.IsNullOrEmpty(AsString(h, "cliente_provincia")))
                w.WriteElementString("Provincia", AsString(h, "cliente_provincia"));
            w.WriteElementString("Nazione", AsString(h, "cliente_nazione") ?? "IT");
            w.WriteEndElement(); // Sede
            w.WriteEndElement(); // CessionarioCommittente

            w.WriteEndElement(); // FatturaElettronicaHeader

            // ── FatturaElettronicaBody ──────────────────────────────────
            w.WriteStartElement("FatturaElettronicaBody");

            // DatiGenerali
            w.WriteStartElement("DatiGenerali");
            w.WriteStartElement("DatiGeneraliDocumento");
            w.WriteElementString("TipoDocumento", "TD01"); // TD01 = Fattura
            w.WriteElementString("Divisa", "EUR");
            w.WriteElementString("Data", AsDate(h, "data_documento"));
            w.WriteElementString("Numero", AsString(h, "numero") ?? "");
            w.WriteElementString("ImportoTotaleDocumento", AsDec(h, "totale"));
            if (!string.IsNullOrEmpty(AsString(h, "causale")))
                w.WriteElementString("Causale", AsString(h, "causale"));
            w.WriteEndElement();
            w.WriteEndElement();

            // DatiBeniServizi
            w.WriteStartElement("DatiBeniServizi");
            int nLinea = 1;
            foreach (var r in p.Righe)
            {
                w.WriteStartElement("DettaglioLinee");
                w.WriteElementString("NumeroLinea", nLinea++.ToString());
                w.WriteElementString("Descrizione", AsString(r, "descrizione") ?? "");
                w.WriteElementString("Quantita", AsDec(r, "quantita"));
                if (!string.IsNullOrEmpty(AsString(r, "um_codice")))
                    w.WriteElementString("UnitaMisura", AsString(r, "um_codice"));
                w.WriteElementString("PrezzoUnitario", AsDec(r, "prezzo_unitario"));
                w.WriteElementString("PrezzoTotale", AsDec(r, "imponibile_riga"));
                w.WriteElementString("AliquotaIVA", AsDec(r, "aliquota"));
                if (!string.IsNullOrEmpty(AsString(r, "natura_sdi")))
                    w.WriteElementString("Natura", AsString(r, "natura_sdi"));
                w.WriteEndElement();
            }
            // DatiRiepilogo per aliquota
            foreach (var rip in p.RiepilogoIva)
            {
                w.WriteStartElement("DatiRiepilogo");
                w.WriteElementString("AliquotaIVA", AsDec(rip, "aliquota"));
                if (!string.IsNullOrEmpty(AsString(rip, "natura_sdi")))
                    w.WriteElementString("Natura", AsString(rip, "natura_sdi"));
                w.WriteElementString("ImponibileImporto", AsDec(rip, "imponibile"));
                w.WriteElementString("Imposta", AsDec(rip, "iva"));
                w.WriteEndElement();
            }
            w.WriteEndElement(); // DatiBeniServizi

            // DatiPagamento (se modalita' pagamento valorizzata)
            if (!string.IsNullOrEmpty(AsString(h, "pagamento_codice_sdi")))
            {
                w.WriteStartElement("DatiPagamento");
                w.WriteElementString("CondizioniPagamento", "TP02"); // TP02 = pagamento completo
                w.WriteStartElement("DettaglioPagamento");
                w.WriteElementString("ModalitaPagamento", AsString(h, "pagamento_codice_sdi"));
                w.WriteElementString("ImportoPagamento", AsDec(h, "totale"));
                if (!string.IsNullOrEmpty(AsString(h, "banca_iban")))
                    w.WriteElementString("IBAN", AsString(h, "banca_iban"));
                w.WriteEndElement();
                w.WriteEndElement();
            }

            w.WriteEndElement(); // FatturaElettronicaBody
            w.WriteEndElement(); // FatturaElettronica
            w.WriteEndDocument();
        }
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    private static string? AsString(IDictionary<string, object> d, string k) =>
        d.TryGetValue(k, out var v) && v != null ? v.ToString() : null;

    private static string AsDec(IDictionary<string, object> d, string k)
    {
        if (!d.TryGetValue(k, out var v) || v == null) return "0.00";
        if (v is decimal dec) return dec.ToString("F2", CultureInfo.InvariantCulture);
        if (v is double dbl) return dbl.ToString("F2", CultureInfo.InvariantCulture);
        return Convert.ToDecimal(v, CultureInfo.InvariantCulture).ToString("F2", CultureInfo.InvariantCulture);
    }

    private static string AsDate(IDictionary<string, object> d, string k)
    {
        if (d.TryGetValue(k, out var v) && v is DateTime dt)
            return dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
