using System.Text.Json;

namespace WuicRagEngine;

/// <summary>
/// Cache di retrieval per-INTENTO: il retrieval e' param-invariante ("colora il rigo
/// se colonna X &gt; N" e "colora il rigo se colonna Y &lt; M" recuperano lo STESSO
/// contesto — cambiano solo i parametri, che li mette l'LLM in sintesi). Su host
/// CPU-only (demo pubblico) il collo di bottiglia e' il cross-encoder (ceTopN=40
/// forward pass ≈ minuti): un match di intento lo salta del tutto servendo il
/// contesto pre-rerankato, e l'LLM genera live la risposta con i parametri specifici.
///
/// File: <c>{artifacts}/intent_cache.json</c> — prodotto da
/// <c>scripts/rag-intent-cache/build-intent-cache.mjs</c> girando gli exemplar sul
/// pipeline PIENO (una tantum, su una macchina veloce). Assente = feature disattiva,
/// zero impatto sul pipeline classico.
///
/// Matching: embedding bge-m3 della query grezza (multilingue: exemplar IT/EN
/// matchano query in entrambe le lingue) -&gt; cosine max su tutti gli exemplar -&gt;
/// intento migliore se score &gt;= threshold. Un solo forward di embedder (~1s CPU)
/// contro i ~40 del reranker. Gli exemplar vengono embeddati UNA volta in
/// background al boot: finche' non e' pronto, TryMatch risponde miss (fallback
/// trasparente al pipeline pieno).
/// </summary>
public sealed class IntentCache
{
    public sealed class CachedHit
    {
        public string ChunkId = "";
        public double ScoreVector;
        public double ScoreBm25;
    }

    private sealed class Intent
    {
        public string Id = "";
        public string[] Exemplars = Array.Empty<string>();
        public List<CachedHit> Hits = new();
        public float[][] Vectors = Array.Empty<float[]>(); // popolato dal warm-up
    }

    private readonly List<Intent> _intents = new();
    private readonly double _threshold;
    private volatile bool _ready;

    // Observability (esposti in HealthJson via RagEngine).
    private long _hits, _misses;
    private volatile string? _lastIntent;
    public (long hits, long misses, string? lastIntent, bool ready, int intents) Stats
        => (Interlocked.Read(ref _hits), Interlocked.Read(ref _misses), _lastIntent, _ready, _intents.Count);

    private IntentCache(double threshold) => _threshold = threshold;

    /// <summary>
    /// Carica il file se presente e avvia in background l'embed degli exemplar.
    /// Ritorna null se il file manca o e' malformato (feature off, mai fatale).
    /// </summary>
    public static IntentCache? TryLoad(string artifactsRoot, Func<string, float[]> embed)
    {
        try
        {
            string path = Path.Combine(artifactsRoot, "intent_cache.json");
            if (!File.Exists(path)) return null;

            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            double threshold = root.TryGetProperty("threshold", out var th) && th.ValueKind == JsonValueKind.Number
                ? th.GetDouble() : 0.75;
            var cache = new IntentCache(threshold);

            foreach (var it in root.GetProperty("intents").EnumerateArray())
            {
                var intent = new Intent
                {
                    Id = it.GetProperty("id").GetString() ?? "",
                    Exemplars = it.GetProperty("exemplars").EnumerateArray()
                        .Select(e => e.GetString() ?? "").Where(s => s.Length > 0).ToArray(),
                };
                foreach (var h in it.GetProperty("hits").EnumerateArray())
                {
                    intent.Hits.Add(new CachedHit
                    {
                        ChunkId = h.GetProperty("chunk_id").GetString() ?? "",
                        ScoreVector = h.TryGetProperty("score_vector", out var sv) ? sv.GetDouble() : 0,
                        ScoreBm25 = h.TryGetProperty("score_bm25", out var sb) ? sb.GetDouble() : 0,
                    });
                }
                if (intent.Exemplars.Length > 0 && intent.Hits.Count > 0)
                    cache._intents.Add(intent);
            }
            if (cache._intents.Count == 0) return null;

            // Warm-up exemplar embeddings in background: N exemplar x ~0.5-1s CPU non
            // devono allungare il boot ne' la prima query. Fino a ready -> sempre miss.
            Task.Run(() =>
            {
                try
                {
                    foreach (var intent in cache._intents)
                        intent.Vectors = intent.Exemplars.Select(embed).ToArray();
                    cache._ready = true;
                }
                catch { /* embed fallito -> cache resta disattiva, pipeline pieno */ }
            });
            return cache;
        }
        catch { return null; }
    }

    /// <summary>
    /// Match della query contro gli exemplar. Miss se il warm-up non e' completo o
    /// se il best cosine e' sotto soglia. Un solo embed della query (fornito dal
    /// chiamante, che riusa tokenizer+embedder del pipeline).
    /// </summary>
    public bool TryMatch(string query, Func<string, float[]> embed,
        out string intentId, out List<CachedHit> hits, out double score)
    {
        intentId = ""; hits = new List<CachedHit>(); score = 0;
        if (!_ready || string.IsNullOrWhiteSpace(query)) { return Miss(); }

        float[] qv;
        try { qv = embed(query); }
        catch { return Miss(); }

        Intent? best = null;
        double bestScore = double.MinValue;
        foreach (var intent in _intents)
        {
            foreach (var ev in intent.Vectors)
            {
                // bge-m3 emette vettori gia' normalizzati -> dot == cosine.
                double s = 0;
                int n = Math.Min(qv.Length, ev.Length);
                for (int k = 0; k < n; k++) s += (double)qv[k] * ev[k];
                if (s > bestScore) { bestScore = s; best = intent; }
            }
        }

        if (best is null || bestScore < _threshold) { return Miss(); }

        intentId = best.Id;
        hits = best.Hits;
        score = bestScore;
        _lastIntent = best.Id;
        Interlocked.Increment(ref _hits);
        return true;

        bool Miss() { Interlocked.Increment(ref _misses); return false; }
    }
}
