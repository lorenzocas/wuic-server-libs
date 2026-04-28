using System.Text.Json;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Source map V3 parser + lookup. Implementazione minima self-contained
///  per evitare dipendenza esterna (la maggior parte dei pacchetti NuGet
///  per source maps in C# sono fermi a vecchie versioni .NET).
///
///  Riferimento spec: https://sourcemaps.info/spec.html
///
///  Formato file (JSON):
///    {
///      "version": 3,
///      "file": "chunk-XXX.js",
///      "sources": ["src/foo.ts", "src/bar.ts"],
///      "names": ["myFunc", "x"],
///      "mappings": "AAAA;CAAC,SAAS,..."
///    }
///
///  Mappings:
///    - Linee separate da ';'
///    - Segmenti separati da ','
///    - Ogni segmento e' VLQ array di 1, 4 o 5 ints:
///        [genCol, srcIdx, srcLine, srcCol, nameIdx]
///    - genCol e' delta dal segmento precedente NELLA STESSA LINEA (reset a 0
///      ad ogni nuova linea). Gli altri 4 sono delta cumulativi cross-linea.
/// </summary>
public sealed class SourceMapV3
{
    public string[] Sources { get; }
    public string[] Names { get; }
    /// <summary>Segmenti ordinati per (GenLine, GenCol) — pronti per binary search.</summary>
    public IReadOnlyList<MappingSegment> Segments { get; }

    public SourceMapV3(string[] sources, string[] names, List<MappingSegment> segments)
    {
        Sources = sources;
        Names = names;
        Segments = segments;
    }

    /// <summary>
    ///  Lookup: data una posizione (genLine, genCol) nel JS minificato,
    ///  ritorna il segmento mapping con il largest GenCol &lt;= genCol nella
    ///  stessa GenLine. Null se nessun segmento con info source su quella linea.
    /// </summary>
    public MappingHit? Lookup(int genLine, int genCol)
    {
        // Binary search del primo segmento con GenLine == genLine.
        int lo = 0, hi = Segments.Count - 1, firstOnLine = -1;
        while (lo <= hi)
        {
            int mid = (lo + hi) / 2;
            if (Segments[mid].GenLine < genLine) lo = mid + 1;
            else if (Segments[mid].GenLine > genLine) hi = mid - 1;
            else { firstOnLine = mid; hi = mid - 1; }
        }
        if (firstOnLine < 0) return null;

        // Linear scan in-line per trovare il segmento con largest GenCol <= genCol
        // (con info source: SrcIdx != null).
        MappingSegment? best = null;
        for (int i = firstOnLine; i < Segments.Count && Segments[i].GenLine == genLine; i++)
        {
            var s = Segments[i];
            if (s.GenCol > genCol) break;
            if (s.SrcIdx.HasValue) best = s;
        }
        if (best is null) return null;

        var bestSeg = best.Value;
        var srcIdx = bestSeg.SrcIdx!.Value;
        if (srcIdx < 0 || srcIdx >= Sources.Length) return null;

        string? name = null;
        if (bestSeg.NameIdx.HasValue)
        {
            int nIdx = bestSeg.NameIdx.Value;
            if (nIdx >= 0 && nIdx < Names.Length) name = Names[nIdx];
        }

        return new MappingHit(
            Source: Sources[srcIdx],
            SrcLine: bestSeg.SrcLine ?? 0,
            SrcCol: bestSeg.SrcCol ?? 0,
            Name: name);
    }

    /// <summary>
    ///  Carica e parsa un file `.js.map` v3 dal disco. Throws su file/JSON invalid.
    /// </summary>
    public static SourceMapV3 Load(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException(path);
        var json = File.ReadAllText(path);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (!root.TryGetProperty("version", out var verEl) || verEl.GetInt32() != 3)
            throw new InvalidDataException($"Source map at {path} is not version 3");

        var sources = root.TryGetProperty("sources", out var srcEl)
            ? srcEl.EnumerateArray().Select(e => e.GetString() ?? "").ToArray()
            : Array.Empty<string>();
        var names = root.TryGetProperty("names", out var nmEl)
            ? nmEl.EnumerateArray().Select(e => e.GetString() ?? "").ToArray()
            : Array.Empty<string>();
        var mappings = root.TryGetProperty("mappings", out var mpEl) ? (mpEl.GetString() ?? "") : "";

        var segments = ParseMappings(mappings);
        return new SourceMapV3(sources, names, segments);
    }

    /// <summary>VLQ + segment decoder. Vedi spec sopra.</summary>
    internal static List<MappingSegment> ParseMappings(string mappings)
    {
        var result = new List<MappingSegment>();
        int genLine = 0;
        int prevGenCol = 0; // reset a 0 ad ogni nuova GenLine
        // I 4 cumulativi cross-linea:
        int prevSrcIdx = 0, prevSrcLine = 0, prevSrcCol = 0, prevNameIdx = 0;

        int i = 0;
        int n = mappings.Length;
        while (i < n)
        {
            char c = mappings[i];
            if (c == ';')
            {
                genLine++;
                prevGenCol = 0;
                i++;
                continue;
            }
            if (c == ',')
            {
                i++;
                continue;
            }
            // Decode segment fields (1..5 VLQ ints).
            var fields = new List<int>(5);
            while (i < n && mappings[i] != ',' && mappings[i] != ';')
            {
                int val = DecodeVlq(mappings, ref i);
                fields.Add(val);
                if (fields.Count >= 5) break;
            }
            if (fields.Count == 0) continue;

            int genCol = prevGenCol + fields[0];
            prevGenCol = genCol;

            int? srcIdx = null, srcLine = null, srcCol = null, nameIdx = null;
            if (fields.Count >= 4)
            {
                srcIdx = prevSrcIdx + fields[1]; prevSrcIdx = srcIdx.Value;
                srcLine = prevSrcLine + fields[2]; prevSrcLine = srcLine.Value;
                srcCol = prevSrcCol + fields[3]; prevSrcCol = srcCol.Value;
            }
            if (fields.Count == 5)
            {
                nameIdx = prevNameIdx + fields[4]; prevNameIdx = nameIdx.Value;
            }

            result.Add(new MappingSegment(genLine, genCol, srcIdx, srcLine, srcCol, nameIdx));
        }
        return result;
    }

    // VLQ base64: https://en.wikipedia.org/wiki/Variable-length_quantity#Sign_extension
    private const string Base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    private static int DecodeVlq(string s, ref int i)
    {
        int result = 0;
        int shift = 0;
        bool cont;
        do
        {
            if (i >= s.Length) throw new InvalidDataException("VLQ truncated");
            char ch = s[i++];
            int idx = Base64Chars.IndexOf(ch);
            if (idx < 0) throw new InvalidDataException($"Invalid base64 char '{ch}' in VLQ");
            cont = (idx & 32) != 0;          // bit alto = continuation
            int digit = idx & 31;            // 5 bit di payload
            result |= digit << shift;
            shift += 5;
        } while (cont);

        // Bit basso = sign. Magnitudo nei bit alti.
        bool negative = (result & 1) == 1;
        result >>= 1;
        return negative ? -result : result;
    }
}

/// <summary>Singolo mapping segment dopo decode.</summary>
public readonly record struct MappingSegment(
    int GenLine,
    int GenCol,
    int? SrcIdx,
    int? SrcLine,
    int? SrcCol,
    int? NameIdx);

/// <summary>Risultato di <see cref="SourceMapV3.Lookup"/>: posizione sorgente originale.</summary>
public readonly record struct MappingHit(
    string Source,
    int SrcLine,
    int SrcCol,
    string? Name);
