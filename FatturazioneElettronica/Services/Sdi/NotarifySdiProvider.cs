using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>Configurazione provider Notarify (sezione <c>Sdi:Notarify</c>).</summary>
public sealed class NotarifyOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
    public string Endpoint { get; set; } = "https://api.notarify.com/sdi/v1/send";

    /// <summary>
    /// Endpoint REST per il poll delle notifiche SDI. Default
    /// <c>https://api.notarify.com/sdi/v1/notifications</c>. Verificare
    /// contro la documentazione Notarify corrente.
    /// </summary>
    public string NotificationsEndpoint { get; set; } = "https://api.notarify.com/sdi/v1/notifications";

    /// <summary>Max notifiche per ciclo (rate limit, default 50).</summary>
    public int NotificationsMaxPerCycle { get; set; } = 50;
}

/// <summary>
/// Provider Notarify via REST API. Auth via header dual <c>X-API-Key</c> +
/// <c>X-API-Secret</c>. Body multipart con file .xml.p7m.
/// </summary>
public sealed class NotarifySdiProvider : ISdiProvider
{
    private readonly NotarifyOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<NotarifySdiProvider> _logger;

    public NotarifySdiProvider(IOptions<NotarifyOptions> opts, IHttpClientFactory httpFactory, ILogger<NotarifySdiProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "Notarify";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ApiKey)
                            && SdiConfigHelper.IsSet(_opts.ApiSecret)
                            && SdiConfigHelper.IsSet(_opts.Endpoint);

    public async Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("Notarify non configurato: settare Sdi:Notarify:ApiKey/ApiSecret/Endpoint in appsettings.");

        using var http = _httpFactory.CreateClient("NotarifySdi");
        using var req = new HttpRequestMessage(HttpMethod.Post, _opts.Endpoint);
        req.Headers.Add("X-API-Key", _opts.ApiKey);
        req.Headers.Add("X-API-Secret", _opts.ApiSecret);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(signedPayload);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pkcs7-mime");
        content.Add(fileContent, "invoice", fileName);
        req.Content = content;

        try
        {
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"Notarify HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            try
            {
                using var doc = JsonDocument.Parse(body);
                string sdiId = doc.RootElement.TryGetProperty("notarizationId", out var nid) ? (nid.GetString() ?? "NOTARIFY-NOID") :
                               doc.RootElement.TryGetProperty("id", out var i) ? (i.GetString() ?? "NOTARIFY-NOID") :
                               "NOTARIFY-NOID";
                string? errorCode = doc.RootElement.TryGetProperty("errorCode", out var ec) && ec.ValueKind == JsonValueKind.String ? ec.GetString() : null;
                bool ok = string.IsNullOrEmpty(errorCode);
                return new SdiSubmitResult
                {
                    Ok = ok,
                    SdiId = sdiId,
                    ErrorCode = errorCode,
                    Message = ok ? "Trasmesso a Notarify" : "Notarify reject: " + body[..Math.Min(body.Length, 300)],
                    ProviderName = Name
                };
            }
            catch (JsonException)
            {
                return Failure("Notarify response non-JSON: " + body[..Math.Min(body.Length, 400)]);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "NotarifySdiProvider HTTP error");
            return Failure("Errore di rete verso Notarify: " + ex.Message);
        }
    }

    private SdiSubmitResult Failure(string msg) =>
        new() { Ok = false, SdiId = string.Empty, Message = msg, ProviderName = Name };
}
