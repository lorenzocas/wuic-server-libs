using Microsoft.Data.SqlClient;
using System.Collections.Concurrent;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Server-side hard filter (skill crash-reporting Commit 8b — modello M3 ibrido).
///
///  ── Filosofia (revisione 2026-04-28) ─────────────────────────────────
///  Il filter e' un sistema di **noise reduction**, NON una whitelist
///  difensiva. La filosofia originale "default deny + esplicito allow"
///  era sbagliata per il caso d'uso: gli errori NON listati (codici
///  nuovi, errori imprevisti del framework, eccezioni .NET non
///  pianificate) sono esattamente quelli che hanno valore di triage
///  massimo. Bloccarli per "no_match" significava perdere i veri
///  unhandled. Inversione: **default accept** via fallback al pattern
///  catch-all <c>&lt;unhandled&gt;</c>, gli operatori usano la allowlist
///  table SOLO per disable/sample-down/rate-limit codici noti come noise.
///
///  ── Sequenza decisionale ────────────────────────────────────────────
///   1. **Match pattern** contro <c>_wuic_crash_allowlist</c>:
///      - Esatto: pattern == errorCode (o <c>&lt;unhandled&gt;</c> se errorCode null).
///      - Prefix: pattern termina in '%' (LIKE-style), longest-prefix wins.
///      - **Fallback**: nessun match → uso la regola <c>&lt;unhandled&gt;</c>
///        come catch-all (rate-limit + sample del DB).
///      - Se manca anche <c>&lt;unhandled&gt;</c>: fail-open (accetta tutto).
///        Significa "tabella vuota o DB down" — meglio accettare temp che
///        droppare 100% del traffico.
///
///   2. **Disabled gate**: se la regola matcha ma <c>enabled=0</c>, drop
///      con <c>allowlist_disabled</c> (l'operatore ha esplicitamente
///      silenziato questo pattern come noise).
///
///   3. **Sample rate** deterministico via <c>stack_hash</c> (NOT random):
///      bucket = (FNV(stack_hash) mod 1000) / 1000.0; accetta se bucket &lt; sample_rate.
///      Determinismo importante: lo stesso bug ha sempre lo stesso sample
///      decision, quindi la dedup MERGE non si rompe (un bug non puo' essere
///      "dentro" su un'occorrenza e "fuori" sulla successiva).
///
///   4. **Rate limit** per <c>(client_id, error_code, hour_bucket)</c>:
///      MERGE incremento del counter atomico in
///      <c>_wuic_crash_rate_buckets</c>. Se counter post-incremento &gt;=
///      <c>rate_limit_per_hour</c>, reject. NULL = no limit.
///
///  Cache in-memory delle pattern (TTL 60s): le pattern cambiano raramente,
///  ma vogliamo evitare un SELECT per ogni POST. Reload pigro al primo
///  miss post-TTL. Tuned per ~1000 patterns max.
///
///  Thread-safe. Le query SQL usano connection from-the-pool, no shared state.
/// </summary>
public sealed class AllowlistFilter
{
    private const string UnhandledSentinel = "<unhandled>";
    private const int CacheTtlSeconds = 60;

    private readonly string _connectionString;
    private readonly ILogger<AllowlistFilter> _log;

    private sealed record Pattern(string Value, bool Enabled, int? RateLimitPerHour, double SampleRate);
    private sealed record CacheEntry(IReadOnlyList<Pattern> All, DateTime LoadedUtc);

    private CacheEntry? _cache;
    private readonly object _cacheLock = new();

    public AllowlistFilter(IConfiguration configuration, ILogger<AllowlistFilter> log)
    {
        _connectionString = configuration.GetConnectionString("WuicCrashes")
            ?? throw new InvalidOperationException("ConnectionStrings:WuicCrashes missing");
        _log = log;
    }

    public sealed record FilterDecision(bool Allow, string? RejectReason);

    /// <summary>
    ///  Applica filtro completo. Ritorna <c>(true, null)</c> se accept,
    ///  <c>(false, reason)</c> con codice diagnostico stabile altrimenti.
    /// </summary>
    public async Task<FilterDecision> EvaluateAsync(
        string clientId,
        string? errorCode,
        string stackHash,
        CancellationToken ct = default)
    {
        var key = string.IsNullOrEmpty(errorCode) ? UnhandledSentinel : errorCode;

        var matched = await GetMatchingPatternAsync(key, ct);

        // Default-accept (revisione 2026-04-28): se nessun pattern matcha
        // l'errorCode esattamente o per prefix, fallback al catch-all
        // <unhandled>. Questo significa che gli errori NON listati passano
        // con la policy del catch-all (di solito rate-limit alto + sample 1.0).
        // La filosofia precedente "default deny" silenziava esattamente i
        // codici nuovi/imprevisti che hanno valore di triage massimo.
        if (matched is null)
        {
            matched = await GetExactPatternAsync(UnhandledSentinel, ct);
            if (matched is null)
            {
                // Tabella vuota o DB down: fail-open. Meglio accettare con
                // policy permissiva che droppare 100% del traffico crash
                // proprio nel momento in cui l'admin sta debuggando.
                _log.LogWarning("AllowlistFilter: no <unhandled> catch-all and no exact/prefix match for code='{Code}' — fail-open accept", key);
                return new FilterDecision(true, null);
            }
        }
        if (!matched.Enabled) return new FilterDecision(false, "allowlist_disabled");

        // Sample rate (deterministico).
        if (matched.SampleRate < 1.0)
        {
            // bucket in [0, 1000); divide by 1000 → bucket fraction in [0, 1).
            var bucket = (DeterministicHash(stackHash) % 1000u) / 1000.0;
            if (bucket >= matched.SampleRate)
                return new FilterDecision(false, "sampled_out");
        }

        // Rate limit.
        if (matched.RateLimitPerHour is int rl && rl > 0)
        {
            var counter = await IncrementRateBucketAsync(clientId, key, ct);
            if (counter > rl) return new FilterDecision(false, "rate_limited");
        }

        return new FilterDecision(true, null);
    }

    /// <summary>
    ///  Lookup esatto di un pattern (no prefix-match). Usato per il fallback
    ///  a `&lt;unhandled&gt;` come catch-all.
    /// </summary>
    private async Task<Pattern?> GetExactPatternAsync(string key, CancellationToken ct)
    {
        var patterns = await GetCachedPatternsAsync(ct);
        foreach (var p in patterns)
        {
            if (string.Equals(p.Value, key, StringComparison.Ordinal))
                return p;
        }
        return null;
    }

    private async Task<Pattern?> GetMatchingPatternAsync(string key, CancellationToken ct)
    {
        var patterns = await GetCachedPatternsAsync(ct);

        // Exact match wins. Then longest prefix match.
        Pattern? bestPrefix = null;
        int bestPrefixLen = -1;
        foreach (var p in patterns)
        {
            if (p.Value.EndsWith('%'))
            {
                var stem = p.Value[..^1];
                if (key.StartsWith(stem, StringComparison.Ordinal) && stem.Length > bestPrefixLen)
                {
                    bestPrefix = p;
                    bestPrefixLen = stem.Length;
                }
            }
            else if (string.Equals(p.Value, key, StringComparison.Ordinal))
            {
                return p; // exact wins immediately
            }
        }
        return bestPrefix;
    }

    private async Task<IReadOnlyList<Pattern>> GetCachedPatternsAsync(CancellationToken ct)
    {
        var snap = _cache;
        if (snap is not null && (DateTime.UtcNow - snap.LoadedUtc).TotalSeconds < CacheTtlSeconds)
            return snap.All;

        // Reload (race-tolerant: at worst two reloads at TTL boundary).
        var loaded = await LoadPatternsAsync(ct);
        var entry = new CacheEntry(loaded, DateTime.UtcNow);
        lock (_cacheLock) { _cache = entry; }
        return loaded;
    }

    private async Task<IReadOnlyList<Pattern>> LoadPatternsAsync(CancellationToken ct)
    {
        var list = new List<Pattern>(32);
        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(
                "SELECT pattern, enabled, rate_limit_per_hour, sample_rate FROM dbo._wuic_crash_allowlist", cn);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                list.Add(new Pattern(
                    rdr.GetString(0),
                    rdr.GetBoolean(1),
                    rdr.IsDBNull(2) ? (int?)null : rdr.GetInt32(2),
                    rdr.IsDBNull(3) ? 1.0 : rdr.GetDouble(3)));
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "AllowlistFilter: failed to load patterns from DB; falling back to permissive (accept-all)");
            // Fail-open: con DB unreachable, meglio accettare temporaneamente
            // che droppare silenziosamente tutto. Il dedup MERGE caps storage.
            return new[] { new Pattern("%", true, null, 1.0) };
        }
        return list;
    }

    private async Task<int> IncrementRateBucketAsync(string clientId, string errorCode, CancellationToken ct)
    {
        // Hour bucket UTC, troncato. SQL Server: DATEFROMPARTS senza minuti.
        var hourBucketUtc = new DateTime(
            DateTime.UtcNow.Year, DateTime.UtcNow.Month, DateTime.UtcNow.Day,
            DateTime.UtcNow.Hour, 0, 0, DateTimeKind.Utc);

        const string sql = @"
MERGE dbo._wuic_crash_rate_buckets WITH (HOLDLOCK) AS target
USING (SELECT @cid AS client_id, @code AS error_code, @bucket AS hour_bucket_utc) AS src
   ON  target.client_id = src.client_id
   AND target.error_code = src.error_code
   AND target.hour_bucket_utc = src.hour_bucket_utc
WHEN MATCHED THEN UPDATE SET counter = target.counter + 1
WHEN NOT MATCHED THEN INSERT (client_id, error_code, hour_bucket_utc, counter)
    VALUES (@cid, @code, @bucket, 1)
OUTPUT inserted.counter;";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.AddWithValue("@cid", clientId);
            cmd.Parameters.AddWithValue("@code", errorCode);
            cmd.Parameters.AddWithValue("@bucket", hourBucketUtc);
            var result = await cmd.ExecuteScalarAsync(ct);
            return result is int i ? i : 0;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "AllowlistFilter: rate bucket increment failed (client={Client} code={Code})", clientId, errorCode);
            return 0; // fail-open: accetta in caso di errore DB
        }
    }

    /// <summary>
    ///  FNV-1a 32-bit hash di una stringa. Usato per il bucketing
    ///  deterministico del sample rate. Non security-sensitive.
    /// </summary>
    private static uint DeterministicHash(string s)
    {
        const uint FnvOffset = 0x811c9dc5;
        const uint FnvPrime = 0x01000193;
        uint h = FnvOffset;
        foreach (var c in s)
        {
            h ^= c;
            h *= FnvPrime;
        }
        return h;
    }
}
