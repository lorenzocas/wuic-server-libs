using System.Collections.Concurrent;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Cache singleton dei <see cref="SourceMapV3"/> deserializzati a partire dai
///  file `.js.map` uppati dal CI deploy-release.ps1 sotto
///  <c>{MappingsRoot}/{release}/iis/&lt;chunk&gt;.js.map</c>.
///
///  Pattern speculare a <see cref="ConfuserSymbolMapCache"/>.
///  Thread-safe; reload pigro se il file timestamp cambia.
///
///  Skill license-issuing / crash-reporting (sourcemap JS server-side).
/// </summary>
public sealed class JsSourceMapCache
{
    private sealed record Entry(SourceMapV3 Map, DateTime FileWriteTimeUtc);

    private readonly ILogger<JsSourceMapCache> _log;
    private readonly string _root;
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    public JsSourceMapCache(IConfiguration configuration, ILogger<JsSourceMapCache> log)
    {
        _log = log;
        _root = configuration["CrashReceiver:MappingsRoot"]
            ?? throw new InvalidOperationException("CrashReceiver:MappingsRoot missing in configuration");
    }

    /// <summary>
    ///  Ritorna il <see cref="SourceMapV3"/> per (release, chunkFileName) o null
    ///  se non presente. <paramref name="chunkFileName"/> deve essere il nome
    ///  base del file js (es. <c>chunk-DI4ZRJPY.js</c>) — la cache cerca
    ///  <c>{root}/{release}/iis/{chunkFileName}.map</c>.
    /// </summary>
    public SourceMapV3? TryGet(string release, string chunkFileName)
    {
        if (string.IsNullOrWhiteSpace(release) || string.IsNullOrWhiteSpace(chunkFileName))
            return null;

        // Sanitize: no path separators, no parent traversal. chunkFileName e'
        // derivato dal regex sullo stack-trace (input non-fidato).
        if (release.Contains('/') || release.Contains('\\') || release.Contains("..")
            || chunkFileName.Contains('/') || chunkFileName.Contains('\\') || chunkFileName.Contains(".."))
        {
            _log.LogWarning("JsSourceMapCache: rejected path-tainted lookup release={Release} chunk={Chunk}",
                release, chunkFileName);
            return null;
        }

        var path = Path.Combine(_root, release, "iis", chunkFileName + ".map");
        if (!File.Exists(path)) return null;

        var key = release + "|" + chunkFileName;
        var lastWrite = File.GetLastWriteTimeUtc(path);
        if (_entries.TryGetValue(key, out var existing) && existing.FileWriteTimeUtc == lastWrite)
            return existing.Map;

        try
        {
            var loaded = SourceMapV3.Load(path);
            _entries[key] = new Entry(loaded, lastWrite);
            _log.LogInformation(
                "Loaded JS sourcemap release={Release} chunk={Chunk}: {Segments} segments, {Sources} sources",
                release, chunkFileName, loaded.Segments.Count, loaded.Sources.Length);
            return loaded;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to parse JS sourcemap at {Path}", path);
            return null;
        }
    }
}
