using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  Body POST /api/crash/deobfuscate. Tutti i campi sono trim/validati lato
///  endpoint; release/assembly sono usati per costruire il path al
///  symbols.map e quindi MUST NOT contenere separatori di percorso (vedi
///  <see cref="WuicCrashReceiver.Services.ConfuserSymbolMapCache.TryGet"/>).
/// </summary>
public sealed class DeobfuscateRequest
{
    [JsonPropertyName("release")]
    public string? Release { get; set; }

    /// <summary>
    ///  Nome assembly senza estensione (es. "WuicCore", "Wuic.MySqlProvider").
    ///  Usato come prefisso del file symbols.map: <c>{asm}.symbols.map</c>.
    /// </summary>
    [JsonPropertyName("assembly")]
    public string? Assembly { get; set; }

    [JsonPropertyName("stack")]
    public string? Stack { get; set; }
}

public sealed class DeobfuscateResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    [JsonPropertyName("deobfuscated")]
    public string? Deobfuscated { get; set; }

    [JsonPropertyName("stats")]
    public DeobfuscateStats? Stats { get; set; }
}

public sealed class DeobfuscateStats
{
    /// <summary>Numero di rename entries presenti nel symbols.map.</summary>
    [JsonPropertyName("entryCount")]
    public int EntryCount { get; set; }

    /// <summary>Linee del file con format invalido (skipped silenziosamente).</summary>
    [JsonPropertyName("skippedLineCount")]
    public int SkippedLineCount { get; set; }

    /// <summary>Numero di obfuscatedName duplicati rilevati (collisioni).</summary>
    [JsonPropertyName("collisions")]
    public int Collisions { get; set; }
}
