using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5: invio email di documenti (es. fattura PDF/XML)
/// con log persistente in dbo.email_log.
///
/// Endpoint:
///   POST /api/email/sendInvoice  -> invia fattura per email + log
///   GET  /api/email/log/{fatturaId} -> storico email per fattura
///
/// Stored: dbo.sp_email_log_register
///
/// SMTP config attesa in appsettings (sezione "Smtp"):
///   "Smtp": {
///     "Host": "smtp.example.it",
///     "Port": 587,
///     "User": "user@example.it",
///     "Password": "...",
///     "From":  "fatture@example.it",
///     "EnableSsl": true
///   }
/// Se mancante, l'email viene loggata con status='PENDING' senza
/// tentare l'invio (utile per dev/staging).
/// </summary>
[ApiController]
[Route("api/email")]
public class EmailController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class SendInvoiceRequest
    {
        public int FatturaId { get; set; }
        public string? RecipientOverride { get; set; }
        public string? RecipientCc { get; set; }
        public string? Subject { get; set; }
        public string? Body { get; set; }
        public bool AttachXml { get; set; } = true;
    }

    [HttpPost("sendInvoice")]
    public IActionResult SendInvoice([FromBody] SendInvoiceRequest req)
    {
        // Invio email = effetto irreversibile su sistema esterno → admin gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        if (req.FatturaId <= 0) return BadRequest(new { ok = false, error = "fattura_id mancante" });

        // Carica info fattura + cliente
        string? recipient = req.RecipientOverride;
        string? xmlPath = null;
        string numero = "";
        decimal totale = 0;
        using (var cn = new SqlConnection(DataConn))
        {
            cn.Open();
            using var cmd = new SqlCommand(@"
SELECT f.numero, f.totale, f.file_xml,
       ISNULL(c.email, c.pec) AS email_cliente
FROM dbo.fatture_inviate f
JOIN dbo.clienti c ON c.id = f.cliente_id
WHERE f.id = @id", cn);
            cmd.Parameters.AddWithValue("@id", req.FatturaId);
            using var rdr = cmd.ExecuteReader();
            if (!rdr.Read()) return NotFound(new { ok = false, error = $"Fattura {req.FatturaId} non trovata" });
            numero  = rdr["numero"]?.ToString() ?? "";
            totale  = rdr["totale"] != DBNull.Value ? Convert.ToDecimal(rdr["totale"]) : 0;
            xmlPath = rdr["file_xml"] as string;
            if (string.IsNullOrEmpty(recipient))
                recipient = rdr["email_cliente"] as string;
        }
        if (string.IsNullOrEmpty(recipient))
            return BadRequest(new { ok = false, error = "Nessun destinatario (cliente senza email/pec e nessun override)" });

        string subject = req.Subject ?? $"Fattura {numero} - importo {totale:F2} EUR";
        string body    = req.Body    ?? $"In allegato fattura {numero} di euro {totale:F2}.\n\nGrazie,\nFatturazioneElettronica";

        var attachments = new List<string>();
        if (req.AttachXml && !string.IsNullOrEmpty(xmlPath) && System.IO.File.Exists(xmlPath))
            attachments.Add(xmlPath);

        // Tentativo SMTP (graceful degradation se config mancante)
        var smtpHost = ConfigurationManager.AppSettings["Smtp:Host"];
        var smtpFromAddr = ConfigurationManager.AppSettings["Smtp:From"];
        string status = "PENDING";
        string smtpResponse = "SMTP non configurato — email registrata come PENDING.";
        if (!string.IsNullOrEmpty(smtpHost) && !string.IsNullOrEmpty(smtpFromAddr))
        {
            try
            {
                int port = int.TryParse(ConfigurationManager.AppSettings["Smtp:Port"], out var p) ? p : 587;
                bool ssl  = bool.TryParse(ConfigurationManager.AppSettings["Smtp:EnableSsl"] ?? "true", out var s) && s;
                using var msg = new MailMessage(smtpFromAddr, recipient, subject, body);
                if (!string.IsNullOrEmpty(req.RecipientCc)) msg.CC.Add(req.RecipientCc);
                foreach (var a in attachments)
                    msg.Attachments.Add(new Attachment(a));
                using var smtp = new SmtpClient(smtpHost, port) { EnableSsl = ssl };
                var smtpUser = ConfigurationManager.AppSettings["Smtp:User"];
                var smtpPwd  = ConfigurationManager.AppSettings["Smtp:Password"];
                if (!string.IsNullOrEmpty(smtpUser))
                    smtp.Credentials = new NetworkCredential(smtpUser, smtpPwd);
                smtp.Send(msg);
                status = "SENT";
                smtpResponse = $"OK via {smtpHost}:{port}";
            }
            catch (Exception ex)
            {
                status = "FAILED";
                smtpResponse = ex.Message;
            }
        }

        // Log via stored
        int logId;
        using (var cn = new SqlConnection(DataConn))
        {
            cn.Open();
            using var cmd = new SqlCommand("dbo.sp_email_log_register", cn) { CommandType = CommandType.StoredProcedure };
            cmd.Parameters.AddWithValue("@fattura_id",       req.FatturaId);
            cmd.Parameters.AddWithValue("@recipient_to",     recipient);
            cmd.Parameters.AddWithValue("@recipient_cc",     (object?)req.RecipientCc ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@subject",          subject);
            cmd.Parameters.AddWithValue("@body",             body);
            cmd.Parameters.AddWithValue("@attachment_paths", attachments.Count > 0 ? JsonSerializer.Serialize(attachments) : (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@status",           status);
            cmd.Parameters.AddWithValue("@smtp_response",    smtpResponse);
            cmd.Parameters.AddWithValue("@utente_creazione", DBNull.Value);
            logId = Convert.ToInt32(cmd.ExecuteScalar());
        }

        return Ok(new {
            ok = (status == "SENT"),
            status = status,
            log_id = logId,
            recipient = recipient,
            attachments_count = attachments.Count,
            smtp_response = smtpResponse
        });
    }

    [HttpGet("log/{fatturaId}")]
    public IActionResult GetLog(int fatturaId)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT id, recipient_to, subject, status, smtp_response, sent_at, created_at
FROM dbo.email_log
WHERE fattura_id = @id
ORDER BY id DESC", cn);
        cmd.Parameters.AddWithValue("@id", fatturaId);
        using var rdr = cmd.ExecuteReader();
        var rows = new List<Dictionary<string, object?>>();
        while (rdr.Read())
        {
            var d = new Dictionary<string, object?>();
            for (int i = 0; i < rdr.FieldCount; i++)
                d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { ok = true, count = rows.Count, log = rows });
    }

    // ============================================================
    // #23 Block 5: Email auto via template
    // ============================================================

    public class SendFromTemplateRequest
    {
        public string TemplateCodice { get; set; } = "";
        public int? FatturaId { get; set; }
        public int? ScadenzaId { get; set; }
        public string? RecipientOverride { get; set; }
        public string? RecipientCc { get; set; }
    }

    /// <summary>
    /// Invia un'email da template applicando substitution dei placeholders
    /// {{numero}}, {{cliente.ragione_sociale}}, {{scadenza.data}}, ecc.
    /// </summary>
    [HttpPost("send-from-template")]
    public IActionResult SendFromTemplate([FromBody] SendFromTemplateRequest req)
    {
        // Invio email reali → admin gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        if (string.IsNullOrEmpty(req?.TemplateCodice))
            return BadRequest(new { ok = false, error = "templateCodice mancante" });

        using var cn = new SqlConnection(DataConn);
        cn.Open();

        // 1) Carica template
        var template = LoadTemplate(cn, req.TemplateCodice);
        if (template == null)
            return BadRequest(new { ok = false, error = $"Template '{req.TemplateCodice}' non trovato" });

        // 2) Carica context dati per substitution
        var context = BuildRenderContext(cn, req.FatturaId, req.ScadenzaId);
        if (context == null)
            return BadRequest(new { ok = false, error = "FatturaId o ScadenzaId richiesti per popolare il template" });

        // 3) Render
        string subject = RenderTemplate(template["oggetto"]?.ToString() ?? "", context);
        string body = RenderTemplate(template["body_html"]?.ToString() ?? "", context);

        // 4) Recipient
        string? recipient = req.RecipientOverride
            ?? (context.TryGetValue("cliente.email", out var em) ? em : null);
        if (string.IsNullOrEmpty(recipient))
            return BadRequest(new { ok = false, error = "Email destinatario non determinato (cliente senza email + nessun override)" });

        // 5) Send + log
        var sendResult = TrySendSmtp(recipient, subject, body, req.RecipientCc);

        // 6) Log
        int logId;
        using (var cmd = new SqlCommand("dbo.sp_email_log_register", cn) { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@fattura_id",       req.FatturaId.HasValue ? (object)req.FatturaId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@recipient_to",     recipient);
            cmd.Parameters.AddWithValue("@recipient_cc",     (object?)req.RecipientCc ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@subject",          subject);
            cmd.Parameters.AddWithValue("@body",             body);
            cmd.Parameters.AddWithValue("@attachment_paths", DBNull.Value);
            cmd.Parameters.AddWithValue("@status",           sendResult.Status);
            cmd.Parameters.AddWithValue("@smtp_response",    sendResult.Response);
            cmd.Parameters.AddWithValue("@utente_creazione", DBNull.Value);
            logId = Convert.ToInt32(cmd.ExecuteScalar());
        }

        return Ok(new {
            ok = sendResult.Status == "SENT" || sendResult.Status == "PENDING",
            status = sendResult.Status,
            log_id = logId,
            recipient,
            subject,
            template = req.TemplateCodice,
            smtp_response = sendResult.Response
        });
    }

    public class SendSollecitoBatchRequest
    {
        /// <summary>Soglia minima giorni di scaduto per inviare. Default 1.</summary>
        public int GiorniScadutoMin { get; set; } = 1;
        /// <summary>Massimo numero di solleciti da inviare in un batch (safety limit). Default 100.</summary>
        public int MaxBatch { get; set; } = 100;
        /// <summary>Se true, non invia email (solo log PENDING). Default false.</summary>
        public bool DryRun { get; set; } = false;
    }

    /// <summary>
    /// Sollecito batch: trova scadenze APERTA scadute e invia un'email per
    /// cliente usando il template appropriato in base ai giorni di ritardo.
    /// 0-30gg: SOLLECITO_LIEVE; 31-90gg: SOLLECITO_GRAVE; >90gg: SOLLECITO_LEGALE.
    /// </summary>
    [HttpPost("send-sollecito-batch")]
    public IActionResult SendSollecitoBatch([FromBody] SendSollecitoBatchRequest? req)
    {
        // Sollecito batch = invii multipli reali → admin gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        req ??= new SendSollecitoBatchRequest();
        using var cn = new SqlConnection(DataConn);
        cn.Open();

        // 1) Trova scadenze scadute non pagate (tipo INCASSO) con cliente con email
        var scadenze = new List<int>();
        using (var cmd = new SqlCommand(@"
SELECT TOP (@max) s.id
FROM dbo.scadenze s
JOIN dbo.clienti c ON c.id = s.cliente_id
WHERE s.tipo = 'INCASSO'
  AND ISNULL(s.cancellato, 0) = 0
  AND s.stato IN ('APERTA', 'PARZIALE')
  AND s.data_scadenza < DATEADD(DAY, -@minGiorni, CAST(GETDATE() AS DATE))
  AND ISNULL(c.email, '') <> ''
  AND ISNULL(c.cancellato, 0) = 0
ORDER BY s.data_scadenza ASC", cn))
        {
            cmd.Parameters.AddWithValue("@max", req.MaxBatch);
            cmd.Parameters.AddWithValue("@minGiorni", req.GiorniScadutoMin);
            using var rdr = cmd.ExecuteReader();
            while (rdr.Read()) scadenze.Add(rdr.GetInt32(0));
        }

        int sent = 0, errors = 0, pending = 0;
        var errorList = new List<string>();
        foreach (var scadenzaId in scadenze)
        {
            try
            {
                var ctx = BuildRenderContext(cn, fatturaId: null, scadenzaId: scadenzaId);
                if (ctx == null) { errors++; continue; }

                int giorniScaduto = int.TryParse(ctx.GetValueOrDefault("giorni_scaduto", "0"), out var g) ? g : 0;
                string codiceTpl = giorniScaduto switch
                {
                    <= 30 => "SOLLECITO_LIEVE_DEFAULT",
                    <= 90 => "SOLLECITO_GRAVE_DEFAULT",
                    _     => "SOLLECITO_LEGALE_DEFAULT"
                };

                var template = LoadTemplate(cn, codiceTpl);
                if (template == null) { errors++; continue; }

                string subject = RenderTemplate(template["oggetto"]?.ToString() ?? "", ctx);
                string body = RenderTemplate(template["body_html"]?.ToString() ?? "", ctx);
                string? recipient = ctx.GetValueOrDefault("cliente.email");
                if (string.IsNullOrEmpty(recipient)) { errors++; continue; }

                var sendResult = req.DryRun
                    ? new SmtpResult { Status = "PENDING", Response = "DryRun: non inviato" }
                    : TrySendSmtp(recipient, subject, body, null);

                int? fatturaId = ctx.TryGetValue("fattura_id", out var fid) && int.TryParse(fid, out var fidI) ? fidI : null;
                using var cmd = new SqlCommand("dbo.sp_email_log_register", cn) { CommandType = CommandType.StoredProcedure };
                cmd.Parameters.AddWithValue("@fattura_id",       fatturaId.HasValue ? (object)fatturaId.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@recipient_to",     recipient);
                cmd.Parameters.AddWithValue("@recipient_cc",     DBNull.Value);
                cmd.Parameters.AddWithValue("@subject",          subject);
                cmd.Parameters.AddWithValue("@body",             body);
                cmd.Parameters.AddWithValue("@attachment_paths", DBNull.Value);
                cmd.Parameters.AddWithValue("@status",           sendResult.Status);
                cmd.Parameters.AddWithValue("@smtp_response",    sendResult.Response);
                cmd.Parameters.AddWithValue("@utente_creazione", DBNull.Value);
                cmd.ExecuteScalar();

                if (sendResult.Status == "SENT") sent++;
                else if (sendResult.Status == "PENDING") pending++;
                else errors++;
            }
            catch (Exception ex)
            {
                errors++;
                if (errorList.Count < 5) errorList.Add($"scadenza_id={scadenzaId}: {ex.Message}");
            }
        }

        return Ok(new {
            ok = true,
            scadenze_processate = scadenze.Count,
            sent,
            pending,
            errors,
            error_samples = errorList,
            dry_run = req.DryRun
        });
    }

    // ─── HELPERS ──────────────────────────────────────────────────

    private static Dictionary<string, object?>? LoadTemplate(SqlConnection cn, string codice)
    {
        using var cmd = new SqlCommand(@"
SELECT TOP 1 id, codice, oggetto, body_html FROM dbo.email_template
WHERE codice = @c AND ISNULL(cancellato, 0) = 0 AND attivo = 1", cn);
        cmd.Parameters.AddWithValue("@c", codice);
        using var rdr = cmd.ExecuteReader();
        if (!rdr.Read()) return null;
        var d = new Dictionary<string, object?>();
        for (int i = 0; i < rdr.FieldCount; i++) d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
        return d;
    }

    private static Dictionary<string, string>? BuildRenderContext(SqlConnection cn, int? fatturaId, int? scadenzaId)
    {
        if (!fatturaId.HasValue && !scadenzaId.HasValue) return null;
        var ctx = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        ctx["azienda.nome"] = ConfigurationManager.AppSettings["azienda-nome"] ?? "";

        // Se scadenzaId, derivare anche fatturaId
        if (scadenzaId.HasValue)
        {
            using var cmd = new SqlCommand(@"
SELECT s.id, s.data_scadenza, s.importo, s.fattura_inviata_id,
       DATEDIFF(day, s.data_scadenza, GETDATE()) AS giorni_scaduto
FROM dbo.scadenze s WHERE s.id = @id", cn);
            cmd.Parameters.AddWithValue("@id", scadenzaId.Value);
            using var rdr = cmd.ExecuteReader();
            if (rdr.Read())
            {
                ctx["scadenza.data"] = ((DateTime)rdr["data_scadenza"]).ToString("dd/MM/yyyy");
                ctx["scadenza.importo"] = ((decimal)rdr["importo"]).ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("it-IT"));
                ctx["giorni_scaduto"] = rdr["giorni_scaduto"].ToString() ?? "0";
                if (rdr["fattura_inviata_id"] != DBNull.Value && !fatturaId.HasValue)
                    fatturaId = Convert.ToInt32(rdr["fattura_inviata_id"]);
            }
        }
        if (!fatturaId.HasValue) return ctx;

        ctx["fattura_id"] = fatturaId.Value.ToString();
        using (var cmd = new SqlCommand(@"
SELECT f.numero, f.anno, f.data_documento, f.totale, f.cliente_id,
       c.ragione_sociale, c.email, c.partita_iva
FROM dbo.fatture_inviate f
JOIN dbo.clienti c ON c.id = f.cliente_id
WHERE f.id = @id", cn))
        {
            cmd.Parameters.AddWithValue("@id", fatturaId.Value);
            using var rdr = cmd.ExecuteReader();
            if (rdr.Read())
            {
                ctx["numero"] = rdr["numero"]?.ToString() ?? "";
                ctx["anno"] = rdr["anno"]?.ToString() ?? "";
                ctx["data"] = ((DateTime)rdr["data_documento"]).ToString("dd/MM/yyyy");
                ctx["totale"] = ((decimal)rdr["totale"]).ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("it-IT"));
                ctx["cliente.ragione_sociale"] = rdr["ragione_sociale"]?.ToString() ?? "";
                ctx["cliente.email"] = rdr["email"]?.ToString() ?? "";
                ctx["cliente.partita_iva"] = rdr["partita_iva"]?.ToString() ?? "";
            }
        }
        return ctx;
    }

    private static string RenderTemplate(string template, IDictionary<string, string> context)
    {
        if (string.IsNullOrEmpty(template)) return "";
        // Substitution naive: {{key}} → value (case-insensitive)
        return System.Text.RegularExpressions.Regex.Replace(
            template,
            @"\{\{([^}]+)\}\}",
            m =>
            {
                var key = m.Groups[1].Value.Trim();
                return context.TryGetValue(key, out var val) ? val ?? "" : m.Value;
            });
    }

    private class SmtpResult
    {
        public string Status { get; set; } = "PENDING";
        public string Response { get; set; } = "";
    }

    private SmtpResult TrySendSmtp(string recipient, string subject, string body, string? cc)
    {
        string? smtpHost = ConfigurationManager.AppSettings["email-host"];
        string? smtpUser = ConfigurationManager.AppSettings["email-user"] ?? ConfigurationManager.AppSettings["email-from"];
        string? smtpPwd = ConfigurationManager.AppSettings["email-pwd"];
        string? smtpFromAddr = ConfigurationManager.AppSettings["email-from"] ?? smtpUser;
        int port = int.TryParse(ConfigurationManager.AppSettings["email-port"], out var p) ? p : 587;
        bool ssl = !bool.TryParse(ConfigurationManager.AppSettings["email-ssl"], out var s) || s;

        // Se config incompleta o placeholder dev → log only
        if (string.IsNullOrEmpty(smtpHost) || string.IsNullOrEmpty(smtpFromAddr) ||
            (smtpPwd?.StartsWith("__SET_") ?? true))
        {
            return new SmtpResult { Status = "PENDING", Response = "SMTP non configurato (placeholder __SET_SMTP_PASSWORD__) - log only" };
        }
        try
        {
            using var msg = new MailMessage(smtpFromAddr, recipient, subject, body) { IsBodyHtml = true };
            if (!string.IsNullOrEmpty(cc)) msg.CC.Add(cc);
            using var smtp = new SmtpClient(smtpHost, port) { EnableSsl = ssl };
            if (!string.IsNullOrEmpty(smtpUser) && !string.IsNullOrEmpty(smtpPwd))
                smtp.Credentials = new NetworkCredential(smtpUser, smtpPwd);
            smtp.Send(msg);
            return new SmtpResult { Status = "SENT", Response = "OK" };
        }
        catch (Exception ex)
        {
            return new SmtpResult { Status = "ERROR", Response = ex.Message.Length > 500 ? ex.Message.Substring(0, 500) : ex.Message };
        }
    }
}
