using System;
using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Configurazione provider DirectPec (sezione <c>Sdi:DirectPec</c>).
/// Invio diretto al SDI tramite la propria casella PEC — l'unica opzione
/// SENZA intermediari commerciali a pagamento. Costo: solo la casella PEC
/// (5-30€/anno, comunque obbligatoria in Italia per imprese/PIVA).
/// </summary>
public sealed class DirectPecOptions
{
    /// <summary>Indirizzo PEC mittente (es. <c>azienda@pec.aruba.it</c>).</summary>
    public string PecFromAddress { get; set; } = string.Empty;

    /// <summary>Username SMTP (di solito uguale all'indirizzo PEC).</summary>
    public string SmtpUsername { get; set; } = string.Empty;

    /// <summary>Password SMTP della casella PEC.</summary>
    public string SmtpPassword { get; set; } = string.Empty;

    /// <summary>Server SMTP del provider PEC (es. <c>smtps.pec.aruba.it</c>).</summary>
    public string SmtpHost { get; set; } = string.Empty;

    /// <summary>Porta SMTP (default 465 SSL implicit, 587 STARTTLS).</summary>
    public int SmtpPort { get; set; } = 465;

    /// <summary>SSL/TLS (default true, richiesto da quasi tutti i provider PEC).</summary>
    public bool EnableSsl { get; set; } = true;

    /// <summary>
    /// Indirizzo SDI ufficiale Agenzia delle Entrate. Default
    /// <c>sdi01@pec.fatturapa.it</c> (production canale principale).
    /// Test environment: <c>sdi01@pec.fatturapa.it</c> stesso indirizzo,
    /// la modalita' di test/produzione e' decisa dall'Agenzia in base al
    /// contesto del cessionario/committente nell'XML.
    /// </summary>
    public string SdiPecAddress { get; set; } = "sdi01@pec.fatturapa.it";
}

/// <summary>
/// Provider invio SDI tramite **PEC diretta** — gratuito a parte il costo
/// della casella PEC (5-30€/anno).
///
/// Differenza vs intermediari commerciali (Aruba PEC, FatturePEC, ecc.):
/// <list type="bullet">
///   <item>Nessuna fee per fattura (vs ~0,30-1,50€/fattura degli intermediari)</item>
///   <item>Nessuna integrazione API: solo SMTP standard verso server PEC del proprio provider</item>
///   <item>Notifiche SDI (RC=ricevuta consegna, NS=notifica scarto, ecc.) arrivano via PEC come response</item>
/// </list>
///
/// Requisiti:
/// <list type="bullet">
///   <item>Casella PEC del mittente (qualsiasi provider: Aruba, Poste, Register.it, ...)</item>
///   <item>Credenziali SMTP della casella in <c>Sdi:DirectPec</c></item>
///   <item>File <c>.xml.p7m</c> firmato CADES-BES (obbligatorio per invio SDI)</item>
/// </list>
///
/// L'<c>sdi_id</c> ritornato qui e' l'<c>X-MessageID</c> della PEC inviata
/// (placeholder fino a quando arriva la ricevuta SDI). Le ricevute SDI vere
/// (RC/MC/NS/NE/...) arrivano async sulla casella PEC del mittente come email
/// di risposta da <c>sdi01@pec.fatturapa.it</c> e vanno gestite da un poller
/// PEC separato (out of scope di questo provider).
/// </summary>
public sealed class DirectPecSdiProvider : ISdiProvider
{
    private readonly DirectPecOptions _opts;
    private readonly ILogger<DirectPecSdiProvider> _logger;

    public DirectPecSdiProvider(IOptions<DirectPecOptions> opts, ILogger<DirectPecSdiProvider> logger)
    {
        _opts = opts.Value;
        _logger = logger;
    }

    public string Name => "DirectPec";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.PecFromAddress)
                            && SdiConfigHelper.IsSet(_opts.SmtpUsername)
                            && SdiConfigHelper.IsSet(_opts.SmtpPassword)
                            && SdiConfigHelper.IsSet(_opts.SmtpHost);

    public Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Task.FromResult(Failure(
                "DirectPec non configurato: settare Sdi:DirectPec:{PecFromAddress, SmtpUsername, SmtpPassword, SmtpHost}."));

        // SDI accetta SOLO file .xml.p7m firmati come allegato singolo della PEC.
        // Il subject/body sono ignorati dal SDI ma utili per audit interno.
        try
        {
            using var msg = new MailMessage
            {
                From = new MailAddress(_opts.PecFromAddress),
                Subject = $"Trasmissione fattura {fileName}",
                Body = $"Trasmissione automatica fattura elettronica al Sistema di Interscambio.\n" +
                       $"Allegato: {fileName} ({signedPayload.Length} bytes).\n" +
                       $"Mittente: {_opts.PecFromAddress}\n" +
                       $"Generato da: WUIC Framework FatturazioneElettronica",
                IsBodyHtml = false,
            };
            msg.To.Add(_opts.SdiPecAddress);

            // Allegato: il .xml.p7m firmato. Mediatype `application/pkcs7-mime`
            // come da spec SDI (anche `application/octet-stream` accettato).
            using var attachStream = new System.IO.MemoryStream(signedPayload);
            var attach = new Attachment(attachStream, fileName, "application/pkcs7-mime");
            msg.Attachments.Add(attach);

            using var smtp = new SmtpClient(_opts.SmtpHost, _opts.SmtpPort)
            {
                EnableSsl = _opts.EnableSsl,
                Credentials = new NetworkCredential(_opts.SmtpUsername, _opts.SmtpPassword),
                DeliveryMethod = SmtpDeliveryMethod.Network,
                Timeout = 60_000  // 60s — server PEC con TLS handshake possono essere lenti
            };

            // Genera un Message-ID stabile per tracking lato mittente.
            // SDI ritorna le ricevute citando questo ID nel subject.
            string messageId = $"<wuic-sdi-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}@{_opts.PecFromAddress.Split('@')[1]}>";
            msg.Headers.Add("Message-ID", messageId);

            smtp.Send(msg);
            _logger.LogInformation(
                "DirectPecSdiProvider: PEC inviata a {SdiAddress} (file={FileName}, size={Size}b, msgId={MsgId})",
                _opts.SdiPecAddress, fileName, signedPayload.Length, messageId);

            return Task.FromResult(new SdiSubmitResult
            {
                Ok = true,
                SdiId = messageId.Trim('<', '>'),
                Message = $"PEC trasmessa a {_opts.SdiPecAddress}. Ricevuta SDI arrivera' async sulla tua casella PEC.",
                ProviderName = Name
            });
        }
        catch (SmtpException ex)
        {
            _logger.LogError(ex, "DirectPecSdiProvider SMTP error");
            return Task.FromResult(Failure(
                $"PEC submission fallita (SMTP {ex.StatusCode}): {ex.Message}"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DirectPecSdiProvider unexpected error");
            return Task.FromResult(Failure("PEC submission fallita: " + ex.Message));
        }
    }

    private SdiSubmitResult Failure(string msg) =>
        new() { Ok = false, SdiId = string.Empty, Message = msg, ProviderName = Name };
}
