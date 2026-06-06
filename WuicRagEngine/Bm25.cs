using System.Text.RegularExpressions;

namespace WuicRagEngine;

/// <summary>BM25 (k1=1.5, b=0.75) costruito dai testi dei doc con la stessa
/// tokenize() del Python (regex [A-Za-z_][A-Za-z0-9_.]{1,}, lowercased). Inverted
/// index term->(docId,tf): produce score identici a bm25_scores() ma in O(postings).</summary>
public sealed class Bm25
{
    private const double K1 = 1.5, B = 0.75;
    private static readonly Regex TokenRe = new(@"[A-Za-z_][A-Za-z0-9_.]{1,}", RegexOptions.Compiled);

    private readonly Dictionary<string, List<(int doc, int tf)>> _inv = new(StringComparer.Ordinal);
    private readonly int[] _lengths;
    private readonly double _avgdl;
    private readonly int _nDocs;

    public static List<string> Tokenize(string text)
    {
        var outp = new List<string>();
        if (string.IsNullOrEmpty(text)) return outp;
        foreach (Match m in TokenRe.Matches(text)) outp.Add(m.Value.ToLowerInvariant());
        return outp;
    }

    public Bm25(IReadOnlyList<Doc> docs)
    {
        _nDocs = docs.Count;
        _lengths = new int[_nDocs];
        long total = 0;
        for (int i = 0; i < _nDocs; i++)
        {
            var toks = Tokenize(docs[i].Text);
            _lengths[i] = toks.Count;
            total += toks.Count;
            // tf per doc
            var tf = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var t in toks) tf[t] = tf.TryGetValue(t, out var c) ? c + 1 : 1;
            foreach (var kv in tf)
            {
                if (!_inv.TryGetValue(kv.Key, out var list)) { list = new(); _inv[kv.Key] = list; }
                list.Add((i, kv.Value));
            }
        }
        _avgdl = _nDocs > 0 ? (double)total / _nDocs : 1.0;
    }

    /// <summary>scores[doc] su tutti i doc, per la query (token raw, NON espansi).</summary>
    public double[] Scores(string query)
    {
        var scores = new double[_nDocs];
        if (_nDocs == 0) return scores;
        double avgdl = _avgdl <= 0 ? 1.0 : _avgdl;
        foreach (var term in Tokenize(query))
        {
            if (!_inv.TryGetValue(term, out var postings)) continue;
            int df = postings.Count; // #doc contenenti il termine == doc_freq
            double idf = Math.Log((_nDocs - df + 0.5) / (df + 0.5) + 1.0);
            foreach (var (doc, tf) in postings)
            {
                double denom = tf + K1 * (1 - B + B * (_lengths[doc] / avgdl));
                scores[doc] += idf * ((tf * (K1 + 1)) / denom);
            }
        }
        return scores;
    }
}
