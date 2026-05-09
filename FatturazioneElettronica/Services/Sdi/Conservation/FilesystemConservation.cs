using System;
using System.Collections.Generic;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Org.BouncyCastle.Asn1;
using Org.BouncyCastle.Asn1.Cms;
using Org.BouncyCastle.Asn1.Tsp;
using Org.BouncyCastle.Tsp;

namespace FatturazioneElettronica.Services.Sdi.Conservation;

/// <summary>Configurazione conservazione filesystem (sezione <c>Sdi:Conservation:Filesystem</c>).</summary>
public sealed class FilesystemConservationOptions
{
    /// <summary>Cartella di archivio dei file conservati. Default: <c>Conservazione/</c> sotto host root.</summary>
    public string StorageRoot { get; set; } = string.Empty;

    /// <summary>
    /// URL del Time Stamping Authority RFC 3161 per il timestamp digitale.
    /// Default: <c>https://freetsa.org/tsr</c> (TSA pubblico gratuito).
    /// Production raccomandato: TSA accreditato AgID (Aruba/InfoCert/Poste).
    /// </summary>
    public string TsaUrl { get; set; } = "https://freetsa.org/tsr";

    /// <summary>True per richiedere il timestamp RFC 3161 (default true).
    /// Se false, sigilla solo con SHA-256 + audit log (NON conforme AgID, dev only).</summary>
    public bool EnableRfc3161Timestamp { get; set; } = true;
}

/// <summary>
/// Conservazione filesystem locale + RFC 3161 timestamp via TSA pubblica.
///
/// Pattern:
/// <list type="number">
///   <item>SHA-256 del payload</item>
///   <item>Salva file in <c>StorageRoot/&lt;anno&gt;/&lt;mese&gt;/&lt;fileName&gt;</c></item>
///   <item>Salva metadata sidecar <c>.meta.json</c> con hash + retention + audit</item>
///   <item>Richiede <c>TimeStampToken</c> al TSA (POST RFC 3161 /tsr endpoint)</item>
///   <item>Salva token come <c>.tsr</c> binario</item>
///   <item>INSERT in <c>conservazione_index</c></item>
/// </list>
/// </summary>
public sealed class FilesystemConservation : IDigitalConservation
{
    private readonly FilesystemConservationOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<FilesystemConservation> _logger;

    public FilesystemConservation(
        IOptions<FilesystemConservationOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<FilesystemConservation> logger)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public string Name => "Filesystem";
    public bool IsConfigured => true;  // sempre disponibile (StorageRoot ha default)

    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    private string ResolvedStorageRoot()
    {
        if (!string.IsNullOrWhiteSpace(_opts.StorageRoot))
            return Path.IsPathRooted(_opts.StorageRoot)
                ? _opts.StorageRoot
                : Path.GetFullPath(Path.Combine(FeAppPaths.HostProjectRoot, _opts.StorageRoot));
        return Path.Combine(FeAppPaths.HostProjectRoot, "Conservazione");
    }

    public async Task<ConservationResult> SealAsync(
        int fatturaId, string fileName, byte[] payload, string? userId, string? metadataJson, CancellationToken ct = default)
    {
        if (payload is null || payload.Length == 0)
            return Failure("Payload vuoto");

        try
        {
            // 1. SHA-256
            string hashHex;
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(payload);
                hashHex = Convert.ToHexString(hash).ToLowerInvariant();
            }

            // 2. Storage path: <root>/<yyyy>/<MM>/<fileName>
            var now = DateTime.UtcNow;
            string yearDir = now.Year.ToString("0000");
            string monthDir = now.Month.ToString("00");
            string fullDir = Path.Combine(ResolvedStorageRoot(), yearDir, monthDir);
            Directory.CreateDirectory(fullDir);
            string fullPath = Path.Combine(fullDir, fileName);
            await File.WriteAllBytesAsync(fullPath, payload, ct).ConfigureAwait(false);

            // 3. RFC 3161 timestamp
            byte[]? tsToken = null;
            string? tsaUrl = null;
            string? tsSerial = null;
            if (_opts.EnableRfc3161Timestamp && SdiConfigHelper.IsSet(_opts.TsaUrl))
            {
                try
                {
                    var (token, serial) = await RequestRfc3161TimestampAsync(payload, _opts.TsaUrl, ct).ConfigureAwait(false);
                    tsToken = token;
                    tsaUrl = _opts.TsaUrl;
                    tsSerial = serial;
                    string tsrPath = fullPath + ".tsr";
                    await File.WriteAllBytesAsync(tsrPath, tsToken, ct).ConfigureAwait(false);
                    _logger.LogInformation(
                        "FilesystemConservation: TSA timestamp obtained from {Tsa} (serial={Serial})", tsaUrl, tsSerial);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "FilesystemConservation: TSA request failed, sigillo senza timestamp");
                    // Continua senza timestamp — meglio avere conservazione senza TSA che fallire del tutto.
                    // L'operatore vede la mancanza in `conservazione_index.rfc3161_timestamp IS NULL`.
                }
            }

            // 4. Sidecar JSON con metadata leggibili
            string metaPath = fullPath + ".meta.json";
            string metaContent = System.Text.Json.JsonSerializer.Serialize(new
            {
                fatturaId,
                fileName,
                sha256 = hashHex,
                fileSizeBytes = payload.Length,
                sealedAt = now,
                sealedBy = userId,
                retentionUntil = now.AddYears(10),
                tsaUrl,
                tsSerial,
                metadataJson
            }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(metaPath, metaContent, ct).ConfigureAwait(false);

            // 5. INSERT in DB index
            int conservationId;
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var cmd = new SqlCommand(@"
INSERT INTO dbo.conservazione_index
  (fattura_id, nome_file, file_size_bytes, sha256_hash, provider, storage_location,
   rfc3161_timestamp, rfc3161_tsa_url, rfc3161_serial_hex, sealed_by_user_id, metadata_json)
OUTPUT INSERTED.id
VALUES (@fid, @fn, @sz, @sha, @prov, @loc, @ts, @tsa, @tser, @uid, @meta)
", cn);
                cmd.Parameters.AddWithValue("@fid",  fatturaId);
                cmd.Parameters.AddWithValue("@fn",   fileName);
                cmd.Parameters.AddWithValue("@sz",   (long)payload.Length);
                cmd.Parameters.AddWithValue("@sha",  hashHex);
                cmd.Parameters.AddWithValue("@prov", Name);
                cmd.Parameters.AddWithValue("@loc",  fullPath);
                cmd.Parameters.AddWithValue("@ts",   (object?)tsToken ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tsa",  (object?)tsaUrl  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tser", (object?)tsSerial?? DBNull.Value);
                cmd.Parameters.AddWithValue("@uid",  (object?)userId  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@meta", (object?)metadataJson ?? DBNull.Value);
                conservationId = (int)(await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false))!;
            }

            return new ConservationResult
            {
                Ok = true,
                ProviderName = Name,
                ConservationIndexId = conservationId,
                StorageLocation = fullPath,
                Sha256Hash = hashHex,
                TimestampObtained = tsToken is not null,
                TsaUrl = tsaUrl,
                Message = $"Sigillato in {fullPath}, hash={hashHex.Substring(0, 16)}…, " +
                          (tsToken is null ? "TSA SKIP" : $"TSA serial={tsSerial}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FilesystemConservation.SealAsync failed");
            return Failure("Sigillatura fallita: " + ex.Message);
        }
    }

    public async Task<VerifyResult> VerifyAsync(int conservationIndexId, CancellationToken ct = default)
    {
        try
        {
            string sha256Expected; string filePath; long sizeExpected;
            byte[]? tsToken;
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var cmd = new SqlCommand(@"
SELECT sha256_hash, storage_location, file_size_bytes, rfc3161_timestamp
FROM dbo.conservazione_index WHERE id = @id", cn);
                cmd.Parameters.AddWithValue("@id", conservationIndexId);
                using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
                if (!await rdr.ReadAsync(ct).ConfigureAwait(false))
                    return new VerifyResult { Ok = false, Message = $"Index {conservationIndexId} non trovato" };
                sha256Expected = rdr.GetString(0);
                filePath = rdr.GetString(1);
                sizeExpected = rdr.GetInt64(2);
                tsToken = rdr.IsDBNull(3) ? null : (byte[])rdr.GetValue(3);
            }

            if (!File.Exists(filePath))
                return new VerifyResult { Ok = false, Sha256Expected = sha256Expected,
                    Message = $"File non trovato: {filePath}" };

            byte[] actual = await File.ReadAllBytesAsync(filePath, ct).ConfigureAwait(false);
            string sha256Actual;
            using (var sha = SHA256.Create())
                sha256Actual = Convert.ToHexString(sha.ComputeHash(actual)).ToLowerInvariant();

            bool ok = actual.Length == sizeExpected
                   && string.Equals(sha256Actual, sha256Expected, StringComparison.OrdinalIgnoreCase);

            // Verify TSA token (only structural validity — signing cert chain
            // requires CA bundle, fuori scope del filesystem provider).
            bool tsValid = false;
            if (tsToken is not null)
            {
                try
                {
                    var resp = new TimeStampResponse(new MemoryStream(tsToken));
                    var tst = resp.TimeStampToken;
                    tsValid = tst is not null;
                }
                catch (Exception) { tsValid = false; }
            }

            // Update audit (last_verified_*)
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var upd = new SqlCommand(@"
UPDATE dbo.conservazione_index
SET last_verified_at = SYSUTCDATETIME(), last_verified_ok = @ok
WHERE id = @id", cn);
                upd.Parameters.AddWithValue("@ok", ok);
                upd.Parameters.AddWithValue("@id", conservationIndexId);
                await upd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            }

            return new VerifyResult
            {
                Ok = ok,
                Sha256Expected = sha256Expected,
                Sha256Actual = sha256Actual,
                TimestampValid = tsValid,
                Message = ok
                    ? $"Integrita' OK (SHA-256 match, TSA={(tsValid ? "valid" : "absent/invalid")})"
                    : $"Integrita' FALLITA: hash mismatch (expected={sha256Expected[..16]}…, actual={sha256Actual[..16]}…)"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FilesystemConservation.VerifyAsync failed");
            return new VerifyResult { Ok = false, Message = "Verifica eccezione: " + ex.Message };
        }
    }

    /// <summary>
    /// Richiede un TimeStampToken RFC 3161 al TSA. Costruisce un TimeStampReq
    /// con SHA-256 del payload, fa POST <c>application/timestamp-query</c>,
    /// riceve <c>application/timestamp-reply</c> e ritorna il token DER.
    /// </summary>
    private async Task<(byte[] token, string serial)> RequestRfc3161TimestampAsync(
        byte[] payload, string tsaUrl, CancellationToken ct)
    {
        // Build TimeStampReq via BouncyCastle
        var reqGen = new TimeStampRequestGenerator();
        reqGen.SetCertReq(true);  // include cert TSA nel response (per audit)
        byte[] payloadHash;
        using (var sha = SHA256.Create())
            payloadHash = sha.ComputeHash(payload);

        var nonce = Org.BouncyCastle.Math.BigInteger.ValueOf(DateTime.UtcNow.Ticks);
        var tsReq = reqGen.Generate(
            digestAlgorithmOid: NistObjectIdentifiers.IdSha256.Id,
            digest: payloadHash,
            nonce: nonce);
        byte[] reqBytes = tsReq.GetEncoded();

        using var http = _httpFactory.CreateClient("Rfc3161Tsa");
        using var content = new ByteArrayContent(reqBytes);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/timestamp-query");
        using var resp = await http.PostAsync(tsaUrl, content, ct).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"TSA HTTP {(int)resp.StatusCode}: {resp.ReasonPhrase}");

        byte[] tsRespBytes = await resp.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
        var tsResp = new TimeStampResponse(tsRespBytes);
        tsResp.Validate(tsReq);
        var tst = tsResp.TimeStampToken
            ?? throw new InvalidOperationException("TSA response senza TimeStampToken");

        byte[] tokenBytes = tst.GetEncoded();
        string serial = tst.TimeStampInfo?.SerialNumber?.ToString(16) ?? "?";
        return (tokenBytes, serial);
    }

    private ConservationResult Failure(string msg) =>
        new() { Ok = false, ProviderName = Name, Message = msg };
}

/// <summary>BouncyCastle ASN.1 OID stub per SHA-256 (NistObjectIdentifiers).</summary>
internal static class NistObjectIdentifiers
{
    public static DerObjectIdentifier IdSha256 { get; } = new DerObjectIdentifier("2.16.840.1.101.3.4.2.1");
}
