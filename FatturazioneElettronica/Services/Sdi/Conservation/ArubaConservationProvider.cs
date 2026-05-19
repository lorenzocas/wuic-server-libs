using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Conservation;

/// <summary>Configurazione Aruba Conservazione (sezione <c>Sdi:Conservation:Aruba</c>).</summary>
public sealed class ArubaConservationOptions
{
    /// <summary>Username Aruba Doc Cloud (codice cliente Aruba).</summary>
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    /// <summary>API endpoint (default test/UAT, prod: https://api.cloud.aruba.it/conservazione).</summary>
    public string Endpoint { get; set; } = "https://uat-api.cloud.aruba.it/conservazione";
    /// <summary>Identificativo del PdC (Pacchetto di Conservazione) AgID.</summary>
    public string ContractId { get; set; } = string.Empty;
}

/// <summary>
/// Provider Aruba Conservazione Sostitutiva — partner integration commerciale.
/// Scarica responsabilita' AgID sul provider (Aruba e' Conservatore Accreditato
/// AgID), audit trail full + verifiche periodiche automatiche, retention
/// gestita dal provider.
///
/// **Scaffold/skeleton**: la firma esatta dell'API Aruba e' coperta da NDA e
/// documentazione fornita solo a clienti contrattualizzati. Pattern HTTP/JSON
/// implementato qui e' rappresentativo (auth bearer, upload multipart, response
/// con pdcId/sealedAt). Per produzione: sostituire shape request/response
/// con documentazione Aruba ufficiale (manual.cloud.aruba.it).
/// </summary>
public sealed class ArubaConservationProvider : IDigitalConservation
{
    private readonly ArubaConservationOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<ArubaConservationProvider> _logger;

    public ArubaConservationProvider(
        IOptions<ArubaConservationOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<ArubaConservationProvider> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "ArubaConservation";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.Username)
                            && SdiConfigHelper.IsSet(_opts.Password)
                            && SdiConfigHelper.IsSet(_opts.Endpoint)
                            && SdiConfigHelper.IsSet(_opts.ContractId);

    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public async Task<ConservationResult> SealAsync(
        int fatturaId, string fileName, byte[] payload, string? userId, string? metadataJson, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return Failure("Aruba Conservazione non configurato: settare Sdi:Conservation:Aruba:{Username,Password,Endpoint,ContractId}");

        // SHA-256 lato client per audit
        string hashHex;
        using (var sha = SHA256.Create())
            hashHex = Convert.ToHexString(sha.ComputeHash(payload)).ToLowerInvariant();

        using var http = _httpFactory.CreateClient("ArubaConservation");
        // Basic auth (alcuni endpoint Aruba usano OAuth2 client_credentials —
        // qui pattern Basic per semplicita', adattare se necessario)
        var authToken = Convert.ToBase64String(
            System.Text.Encoding.UTF8.GetBytes($"{_opts.Username}:{_opts.Password}"));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", authToken);

        try
        {
            using var content = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(payload);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pkcs7-mime");
            content.Add(fileContent, "file", fileName);
            content.Add(new StringContent(_opts.ContractId), "contractId");
            content.Add(new StringContent(hashHex), "expectedSha256");
            if (!string.IsNullOrEmpty(metadataJson))
                content.Add(new StringContent(metadataJson, System.Text.Encoding.UTF8, "application/json"), "metadata");

            using var resp = await http.PostAsync(
                $"{_opts.Endpoint.TrimEnd('/')}/v1/seal",
                content, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
                return Failure($"Aruba HTTP {(int)resp.StatusCode}: {body[..Math.Min(body.Length, 400)]}");

            // Parse response: { "pdcId": "...", "sealedAt": "...", "tsToken": "<base64>" }
            using var doc = JsonDocument.Parse(body);
            string pdcId = doc.RootElement.TryGetProperty("pdcId", out var p) ? (p.GetString() ?? "ARUBA-NOID") : "ARUBA-NOID";
            string? tsToken64 = doc.RootElement.TryGetProperty("tsToken", out var ts) ? ts.GetString() : null;
            byte[]? tsTokenBytes = !string.IsNullOrEmpty(tsToken64) ? Convert.FromBase64String(tsToken64) : null;

            // INSERT in DB index
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
                cmd.Parameters.AddWithValue("@loc",  $"aruba://{_opts.ContractId}/{pdcId}");
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
                StorageLocation = $"aruba://{_opts.ContractId}/{pdcId}",
                Sha256Hash = hashHex,
                TimestampObtained = tsTokenBytes is not null,
                Message = $"Sigillato in Aruba Conservazione (pdcId={pdcId})"
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "ArubaConservationProvider HTTP error");
            return Failure("Errore di rete verso Aruba Conservazione: " + ex.Message);
        }
    }

    public async Task<VerifyResult> VerifyAsync(int conservationIndexId, CancellationToken ct = default)
    {
        // Aruba verify API: GET /v1/seal/{pdcId}/verify → returns { ok, sealedSha256 }
        string? pdcId = null; string? expectedHash = null;
        using (var cn = new SqlConnection(DataConn))
        {
            await cn.OpenAsync(ct).ConfigureAwait(false);
            using var cmd = new SqlCommand(@"
SELECT storage_location, sha256_hash FROM dbo.conservazione_index WHERE id=@id", cn);
            cmd.Parameters.AddWithValue("@id", conservationIndexId);
            using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
            if (await rdr.ReadAsync(ct).ConfigureAwait(false))
            {
                string loc = rdr.GetString(0);
                expectedHash = rdr.GetString(1);
                pdcId = loc.Replace($"aruba://{_opts.ContractId}/", "");
            }
        }
        if (pdcId is null)
            return new VerifyResult { Ok = false, Message = $"Index {conservationIndexId} non trovato o non Aruba" };

        using var http = _httpFactory.CreateClient("ArubaConservation");
        var authToken = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{_opts.Username}:{_opts.Password}"));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", authToken);

        try
        {
            using var resp = await http.GetAsync(
                $"{_opts.Endpoint.TrimEnd('/')}/v1/seal/{pdcId}/verify", ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
                return new VerifyResult { Ok = false, Message = $"Aruba verify HTTP {(int)resp.StatusCode}" };

            using var doc = JsonDocument.Parse(body);
            bool ok = doc.RootElement.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
            string? sealedSha = doc.RootElement.TryGetProperty("sealedSha256", out var sh) ? sh.GetString() : null;

            return new VerifyResult
            {
                Ok = ok,
                Sha256Expected = expectedHash,
                Sha256Actual = sealedSha,
                TimestampValid = ok,
                Message = ok ? "Aruba verify OK" : "Aruba verify FALLITO: " + body[..Math.Min(body.Length, 300)]
            };
        }
        catch (HttpRequestException ex)
        {
            return new VerifyResult { Ok = false, Message = "Network error verify Aruba: " + ex.Message };
        }
    }

    private ConservationResult Failure(string msg) =>
        new() { Ok = false, ProviderName = Name, Message = msg };
}
