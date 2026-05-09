using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>Configurazione provider Aruba PEC (sezione <c>Sdi:Aruba</c>).</summary>
public sealed class ArubaPecOptions
{
    /// <summary>Username dell'account Aruba (codice cliente).</summary>
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// Endpoint SOAP. Default <c>https://ws.fatturazione.aruba.it/services/invoice</c>
    /// (production). Test environment: <c>https://wstest.fatturazione.aruba.it/services/invoice</c>.
    /// </summary>
    public string Endpoint { get; set; } = "https://ws.fatturazione.aruba.it/services/invoice";

    /// <summary>SOAP action header (default <c>sendInvoice</c>).</summary>
    public string SoapAction { get; set; } = "sendInvoice";

    /// <summary>
    /// Endpoint SOAP per il poll delle notifiche (RC/MC/NS/AT/NE/DT) ricevute
    /// da SDI per le fatture inviate. Default
    /// <c>https://ws.fatturazione.aruba.it/services/notifications</c>.
    /// L'operatore puo' overridarlo in <c>Sdi:ArubaPec:NotificationsEndpoint</c>
    /// (es. per puntare al sandbox <c>wstest.fatturazione.aruba.it</c>).
    /// </summary>
    public string NotificationsEndpoint { get; set; } = "https://ws.fatturazione.aruba.it/services/notifications";

    /// <summary>SOAP action header per il poll notifiche (default <c>getNotifications</c>).</summary>
    public string NotificationsSoapAction { get; set; } = "getNotifications";

    /// <summary>Numero massimo di notifiche scaricate per ciclo (rate limit, default 50).</summary>
    public int NotificationsMaxPerCycle { get; set; } = 50;
}

/// <summary>
/// Provider Aruba PEC via SOAP web-service di fatturazione.
/// </summary>
public sealed class ArubaPecSdiProvider : ISdiProvider
{
    private readonly ArubaPecOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<ArubaPecSdiProvider> _logger;

    public ArubaPecSdiProvider(IOptions<ArubaPecOptions> opts, IHttpClientFactory httpFactory, ILogger<ArubaPecSdiProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "ArubaPec";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.Username)
                            && SdiConfigHelper.IsSet(_opts.Password)
                            && SdiConfigHelper.IsSet(_opts.Endpoint);

    public async Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("Aruba PEC non configurato: settare Sdi:Aruba:Username/Password/Endpoint in appsettings.");

        // SOAP envelope per Aruba "sendInvoice" — payload base64-encoded.
        // Fonte: Aruba PEC Fatturazione Elettronica WSDL (proprietary).
        // Schema reale richiede WSSE Security header con UsernameToken.
        string base64 = Convert.ToBase64String(signedPayload);
        string envelope =
            "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
            "xmlns:fat=\"http://service.invoice.fatturazione.aruba.com/\">" +
                "<soapenv:Header>" +
                "<wsse:Security xmlns:wsse=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\">" +
                    "<wsse:UsernameToken>" +
                    $"<wsse:Username>{Escape(_opts.Username)}</wsse:Username>" +
                    $"<wsse:Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText\">{Escape(_opts.Password)}</wsse:Password>" +
                    "</wsse:UsernameToken>" +
                "</wsse:Security>" +
                "</soapenv:Header>" +
                "<soapenv:Body>" +
                "<fat:sendInvoice>" +
                    $"<fileName>{Escape(fileName)}</fileName>" +
                    $"<dataFile>{base64}</dataFile>" +
                "</fat:sendInvoice>" +
                "</soapenv:Body>" +
            "</soapenv:Envelope>";

        using var http = _httpFactory.CreateClient("ArubaPecSdi");
        using var req = new HttpRequestMessage(HttpMethod.Post, _opts.Endpoint)
        {
            Content = new StringContent(envelope, Encoding.UTF8, "text/xml")
        };
        req.Headers.Add("SOAPAction", _opts.SoapAction);

        try
        {
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"Aruba HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            // Parse response per estrarre <sdiId> (formato Aruba). Fallback:
            // se non si trova un identificativo, ritorna il body raw come messaggio.
            string sdiId = ExtractTag(body, "sdiId") ?? ExtractTag(body, "messageId") ?? "ARUBA-NOID";
            string? errorCode = ExtractTag(body, "errorCode");

            if (!string.IsNullOrEmpty(errorCode))
                return new SdiSubmitResult { Ok = false, SdiId = sdiId, ErrorCode = errorCode, Message = body[..Math.Min(body.Length, 300)], ProviderName = Name };

            return new SdiSubmitResult { Ok = true, SdiId = sdiId, Message = "Trasmesso ad Aruba PEC", ProviderName = Name };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "ArubaPecSdiProvider HTTP error");
            return Failure("Errore di rete verso Aruba PEC: " + ex.Message);
        }
    }

    private SdiSubmitResult Failure(string msg) =>
        new() { Ok = false, SdiId = string.Empty, Message = msg, ProviderName = Name };

    private static string Escape(string s) => System.Security.SecurityElement.Escape(s) ?? string.Empty;

    private static string? ExtractTag(string xml, string tag)
    {
        // Estrae il primo `<tag>...</tag>` dal body (no namespace handling — sufficiente per audit).
        var m = Regex.Match(xml, $@"<{Regex.Escape(tag)}[^>]*>([^<]+)</[^:]*:?{Regex.Escape(tag)}>", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.Trim() : null;
    }
}
