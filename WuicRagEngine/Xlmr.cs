using System.Text.Json;
using Microsoft.ML.Tokenizers;

namespace WuicRagEngine;

/// <summary>
/// Tokenizer XLM-RoBERTa (bge-m3 / bge-reranker-v2-m3) per .NET.
/// Segmentazione via SentencePieceTokenizer (legge il .model, normalizzazione +
/// Unigram identici a HF), mapping piece->HF id via model.vocab del tokenizer.json
/// (l'indice nell'array Unigram È l'HF id, offset fairseq già bakeato).
/// Gate validato: embed 400/400 esatti; rerank 198/200 (2 tie-break su trattini
/// decorativi, |Δlogit| <= 0.038).
/// </summary>
public sealed class Xlmr
{
    public const int CLS = 0, SEP = 2, UNK = 3, MAXLEN = 512;
    private readonly SentencePieceTokenizer _sp;
    private readonly Dictionary<string, int> _pieceToId;

    public Xlmr(string spModelPath, string tokenizerJsonPath)
    {
        _pieceToId = LoadUnigramVocab(tokenizerJsonPath);
        using var s = File.OpenRead(spModelPath);
        _sp = SentencePieceTokenizer.Create(s, addBeginningOfSentence: false, addEndOfSentence: false, specialTokens: null!);
    }

    /// <summary>pieces -> HF ids (no special), troncato a `limit`.</summary>
    private List<int> Content(string text, int limit)
    {
        var ids = new List<int>();
        foreach (var tok in _sp.EncodeToTokens(text, out _, considerPreTokenization: true, considerNormalization: true))
        {
            if (ids.Count >= limit) break;
            ids.Add(_pieceToId.TryGetValue(tok.Value, out var id) ? id : UNK);
        }
        return ids;
    }

    /// <summary>single: &lt;s&gt; content &lt;/s&gt;, total &lt;= 512.</summary>
    public int[] EncodeSingle(string text)
    {
        var c = Content(text, MAXLEN - 2);
        var o = new int[c.Count + 2];
        o[0] = CLS;
        for (int i = 0; i < c.Count; i++) o[i + 1] = c[i];
        o[^1] = SEP;
        return o;
    }

    /// <summary>pair only_second: &lt;s&gt; A &lt;/s&gt;&lt;/s&gt; B &lt;/s&gt;, troncatura solo su B.</summary>
    public int[] EncodePair(string a, string b)
    {
        var ta = Content(a, MAXLEN);
        int budgetB = Math.Max(0, MAXLEN - ta.Count - 4);
        var tb = Content(b, budgetB);
        var o = new int[ta.Count + tb.Count + 4];
        int k = 0;
        o[k++] = CLS;
        foreach (var x in ta) o[k++] = x;
        o[k++] = SEP; o[k++] = SEP;
        foreach (var x in tb) o[k++] = x;
        o[k++] = SEP;
        return o;
    }

    private static Dictionary<string, int> LoadUnigramVocab(string tokJsonPath)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(tokJsonPath));
        var vocab = doc.RootElement.GetProperty("model").GetProperty("vocab");
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        int i = 0;
        foreach (var entry in vocab.EnumerateArray()) map[entry[0].GetString()!] = i++;
        return map;
    }
}
