using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  Body POST /api/crash/deobfuscate-js. Skill license-issuing / crash-reporting.
///  Risolve gli stack-trace JS dell'app WuicTest IIS deployata, usando i `.js.map`
///  uppati dalla pipeline `deploy-release.ps1` sotto
///  <c>{MappingsRoot}/{release}/iis/&lt;chunk&gt;.js.map</c>.
/// </summary>
public sealed class DeobfuscateJsRequest
{
    /// <summary>Version (es. "1.0.11"). Usato per location <root>/<release>/iis/.</summary>
    [JsonPropertyName("release")] public string? Release { get; set; }

    /// <summary>Stack-trace raw multi-line (cosi' come arriva dall'ingest). Le
    /// righe matchate dal pattern <c>chunk-XXX.js:line:col</c> vengono annotate
    /// inline con la posizione sorgente originale.</summary>
    [JsonPropertyName("stack")] public string? Stack { get; set; }
}

public sealed class DeobfuscateJsResponse
{
    [JsonPropertyName("ok")]           public bool Ok { get; set; }
    [JsonPropertyName("error")]        public string? Error { get; set; }
    /// <summary>Stack annotato: ogni riga risolta ha appeso "  → src/foo.ts:L:C (name)".</summary>
    [JsonPropertyName("deobfuscated")] public string? Deobfuscated { get; set; }
    [JsonPropertyName("stats")]        public DeobfuscateJsStats? Stats { get; set; }
}

public sealed class DeobfuscateJsStats
{
    /// <summary>Numero di triplet (chunk, line, col) trovati nello stack.</summary>
    [JsonPropertyName("totalLookups")] public int TotalLookups { get; set; }
    /// <summary>Triplet risolti con successo (mapping trovato).</summary>
    [JsonPropertyName("hitCount")]     public int HitCount { get; set; }
    /// <summary>Triplet senza mapping (chunk non trovato sul disco o segment non risolvibile).</summary>
    [JsonPropertyName("missCount")]    public int MissCount { get; set; }
    /// <summary>Lista chunk distinti referenziati (utile per debug).</summary>
    [JsonPropertyName("chunksReferenced")] public List<string> ChunksReferenced { get; set; } = new();
}
