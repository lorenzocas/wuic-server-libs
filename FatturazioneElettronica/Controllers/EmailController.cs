using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

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
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
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
}
