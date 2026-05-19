using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Conservation;

/// <summary>Configurazione InfoCert LegalDoc (sezione <c>Sdi:Conservation:InfoCert</c>).</summary>
public sealed class InfoCertConservationOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string Endpoint { get; set; } = "https://api.infocert.digital/legaldoc/v1";
    public string CompanyId { get; set; } = string.Empty;
}

/// <summary>
/// Provider InfoCert LegalDoc — partner integration commerciale.
/// InfoCert e' Conservatore Accreditato AgID; pattern simile ad Aruba ma
/// con API key + GUID company.
///
/// **Scaffold/skeleton**: shape API approssimativa, sostituire con doc
/// ufficiale InfoCert LegalDoc (manual.infocert.it) per produzione.
/// </summary>
public sealed class InfoCertConservationProvider : IDigitalConservation
{
    private readonly InfoCertConservationOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<InfoCertConservationProvider> _logger;

    public InfoCertConservationProvider(
        IOptions<InfoCertConservationOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<InfoCertConservationProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "InfoCertConservation";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ApiKey)
                            && SdiConfigHelper.IsSet(_opts.Endpoint)
                            && SdiConfigHelper.IsSet(_opts.CompanyId);

    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public async Task<ConservationResult> SealAsync(
        int fatturaId, string fileName, byte[] payload, string? userId, string? metadataJson, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("InfoCert non configurato: settare Sdi:Conservation:InfoCert:{ApiKey,Endpoint,CompanyId}");

        string hashHex;
        using (var sha = SHA256.Create())
            hashHex = Convert.ToHexString(sha.ComputeHash(payload)).ToLowerInvariant();

        using var http = _httpFactory.CreateClient("InfoCertConservation");
        http.DefaultRequestHeaders.Add("X-API-Key", _opts.ApiKey);
        http.DefaultRequestHeaders.Add("X-Company-Id", _opts.CompanyId);

        try
        {
            using var content = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(payload);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pkcs7-mime");
            content.Add(fileContent, "document", fileName);
            content.Add(new StringContent(hashHex), "sha256");
            if (!string.IsNullOrEmpty(metadataJson))
                content.Add(new StringContent(metadataJson, System.Text.Encoding.UTF8, "application/json"), "metadata");

            using var resp = await http.PostAsync(
                $"{_opts.Endpoint.TrimEnd('/')}/documents", content, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"InfoCert HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            using var doc = JsonDocument.Parse(body);
            string docId = doc.RootElement.TryGetProperty("documentId", out var d) ? (d.GetString() ?? "INFOCERT-NOID") : "INFOCERT-NOID";
            string? tsToken64 = doc.RootElement.TryGetProperty("rfc3161Token", out var ts) ? ts.GetString() : null;
            byte[]? tsTokenBytes = !string.IsNullOrEmpty(tsToken64) ? Convert.FromBase64String(tsToken64) : null;

            int conservationId;
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var cmd = new SqlCommand(@"
INSERT INTO dbo.conservazione_index
  (fattura_id, nome_file, file_size_bytes, sha256_hash, provider, storage_location,
   rfc3161_timestamp, sealed_by_user_id, metadata_json, provider_response)
OUTPUT INSERTED.id
VALUES (@fid, @fn, @sz, @sha, @prov, @loc, @ts, @uid, @meta, @resp)
", cn);
                cmd.Parameters.AddWithValue("@fid",  fatturaId);
                cmd.Parameters.AddWithValue("@fn",   fileName);
                cmd.Parameters.AddWithValue("@sz",   (long)payload.Length);
                cmd.Parameters.AddWithValue("@sha",  hashHex);
                cmd.Parameters.AddWithValue("@prov", Name);
                cmd.Parameters.AddWithValue("@loc",  $"infocert://{_opts.CompanyId}/{docId}");
                cmd.Parameters.AddWithValue("@ts",   (object?)tsTokenBytes ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@uid",  (object?)userId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@meta", (object?)metadataJson ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@resp", body);
                conservationId = (int)(await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false))!;
            }

            return new ConservationResult
            {
                Ok = true,
                ProviderName = Name,
                ConservationIndexId = conservationId,
                StorageLocation = $"infocert://{_opts.CompanyId}/{docId}",
                Sha256Hash = hashHex,
                TimestampObtained = tsTokenBytes is not null,
                Message = $"Sigillato in InfoCert LegalDoc (documentId={docId})"
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "InfoCertConservationProvider HTTP error");
            return Failure("Errore di rete verso InfoCert: " + ex.Message);
        }
    }

    public Task<VerifyResult> VerifyAsync(int conservationIndexId, CancellationToken ct = default)
    {
        // InfoCert verify API: GET /documents/{id}/integrity → ok + signedHash
        // Implementazione analoga ad ArubaConservationProvider.VerifyAsync.
        // Per ora ritorna stub finche' non c'e' contratto cliente con InfoCert.
        return Task.FromResult(new VerifyResult
        {
            Ok = false,
            Message = "InfoCert.VerifyAsync non implementato (richiede credenziali contratto)"
        });
    }

    private ConservationResult Failure(string msg) =>
        new() { Ok = false, ProviderName = Name, Message = msg };
}
