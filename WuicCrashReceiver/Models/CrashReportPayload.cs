using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  Shape canonica del payload `POST /api/crash/ingest`.
///
///  Source di verita': il frontend Angular (CrashReporterErrorHandler,
///  Commit 8) e il backend .NET (CrashReportingMiddleware, Commit 7) DEVONO
///  emettere oggetti JSON con esattamente questi nomi (camelCase) perche'
///  System.Text.Json default e' case-sensitive sulla deserializzazione.
///
///  Tutti i campi tranne <c>type</c>, <c>message</c>, <c>stackRaw</c> sono
///  opzionali: il client e' libero di omettere quello che non sa.
///  L'ingest service applica policy server-side per:
///   - calcolo <c>stack_hash</c> se omesso (canonicalizzazione + SHA-256)
///   - resolve <c>clientId</c> e <c>clientTier</c> dalla license
///     (header X-Wuic-License-Payload), NON dal body — il client non puo'
///     spoofare il proprio tier.
/// </summary>
public sealed class CrashReportPayload
{
    [JsonPropertyName("source")]    public string? Source { get; set; }       // ".net" | "js"
    [JsonPropertyName("type")]      public string Type { get; set; } = "";    // "TypeError"
    [JsonPropertyName("message")]   public string Message { get; set; } = ""; // "Cannot read..."
    [JsonPropertyName("stackHash")] public string? StackHash { get; set; }    // SHA-256 hex (opzionale, calc server-side se assente)
    [JsonPropertyName("stackRaw")]  public string StackRaw { get; set; } = ""; // intero stack offuscato

    // ── Typed-error enrichment (Commit 8b: B+M3) ────────────────────────
    /// <summary>
    /// Se l'eccezione era una <c>WuicException</c>/<c>WuicClientException</c>,
    /// il codice tipizzato (es. <c>errors.client.archetype.chart.init_failed</c>).
    /// Null per eccezioni non tipizzate (raw <c>NullReferenceException</c>, <c>TypeError</c>).
    /// </summary>
    [JsonPropertyName("errorCode")] public string? ErrorCode { get; set; }

    /// <summary>
    /// Args strutturati associati al <c>errorCode</c> (es. <c>{ archetype: "chart", route: "crm_accounts" }</c>).
    /// </summary>
    [JsonPropertyName("args")] public object? Args { get; set; }

    /// <summary>
    /// True se proviene da una WuicException/WuicClientException tipizzata.
    /// Convenience flag — duplica la logica <c>!string.IsNullOrEmpty(ErrorCode)</c>
    /// ma resta esplicito nell'API (non e' detto che <c>ErrorCode != null</c>
    /// implichi sempre tipizzazione, es. payload trasformati upstream).
    /// </summary>
    [JsonPropertyName("isTyped")] public bool IsTyped { get; set; }

    [JsonPropertyName("release")]            public string? Release { get; set; }            // "wuic@1.2.3"
    [JsonPropertyName("machineFingerprint")] public string? MachineFingerprint { get; set; }
    [JsonPropertyName("url")]                public string? Url { get; set; }                // location.href / Request.Path
    [JsonPropertyName("userId")]             public string? UserId { get; set; }
    [JsonPropertyName("userAgent")]          public string? UserAgent { get; set; }

    /// <summary>
    /// JSON array di breadcrumb objects. Stored as-is (string) — il client
    /// canonicalizza e tronca a N=30 prima di inviare.
    /// </summary>
    [JsonPropertyName("breadcrumbs")] public object? Breadcrumbs { get; set; }

    /// <summary>
    /// JSON object con campi extra (route, queryParams, headers redatti, ecc.).
    /// </summary>
    [JsonPropertyName("extra")] public object? Extra { get; set; }
}

/// <summary>
///  Response shape uniforme. <c>id</c> = id row crash report (utile per
///  dedup-and-link client-side). <c>occurrences</c> incrementa quando lo
///  stesso stack e' gia' visto (dedup hit).
/// </summary>
public sealed class CrashIngestResponse
{
    public bool Ok { get; set; }
    public string? Error { get; set; }
    public long? Id { get; set; }
    public int? Occurrences { get; set; }
    public string? StackHash { get; set; }
}
