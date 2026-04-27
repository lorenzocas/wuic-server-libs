using System.Collections.Concurrent;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Cache singleton dei <see cref="ConfuserSymbolMap"/> deserializzati a
///  partire dai file <c>symbols.map</c> uploadati dal CI deploy-release.ps1
///  sotto <c>{MappingsRoot}/{release}/{assembly}.symbols.map</c>.
///
///  Sostituisce il vecchio <c>ObfuscarMappingCache</c> (skill crash-reporting Commit 11a).
///
///  Thread-safe via <see cref="ConcurrentDictionary{TKey, TValue}"/>. Reload
///  pigro al rilevamento di un file timestamp piu' recente.
/// </summary>
public sealed class ConfuserSymbolMapCache
{
    private sealed record Entry(ConfuserSymbolMap Map, DateTime FileWriteTimeUtc);

    private readonly ConfuserSymbolMapParser _parser;
    private readonly ILogger<ConfuserSymbolMapCache> _log;
    private readonly string _root;
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    public ConfuserSymbolMapCache(
        IConfiguration configuration,
        ConfuserSymbolMapParser parser,
        ILogger<ConfuserSymbolMapCache> log)
    {
        _parser = parser;
        _log = log;
        _root = configuration["CrashReceiver:MappingsRoot"]
            ?? throw new InvalidOperationException("CrashReceiver:MappingsRoot missing in configuration");
    }

    /// <summary>
    ///  Ritorna il <see cref="ConfuserSymbolMap"/> per (release, assembly)
    ///  o <c>null</c> se non presente. Caching per (release+assembly+lastWriteTime).
    /// </summary>
    public ConfuserSymbolMap? TryGet(string release, string assembly)
    {
        if (string.IsNullOrWhiteSpace(release) || string.IsNullOrWhiteSpace(assembly))
            return null;

        // Sanitize: no path separators, no parent traversal.
        if (release.Contains('/') || release.Contains('\\') || release.Contains("..")
            || assembly.Contains('/') || assembly.Contains('\\') || assembly.Contains(".."))
        {
            _log.LogWarning("ConfuserSymbolMapCache: rejected path-tainted lookup release={Release} asm={Asm}",
                release, assembly);
            return null;
        }

        // Convention: <root>/<release>/<assembly>.symbols.map (ConfuserEx default
        // file name when ConfuserSymbolFileName uses $(AssemblyName).symbols.map).
        var path = Path.Combine(_root, release, assembly + ".symbols.map");
        if (!File.Exists(path)) return null;

        var key = release + "|" + assembly;
        var lastWrite = File.GetLastWriteTimeUtc(path);
        if (_entries.TryGetValue(key, out var existing) && existing.FileWriteTimeUtc == lastWrite)
            return existing.Map;

        try
        {
            var loaded = _parser.Load(path);
            _entries[key] = new Entry(loaded, lastWrite);
            _log.LogInformation(
                "Loaded ConfuserEx symbols.map release={Release} asm={Asm}: {Entries} entries, {Collisions} collisions, {Skipped} skipped lines",
                release, assembly, loaded.EntryCount, loaded.Collisions.Count, loaded.SkippedLineCount);
            return loaded;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to parse ConfuserEx symbols.map at {Path}", path);
            return null;
        }
    }
}
