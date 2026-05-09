using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>Configurazione provider FatturePEC (sezione <c>Sdi:FatturePec</c>).</summary>
public sealed class FatturePecOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string Endpoint { get; set; } = "https://api.fatturepec.com/v1/invoices/send";

    /// <summary>
    /// Endpoint REST per il poll delle notifiche SDI ricevute. Default
    /// <c>https://api.fatturepec.com/v1/notifications</c>. Verificare contro
    /// la documentazione FatturePEC corrente — i nomi delle path possono
    /// cambiare con le release API.
    /// </summary>
    public string NotificationsEndpoint { get; set; } = "https://api.fatturepec.com/v1/notifications";

    /// <summary>Max notifiche per ciclo (rate limit, default 50).</summary>
    public int NotificationsMaxPerCycle { get; set; } = 50;
}

/// <summary>
/// Provider FatturePEC via REST API (POST multipart con file .xml.p7m).
/// API key in header <c>X-API-Key</c>.
/// </summary>
public sealed class FatturePecSdiProvider : ISdiProvider
{
    private readonly FatturePecOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<FatturePecSdiProvider> _logger;

    public FatturePecSdiProvider(IOptions<FatturePecOptions> opts, IHttpClientFactory httpFactory, ILogger<FatturePecSdiProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "FatturePec";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ApiKey)
                            && SdiConfigHelper.IsSet(_opts.Endpoint);

    public async Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("FatturePEC non configurato: settare Sdi:FatturePec:ApiKey/Endpoint in appsettings.");

        using var http = _httpFactory.CreateClient("FatturePecSdi");
        using var req = new HttpRequestMessage(HttpMethod.Post, _opts.Endpoint);
        req.Headers.Add("X-API-Key", _opts.ApiKey);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(signedPayload);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pkcs7-mime");
        content.Add(fileContent, "file", fileName);
        req.Content = content;

        try
        {
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"FatturePEC HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            // Tipico response JSON: { "id": "<sdiId>", "status": "submitted", "errorCode": null }
            try
            {
                using var doc = JsonDocument.Parse(body);
                string sdiId = doc.RootElement.TryGetProperty("id", out var idEl) ? (idEl.GetString() ?? "FATTUREPEC-NOID") : "FATTUREPEC-NOID";
                string? errorCode = doc.RootElement.TryGetProperty("errorCode", out var ec) && ec.ValueKind == JsonValueKind.String ? ec.GetString() : null;
                bool ok = string.IsNullOrEmpty(errorCode);
                return new SdiSubmitResult
                {
                    Ok = ok,
                    SdiId = sdiId,
                    ErrorCode = errorCode,
                    Message = ok ? "Trasmesso a FatturePEC" : "FatturePEC reject: " + body[..Math.Min(body.Length, 300)],
                    ProviderName = Name
                };
            }
            catch (JsonException)
            {
                return Failure("FatturePEC response non-JSON: " + body[..Math.Min(body.Length, 400)]);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "FatturePecSdiProvider HTTP error");
            return Failure("Errore di rete verso FatturePEC: " + ex.Message);
        }
    }

    private SdiSubmitResult Failure(string msg) =>
        new() { Ok = false, SdiId = string.Empty, Message = msg, ProviderName = Name };
}
