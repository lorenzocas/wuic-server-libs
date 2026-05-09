using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>Configurazione provider Pec.it (sezione <c>Sdi:PecIt</c>).</summary>
public sealed class PecItOptions
{
    /// <summary>Bearer token (OAuth2 client_credentials o API token statico).</summary>
    public string BearerToken { get; set; } = string.Empty;
    public string Endpoint { get; set; } = "https://api.pec.it/v1/sdi/submit";

    /// <summary>
    /// Endpoint REST per il poll delle notifiche SDI. Default
    /// <c>https://api.pec.it/v1/sdi/notifications</c>. Verificare contro
    /// la documentazione Pec.it corrente.
    /// </summary>
    public string NotificationsEndpoint { get; set; } = "https://api.pec.it/v1/sdi/notifications";

    /// <summary>Max notifiche per ciclo (rate limit, default 50).</summary>
    public int NotificationsMaxPerCycle { get; set; } = 50;
}

/// <summary>Provider Pec.it via REST API. Bearer auth header. JSON body con base64 payload.</summary>
public sealed class PecItSdiProvider : ISdiProvider
{
    private readonly PecItOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<PecItSdiProvider> _logger;

    public PecItSdiProvider(IOptions<PecItOptions> opts, IHttpClientFactory httpFactory, ILogger<PecItSdiProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "PecIt";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.BearerToken)
                            && SdiConfigHelper.IsSet(_opts.Endpoint);

    public async Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("Pec.it non configurato: settare Sdi:PecIt:BearerToken/Endpoint in appsettings.");

        using var http = _httpFactory.CreateClient("PecItSdi");
        using var req = new HttpRequestMessage(HttpMethod.Post, _opts.Endpoint);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.BearerToken);

        var payload = new
        {
            fileName,
            content = Convert.ToBase64String(signedPayload),
            contentType = "application/pkcs7-mime"
        };
        req.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            System.Text.Encoding.UTF8,
            "application/json");

        try
        {
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"Pec.it HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            try
            {
                using var doc = JsonDocument.Parse(body);
                string sdiId = doc.RootElement.TryGetProperty("trackingId", out var t) ? (t.GetString() ?? "PECIT-NOID") :
                               doc.RootElement.TryGetProperty("id", out var i) ? (i.GetString() ?? "PECIT-NOID") :
                               "PECIT-NOID";
                string? errorCode = doc.RootElement.TryGetProperty("errorCode", out var ec) && ec.ValueKind == JsonValueKind.String ? ec.GetString() : null;
                bool ok = string.IsNullOrEmpty(errorCode);
                return new SdiSubmitResult
                {
                    Ok = ok,
                    SdiId = sdiId,
                    ErrorCode = errorCode,
                    Message = ok ? "Trasmesso a Pec.it" : "Pec.it reject: " + body[..Math.Min(body.Length, 300)],
                    ProviderName = Name
                };
            }
            catch (JsonException)
            {
                return Failure("Pec.it response non-JSON: " + body[..Math.Min(body.Length, 400)]);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "PecItSdiProvider HTTP error");
            return Failure("Errore di rete verso Pec.it: " + ex.Message);
        }
    }

    private SdiSubmitResult Failure(string msg) =>
        new() { Ok = false, SdiId = string.Empty, Message = msg, ProviderName = Name };
}
