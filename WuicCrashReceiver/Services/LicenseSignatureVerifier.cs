using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Port standalone di <c>LicenseValidationService.TryVerifySignature</c> da
///  <c>KonvergenceCore/Services/Licensing/LicenseValidationService.cs</c>.
///
///  Verifica che il payload license firmato con private key vendor sia
///  autentico (RSA-SHA256, PKCS#1 v1.5). Il public key e' embedded in
///  config <c>License:PublicKeyPem</c>. Replica EXACTLY il canonical-payload
///  builder per garantire compatibilita' bit-perfect con i client
///  (KonvergenceCore embed) che gia' firmano.
///
///  NOTE: niente IConfiguration injection — il PEM viene passato a costructor
///  cosi' la classe e' unit-test-friendly e non dipende dal DI tree.
/// </summary>
public sealed class LicenseSignatureVerifier
{
    private readonly string _publicKeyPem;

    public LicenseSignatureVerifier(string publicKeyPem)
    {
        if (string.IsNullOrWhiteSpace(publicKeyPem))
        {
            throw new ArgumentException("publicKeyPem required", nameof(publicKeyPem));
        }
        _publicKeyPem = publicKeyPem;
    }

    public sealed record VerifyResult(bool Valid, string? Error, LicensePayload? Payload);

    public sealed record LicensePayload(
        string Email,
        DateTimeOffset ExpiryUtc,
        IReadOnlyList<string> MachineFingerprints,
        DateTimeOffset? MaintenanceExpiryUtc,
        string Tier,
        IReadOnlyList<string> Features);

    /// <summary>
    ///  Verifica firma + ritorna payload deserializzato. Il client invia
    ///  payload + signature in 2 header HTTP separati (X-Wuic-License-Payload
    ///  base64, X-Wuic-License-Signature base64).
    /// </summary>
    public VerifyResult Verify(string payloadJsonBase64, string signatureBase64)
    {
        if (string.IsNullOrWhiteSpace(payloadJsonBase64))
            return new VerifyResult(false, "license_payload_missing", null);
        if (string.IsNullOrWhiteSpace(signatureBase64))
            return new VerifyResult(false, "license_signature_missing", null);

        // Decode payload (base64 → JSON string).
        string payloadJson;
        try
        {
            payloadJson = Encoding.UTF8.GetString(Convert.FromBase64String(payloadJsonBase64.Trim()));
        }
        catch
        {
            return new VerifyResult(false, "license_payload_invalid_base64", null);
        }

        // Parse payload fields.
        LicensePayload? payload;
        try
        {
            payload = ParsePayload(payloadJson);
        }
        catch
        {
            return new VerifyResult(false, "license_payload_parse_error", null);
        }
        if (payload == null)
            return new VerifyResult(false, "license_payload_parse_error", null);

        // Build canonical (deterministic) representation — must match the
        // emit-side EXACTLY (KonvergenceCore.LicenseValidationService.BuildCanonicalPayload).
        string canonical = BuildCanonicalPayload(payload);
        if (string.IsNullOrEmpty(canonical))
            return new VerifyResult(false, "license_canonical_build_failed", null);

        // Verify RSA signature.
        byte[] signatureBytes;
        try
        {
            signatureBytes = Convert.FromBase64String(signatureBase64.Trim());
        }
        catch
        {
            return new VerifyResult(false, "license_signature_invalid_base64", null);
        }

        try
        {
            using RSA rsa = RSA.Create();
            rsa.ImportFromPem(_publicKeyPem.ToCharArray());
            bool ok = rsa.VerifyData(
                Encoding.UTF8.GetBytes(canonical),
                signatureBytes,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            if (!ok)
                return new VerifyResult(false, "invalid_signature", null);
            return new VerifyResult(true, null, payload);
        }
        catch
        {
            return new VerifyResult(false, "license_public_key_invalid", null);
        }
    }

    private static LicensePayload? ParsePayload(string json)
    {
        using JsonDocument doc = JsonDocument.Parse(json);
        JsonElement root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) return null;

        string email = root.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(email)) return null;

        DateTimeOffset expiry = ReadDate(root, "expiryUtc") ?? DateTimeOffset.MinValue;
        DateTimeOffset? maintenance = ReadDate(root, "maintenanceExpiryUtc");
        string tier = root.TryGetProperty("tier", out var t) ? t.GetString() ?? "" : "";

        var fingerprints = new List<string>();
        if (root.TryGetProperty("machineFingerprints", out var fpEl) && fpEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in fpEl.EnumerateArray())
            {
                fingerprints.Add(item.GetString() ?? "");
            }
        }

        var features = new List<string>();
        if (root.TryGetProperty("features", out var ftEl) && ftEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in ftEl.EnumerateArray())
            {
                features.Add(item.GetString() ?? "");
            }
        }

        return new LicensePayload(email, expiry, fingerprints, maintenance, tier, features);
    }

    private static DateTimeOffset? ReadDate(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var el)) return null;
        if (el.ValueKind != JsonValueKind.String) return null;
        string s = el.GetString() ?? "";
        if (string.IsNullOrWhiteSpace(s)) return null;
        return DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto)
            ? dto
            : (DateTimeOffset?)null;
    }

    /// <summary>
    ///  Replica EXACTLY <c>LicenseValidationService.BuildCanonicalPayload</c>
    ///  da KonvergenceCore. Cambiamenti qui DEVONO essere sincronizzati con
    ///  l'emit-side, altrimenti tutte le verifiche falliscono.
    /// </summary>
    private static string BuildCanonicalPayload(LicensePayload p)
    {
        try
        {
            using var stream = new MemoryStream();
            using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions
            {
                Indented = false,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            }))
            {
                writer.WriteStartObject();
                writer.WriteString("email", p.Email.Trim());
                writer.WriteString("expiryUtc", p.ExpiryUtc.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
                writer.WritePropertyName("machineFingerprints");
                writer.WriteStartArray();
                foreach (string fp in p.MachineFingerprints)
                {
                    writer.WriteStringValue((fp ?? string.Empty).Trim().ToLowerInvariant());
                }
                writer.WriteEndArray();
                if (p.MaintenanceExpiryUtc.HasValue)
                {
                    writer.WriteString("maintenanceExpiryUtc",
                        p.MaintenanceExpiryUtc.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
                }
                writer.WriteString("tier", (p.Tier ?? string.Empty).Trim().ToLowerInvariant());
                writer.WritePropertyName("features");
                writer.WriteStartArray();
                foreach (string f in p.Features)
                {
                    writer.WriteStringValue((f ?? string.Empty).Trim().ToLowerInvariant());
                }
                writer.WriteEndArray();
                writer.WriteEndObject();
            }
            return Encoding.UTF8.GetString(stream.ToArray());
        }
        catch
        {
            return string.Empty;
        }
    }
}
