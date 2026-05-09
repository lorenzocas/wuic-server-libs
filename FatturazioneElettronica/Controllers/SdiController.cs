using System;
using System.Collections.Generic;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;
using FatturazioneElettronica.Services.Sdi;
using FatturazioneElettronica.Services.Sdi.Conservation;
using FatturazioneElettronica.Services.Sdi.Notifications;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5 (decision-ladder skill app-creation): export
/// XML FatturaPA per Sistema di Interscambio (SDI) + invio reale.
///
/// Endpoint:
///   POST /api/sdi/generateXml          -> ritorna XML FatturaPA + path file
///   POST /api/sdi/markAsSent           -> aggiorna stato_sdi + sdi_id (DB only, no rete)
///   GET  /api/sdi/download/{fatturaId} -> download file XML generato
///   POST /api/sdi/submit               -> pipeline completa: XSD + firma CADES-BES + provider
///
/// Stored di supporto: dbo.sp_sdi_get_fattura_payload
///
/// Pipeline /submit (vedi <see cref="SdiSubmissionPipeline"/>):
///   1. <see cref="IXsdValidator"/>: valida XML contro Schema_VFPR12.xsd
///   2. <see cref="ISdiSigner"/>: firma CADES-BES (CMS PKCS#7) → .xml.p7m
///   3. <see cref="ISdiProvider"/>: trasmette al provider configurato
///      (Mock per dev/test, Aruba PEC / FatturePEC / Pec.it / Notarify in produzione).
///
/// Configurazione (appsettings.json sezione "Sdi"):
///   - Provider: nome provider (Mock|ArubaPec|FatturePec|PecIt|Notarify)
///   - Signer:   { Pkcs12Path, Pkcs12Password, SignatureAlgorithm }
///   - Aruba | FatturePec | PecIt | Notarify: credenziali specifiche del provider
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
    public class SubmitRequest { public int FatturaId { get; set; } }

    [HttpPost("generateXml")]
    public IActionResult GenerateXml([FromBody] GenerateXmlRequest req)
    {
        // Generazione XML SDI = scrittura file + DB → admin gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

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
        // Cambio stato SDI = workflow critico → admin gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

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
        // Download XML SDI = lettura file privato → solo auth.
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

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

    /// <summary>
    /// Pipeline completa di invio SDI: genera XML (se mancante) → valida XSD →
    /// firma CADES-BES → trasmette al provider configurato → aggiorna DB.
    ///
    /// Endpoint **transazionale** dal punto di vista business: solo se il
    /// provider conferma `Ok=true` viene chiamato `markAsSent` per aggiornare
    /// `stato_sdi/sdi_id`. Validazione/firma/trasmissione fallita → DB intatto.
    /// </summary>
    [HttpPost("submit")]
    public async Task<IActionResult> Submit(
        [FromBody] SubmitRequest req,
        [FromServices] SdiSubmissionPipeline pipeline,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        if (req.FatturaId <= 0)
            return BadRequest(new { ok = false, error = "fattura_id mancante" });

        // 1) Carica/genera XML payload
        string xml;
        string fileName;
        try
        {
            var payload = LoadPayload(req.FatturaId);
            if (payload.Header == null)
                return NotFound(new { ok = false, error = $"Fattura {req.FatturaId} non trovata" });

            xml = BuildFatturaPaXml(payload);
            fileName = $"IT{(payload.Header["cliente_piva"] as string ?? "00000000000")}_{payload.Header["progressivo"]:00000}.xml";

            // Salva su disco per audit (stesso pattern di GenerateXml)
            string xmlDir = Path.Combine(FatturazioneElettronica.FeAppPaths.HostProjectRoot, "wwwroot", "Upload", "sdi-out");
            Directory.CreateDirectory(xmlDir);
            string xmlPath = Path.Combine(xmlDir, fileName);
            System.IO.File.WriteAllText(xmlPath, xml, new UTF8Encoding(false));

            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var cmd = new SqlCommand(
                "UPDATE dbo.fatture_inviate SET file_xml = @p WHERE id = @id", cn);
            cmd.Parameters.AddWithValue("@p", xmlPath);
            cmd.Parameters.AddWithValue("@id", req.FatturaId);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                ok = false,
                stage = "xml-generation",
                error = ex.Message
            });
        }

        // 2) Pipeline orchestrata: XSD → firma → provider
        var result = await pipeline.RunAsync(xml, fileName, ct).ConfigureAwait(false);

        // 3) Se trasmissione OK → aggiorna stato DB (markAsSent equivalente)
        if (result.Ok && result.Stage == SdiPipelineStage.Submission)
        {
            try
            {
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
                cmd.Parameters.AddWithValue("@sdi_id", (object?)result.SdiId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@msg", (object?)result.Message ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id", req.FatturaId);
                cmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                // Trasmissione SDI andata MA DB update fallito → restituisci comunque
                // success al chiamante (la fattura e' stata trasmessa) ma flagga il
                // problema cosi' l'operatore puo' aggiornare manualmente.
                return Ok(new
                {
                    ok = true,
                    submitted = true,
                    db_update_failed = true,
                    db_error = ex.Message,
                    stage = result.Stage.ToString(),
                    sdi_id = result.SdiId,
                    provider = result.ProviderName,
                    message = result.Message
                });
            }
        }

        return Ok(new
        {
            ok = result.Ok,
            stage = result.Stage.ToString(),
            sdi_id = result.SdiId,
            error_code = result.ErrorCode,
            provider = result.ProviderName,
            message = result.Message,
            signed_file_name = result.SignedFileName,
            signed_bytes = result.SignedBytes,
            xsd_errors = result.XsdErrors,
            xsd_warnings = result.XsdWarnings
        });
    }

    /// <summary>
    /// Sigilla una fattura in conservazione sostitutiva (10 anni AgID).
    /// Provider auto-selezionato dalla configurazione (Filesystem default,
    /// Aruba/InfoCert se configurati).
    /// </summary>
    [HttpPost("conservation/seal/{fatturaId:int}")]
    public async Task<IActionResult> SealConservation(
        int fatturaId,
        [FromServices] IDigitalConservation conservation,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin(out var userId);
        if (gate != null) return gate;

        // Carica file dal disco (.xml.p7m firmato se esiste, altrimenti .xml raw)
        string? filePath; string nomeFileBase;
        using (var cn = new SqlConnection(DataConn))
        {
            cn.Open();
            using var cmd = new SqlCommand(
                "SELECT file_xml, numero, anno, progressivo FROM dbo.fatture_inviate WHERE id=@id", cn);
            cmd.Parameters.AddWithValue("@id", fatturaId);
            using var rdr = cmd.ExecuteReader();
            if (!rdr.Read())
                return NotFound(new { ok = false, error = $"Fattura {fatturaId} non trovata" });
            filePath = rdr.IsDBNull(0) ? null : rdr.GetString(0);
            string numero = rdr.IsDBNull(1) ? "?" : rdr.GetValue(1)?.ToString() ?? "?";
            int anno = rdr.IsDBNull(2) ? 0 : Convert.ToInt32(rdr.GetValue(2));
            int prog = rdr.IsDBNull(3) ? 0 : Convert.ToInt32(rdr.GetValue(3));
            nomeFileBase = $"fattura_{anno}_{prog:00000}";
        }

        if (string.IsNullOrEmpty(filePath) || !System.IO.File.Exists(filePath))
            return BadRequest(new
            {
                ok = false,
                error = "XML non generato. Eseguire prima POST /api/sdi/generateXml o /api/sdi/submit."
            });

        // Preferisci .xml.p7m firmato se esiste accanto al .xml
        string p7mCandidate = filePath + ".p7m";
        string actualPath = System.IO.File.Exists(p7mCandidate) ? p7mCandidate : filePath;
        string actualName = Path.GetFileName(actualPath);
        byte[] payload = await System.IO.File.ReadAllBytesAsync(actualPath, ct).ConfigureAwait(false);

        // Estrai metadata leggibili per ricerca futura (cedente/cessionario/anno/totale)
        string? metadataJson = null;
        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            using var meta = new SqlCommand(@"
SELECT f.numero, f.anno, f.totale, c.ragione_sociale AS cliente, c.partita_iva AS cliente_piva
FROM dbo.fatture_inviate f
LEFT JOIN dbo.clienti c ON f.cliente_id = c.id
WHERE f.id = @id", cn);
            meta.Parameters.AddWithValue("@id", fatturaId);
            using var rdr = meta.ExecuteReader();
            if (rdr.Read())
            {
                metadataJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    numero  = rdr.IsDBNull(0) ? null : rdr.GetValue(0)?.ToString(),
                    anno    = rdr.IsDBNull(1) ? (int?)null : Convert.ToInt32(rdr.GetValue(1)),
                    totale  = rdr.IsDBNull(2) ? (decimal?)null : Convert.ToDecimal(rdr.GetValue(2)),
                    cliente = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                    cliente_piva = rdr.IsDBNull(4) ? null : rdr.GetString(4)
                });
            }
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Estrazione metadata conservazione fallita (non blocking)");
        }

        var result = await conservation.SealAsync(
            fatturaId, actualName, payload, userId, metadataJson, ct).ConfigureAwait(false);

        return result.Ok
            ? Ok(new
            {
                ok = true,
                provider = result.ProviderName,
                conservation_index_id = result.ConservationIndexId,
                storage_location = result.StorageLocation,
                sha256 = result.Sha256Hash,
                timestamp_obtained = result.TimestampObtained,
                tsa_url = result.TsaUrl,
                message = result.Message
            })
            : BadRequest(new { ok = false, provider = result.ProviderName, error = result.Message });
    }

    /// <summary>
    /// Verifica integrita' di un pacchetto in conservazione (re-hash + match
    /// con sha256 in DB + verifica TSA token se presente).
    /// </summary>
    [HttpGet("conservation/verify/{conservationIndexId:int}")]
    public async Task<IActionResult> VerifyConservation(
        int conservationIndexId,
        [FromServices] IDigitalConservation conservation,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        var result = await conservation.VerifyAsync(conservationIndexId, ct).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            sha256_expected = result.Sha256Expected,
            sha256_actual = result.Sha256Actual,
            timestamp_valid = result.TimestampValid,
            message = result.Message
        });
    }

    private ILogger? _logger; // placeholder - logger provided per-request via DI when needed

    /// <summary>
    /// Esegue un singolo ciclo di poll notifiche SDI dalla casella PEC mittente.
    /// **Endpoint chiamato dal framework `scheduler` table** (action_type='2',
    /// vedi <c>scripts/2026-05-09-scheduler-tasks-sdi-fiscal.sql</c>) ogni N
    /// minuti. Riusabile anche manualmente per testing/debug e per apply
    /// on-demand quando l'utente clicca "Aggiorna stato SDI" da UI.
    /// </summary>
    [HttpPost("notifications/poll-now")]
    public async Task<IActionResult> PollNotificationsNow(
        [FromServices] SdiNotificationCycleRunner runner,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        try
        {
            var result = await runner.RunOneCycleAsync(ct).ConfigureAwait(false);
            return Ok(new
            {
                ok = true,
                parsed = result.Parsed,
                persisted = result.Persisted,
                applied = result.Applied,
                skipped_duplicates = result.SkippedDuplicates,
                errors = result.Errors
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    /// <summary>
    /// Test/admin endpoint: inietta direttamente un set di notifiche RAW
    /// nell'<see cref="FatturazioneElettronica.Services.Sdi.Notifications.SdiNotificationApplier"/>,
    /// bypassando il poller. Usato dalla suite e2e (test 56) per verificare
    /// l'intero flow applier → DB → bell senza dover orchestrare un provider
    /// reale o una casella PEC IMAP. Admin-gated.
    ///
    /// Body JSON: <c>{ "items": [{ "xml": "...", "fileName": "...", "providerSource": "Test" }, ...] }</c>
    /// </summary>
    [HttpPost("notifications/apply-raw")]
    public async Task<IActionResult> ApplyRawNotifications(
        [FromBody] ApplyRawRequest req,
        [FromServices] FatturazioneElettronica.Services.Sdi.Notifications.SdiNotificationApplier applier,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        if (req?.Items == null || req.Items.Count == 0)
            return BadRequest(new { ok = false, error = "items vuoto o mancante" });

        try
        {
            var raws = req.Items
                .Select(i => new FatturazioneElettronica.Services.Sdi.Notifications.RawSdiNotification(
                    Xml: i.Xml ?? string.Empty,
                    FileName: i.FileName,
                    PecMessageId: i.PecMessageId,
                    ProviderSource: string.IsNullOrEmpty(i.ProviderSource) ? "Test" : i.ProviderSource!))
                .ToList();

            var result = await applier.ApplyAsync(raws, ct).ConfigureAwait(false);
            return Ok(new
            {
                ok = true,
                parsed = result.Parsed,
                persisted = result.Persisted,
                applied = result.Applied,
                skipped_duplicates = result.SkippedDuplicates,
                errors = result.Errors
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    public sealed class ApplyRawRequest
    {
        public List<ApplyRawItem> Items { get; set; } = new();
    }

    public sealed class ApplyRawItem
    {
        public string? Xml { get; set; }
        public string? FileName { get; set; }
        public string? PecMessageId { get; set; }
        public string? ProviderSource { get; set; }
    }

    /// <summary>
    /// Lista delle notifiche SDI ricevute per una specifica fattura.
    /// Audit trail: chi/quando/cosa per ogni stato_sdi update.
    /// </summary>
    [HttpGet("notifications/{fatturaId:int}")]
    public IActionResult GetNotificationsForFattura(int fatturaId)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT id, sdi_identificativo, message_id, notification_type, nome_file,
       data_ricezione, applied_to_fattura, applied_at, applied_error, provider_source
FROM dbo.sdi_notifications
WHERE fattura_id = @id
ORDER BY data_ricezione DESC", cn);
        cmd.Parameters.AddWithValue("@id", fatturaId);

        var rows = new List<Dictionary<string, object?>>();
        using var rdr = cmd.ExecuteReader();
        while (rdr.Read())
        {
            var d = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rdr.FieldCount; i++)
                d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { ok = true, notifications = rows });
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
