using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  Filtri opzionali per la list view dell'admin (skill crash-reporting Commit 10).
///  Tutti opzionali; combinati in AND. Valori passati via query string.
/// </summary>
public sealed class AdminListFilters
{
    /// <summary>Filtro esatto su <c>error_code</c>. NULL = qualsiasi.</summary>
    public string? ErrorCode { get; set; }
    /// <summary>Filtro esatto su <c>client_id</c> (license email lowercased).</summary>
    public string? ClientId { get; set; }
    /// <summary>Filtro su <c>resolved</c>: 0=open, 1=closed, null=any.</summary>
    public int? Resolved { get; set; }
    /// <summary>Filtro inferiore su <c>last_seen</c> (UTC). null=no lower bound.</summary>
    public DateTime? Since { get; set; }
    /// <summary>Page (1-indexed). Default 1.</summary>
    public int Page { get; set; } = 1;
    /// <summary>Page size. Default 50, capped a 200.</summary>
    public int PageSize { get; set; } = 50;
}

/// <summary>
///  Riga della list view. Subset compatto rispetto al record completo —
///  niente <c>stack_raw</c> / <c>breadcrumbs</c> nella list per minimizzare
///  bandwidth (decine di KB per row).
/// </summary>
public class AdminCrashListRow
{
    [JsonPropertyName("id")]                public long Id { get; set; }
    [JsonPropertyName("clientId")]          public string ClientId { get; set; } = "";
    [JsonPropertyName("clientTier")]        public string ClientTier { get; set; } = "";
    [JsonPropertyName("releaseTag")]        public string ReleaseTag { get; set; } = "";
    [JsonPropertyName("source")]            public string Source { get; set; } = "";
    [JsonPropertyName("type")]              public string Type { get; set; } = "";
    [JsonPropertyName("message")]           public string Message { get; set; } = "";
    [JsonPropertyName("errorCode")]         public string? ErrorCode { get; set; }
    [JsonPropertyName("isTyped")]           public bool IsTyped { get; set; }
    [JsonPropertyName("stackHash")]         public string StackHash { get; set; } = "";
    [JsonPropertyName("firstSeen")]         public DateTime FirstSeen { get; set; }
    [JsonPropertyName("lastSeen")]          public DateTime LastSeen { get; set; }
    [JsonPropertyName("occurrences")]       public int Occurrences { get; set; }
    [JsonPropertyName("resolved")]          public bool Resolved { get; set; }
    [JsonPropertyName("licenseExpiredAtIngest")] public bool LicenseExpiredAtIngest { get; set; }
}

public sealed class AdminListResponse
{
    [JsonPropertyName("ok")]      public bool Ok { get; set; } = true;
    [JsonPropertyName("rows")]    public List<AdminCrashListRow> Rows { get; set; } = new();
    [JsonPropertyName("total")]   public long Total { get; set; }
    [JsonPropertyName("page")]    public int Page { get; set; }
    [JsonPropertyName("pageSize")] public int PageSize { get; set; }
}

/// <summary>
///  Detail completo per la detail view. Include tutti i campi della row
///  + stack_raw + breadcrumbs + extra + args_json + url + userAgent + notes.
/// </summary>
public sealed class AdminCrashDetail : AdminCrashListRow
{
    [JsonPropertyName("stackRaw")]    public string StackRaw { get; set; } = "";
    [JsonPropertyName("url")]         public string? Url { get; set; }
    [JsonPropertyName("userId")]      public string? UserId { get; set; }
    [JsonPropertyName("userAgent")]   public string? UserAgent { get; set; }
    [JsonPropertyName("breadcrumbs")] public string? Breadcrumbs { get; set; }
    [JsonPropertyName("extra")]       public string? Extra { get; set; }
    [JsonPropertyName("argsJson")]    public string? ArgsJson { get; set; }
    [JsonPropertyName("machineFingerprint")] public string? MachineFingerprint { get; set; }
    [JsonPropertyName("resolvedAt")]  public DateTime? ResolvedAt { get; set; }
    [JsonPropertyName("resolvedBy")]  public string? ResolvedBy { get; set; }
    [JsonPropertyName("notes")]       public string? Notes { get; set; }
}

public sealed class AdminResolveRequest
{
    [JsonPropertyName("resolved")]  public bool Resolved { get; set; }
    [JsonPropertyName("resolvedBy")] public string? ResolvedBy { get; set; }
    [JsonPropertyName("notes")]     public string? Notes { get; set; }
}

public sealed class AdminGenericResponse
{
    [JsonPropertyName("ok")]    public bool Ok { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
}
