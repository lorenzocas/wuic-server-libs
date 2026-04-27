using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  POST /api/admin/licenses — register/upsert one license_history row from
///  a sync invocation by the vendor's `license-issue.ps1 -SyncRemote` tool.
///  Skill: license-issuing.
///
///  Atomicita' debole: il tool firma + scrive locale per primo, poi POSTa qui.
///  Se il POST fallisce, il tool error → vendor rilancia con `license-resync.ps1`.
/// </summary>
public sealed class LicenseRegisterRequest
{
    [JsonPropertyName("email")]                    public string? Email { get; set; }
    [JsonPropertyName("customerName")]             public string? CustomerName { get; set; }
    [JsonPropertyName("notes")]                    public string? Notes { get; set; }

    [JsonPropertyName("tier")]                     public string? Tier { get; set; }
    [JsonPropertyName("featuresJson")]             public string? FeaturesJson { get; set; }
    [JsonPropertyName("expiryUtc")]                public DateTime? ExpiryUtc { get; set; }
    [JsonPropertyName("maintenanceExpiryUtc")]     public DateTime? MaintenanceExpiryUtc { get; set; }

    [JsonPropertyName("machineFingerprintsJson")]  public string? MachineFingerprintsJson { get; set; }
    [JsonPropertyName("licensePayloadBase64")]     public string? LicensePayloadBase64 { get; set; }
    [JsonPropertyName("licenseSignatureBase64")]   public string? LicenseSignatureBase64 { get; set; }

    [JsonPropertyName("issueType")]                public string? IssueType { get; set; }
    [JsonPropertyName("fingerprintCount")]         public int? FingerprintCount { get; set; }
    [JsonPropertyName("basePriceEur")]             public decimal? BasePriceEur { get; set; }
    [JsonPropertyName("extraFingerprintsCharged")] public int? ExtraFingerprintsCharged { get; set; }
    [JsonPropertyName("extraPriceEur")]            public decimal? ExtraPriceEur { get; set; }
    [JsonPropertyName("totalPriceEur")]            public decimal? TotalPriceEur { get; set; }
}

public sealed class LicenseRegisterResponse
{
    [JsonPropertyName("ok")]    public bool Ok { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    /// <summary>license_history id assegnato sul receiver remote.</summary>
    [JsonPropertyName("id")]    public long? Id { get; set; }
    /// <summary>customer_id sul receiver (può differire dal local id se i due DB divergono).</summary>
    [JsonPropertyName("customerId")] public int? CustomerId { get; set; }
}

public sealed class LicenseRevokeRequest
{
    [JsonPropertyName("reason")] public string? Reason { get; set; }
}

public sealed class LicenseListRow
{
    [JsonPropertyName("id")]                     public long Id { get; set; }
    [JsonPropertyName("customerId")]             public int CustomerId { get; set; }
    [JsonPropertyName("email")]                  public string Email { get; set; } = "";
    [JsonPropertyName("customerName")]           public string? CustomerName { get; set; }
    [JsonPropertyName("tier")]                   public string Tier { get; set; } = "";
    [JsonPropertyName("issueType")]              public string IssueType { get; set; } = "";
    [JsonPropertyName("issuedAt")]               public DateTime IssuedAt { get; set; }
    [JsonPropertyName("expiryUtc")]              public DateTime ExpiryUtc { get; set; }
    [JsonPropertyName("maintenanceExpiryUtc")]   public DateTime? MaintenanceExpiryUtc { get; set; }
    [JsonPropertyName("revoked")]                public bool Revoked { get; set; }
    [JsonPropertyName("revokedAt")]              public DateTime? RevokedAt { get; set; }
    [JsonPropertyName("revokedReason")]          public string? RevokedReason { get; set; }
    [JsonPropertyName("fingerprintCount")]       public int? FingerprintCount { get; set; }
    [JsonPropertyName("totalPriceEur")]          public decimal? TotalPriceEur { get; set; }
}

public sealed class LicenseListResponse
{
    [JsonPropertyName("ok")]   public bool Ok { get; set; } = true;
    [JsonPropertyName("rows")] public List<LicenseListRow> Rows { get; set; } = new();
    [JsonPropertyName("total")] public long Total { get; set; }
}

/// <summary>
///  POST /api/admin/versions — registra un push npm/NuGet effettuato dalla
///  pipeline `deploy-release.ps1`. Mirror della funzione locale
///  `Register-WuicVersionHistory`. Almeno uno tra `npmVersion` e
///  `nugetVersion` deve essere non-null (CK constraint DB).
///  Skill license-issuing.
/// </summary>
public sealed class VersionRegisterRequest
{
    [JsonPropertyName("npmVersion")]   public string? NpmVersion { get; set; }
    [JsonPropertyName("nugetVersion")] public string? NugetVersion { get; set; }
    [JsonPropertyName("pushedBy")]     public string? PushedBy { get; set; }
    [JsonPropertyName("notes")]        public string? Notes { get; set; }
}

public sealed class VersionRegisterResponse
{
    [JsonPropertyName("ok")]    public bool Ok { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("id")]    public long? Id { get; set; }
}
