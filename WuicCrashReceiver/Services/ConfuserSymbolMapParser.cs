using System.Collections.Frozen;
using System.Text;
using System.Text.RegularExpressions;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Parser per i file <c>symbols.map</c> emessi da ConfuserEx 2 con
///  <c>&lt;protection id="rename" mode="decodable"/&gt;</c>. Sostituisce il
///  vecchio <c>ObfuscarMappingParser</c> (skill crash-reporting Commit 11a).
///
///  ── Formato symbols.map ────────────────────────────────────────────
///  Tab-separated, una entry per riga:
///  <code>
///  &lt;obfuscatedName&gt;\t&lt;originalFullSignature&gt;\n
///  </code>
///  Esempi reali:
///  <code>
///  _z324ZyZMYn5X7ftDaamvHwV47om	WuicCore.Services.CrashReporting.ConsentForwarder/ConsentBody::set_ConsentGranted(System.Boolean)
///  _C1dkkwiiwRfFd96B2QmfEGW6E8C	AsmxProxy
///  _NVkr69JEOdXxopf8egPx0V3vSv	ngUicServicesCore.Controllers.MetaService/&lt;&gt;o__279::&lt;&gt;p__12
///  </code>
///
///  ── Strategia di deobfuscation ────────────────────────────────────────
///  Il dictionary REVERSE e' costruito direttamente: <c>obfuscated → original</c>.
///  Lo stack trace .NET contiene tipicamente:
///  <code>
///     at _z324ZyZMYn5X7ftDaamvHwV47om(System.Boolean) ← obfuscated method ID
///  </code>
///  Sostituiamo l'ID obfuscato con la signature originale corrispondente,
///  preservando il resto dello stack frame.
///
///  ── Vs. ObfuscarMappingParser ────────────────────────────────────────
///  Quel parser interpretava il format "Renamed Types" + "Renamed Methods" di
///  Obfuscar 2.x — che e' strutturalmente degenere (vedi spawned task).
///  Questo parser legge un format COMPLETO senza identita': ogni riga e' un
///  rename reale Original→Obfuscated. Verificato empiricamente: 13329/0
///  vs 0/734 di Obfuscar.
/// </summary>
public sealed class ConfuserSymbolMapParser
{
    /// <summary>Token in uno stack trace .NET-compilato che assomiglia a un identifier obfuscato di ConfuserEx (Decodable mode prefix `_` + base64-ish chars).</summary>
    private static readonly Regex _obfuscatedTokenRegex = new(
        @"_[A-Za-z0-9]{15,40}",
        RegexOptions.Compiled);

    /// <summary>
    ///  Parsing di un symbols.map. Throws <see cref="FileNotFoundException"/>
    ///  se il file non esiste o <see cref="InvalidDataException"/> se non
    ///  contiene NESSUNA entry tab-separated valida (probabilmente non un file ConfuserEx).
    /// </summary>
    public ConfuserSymbolMap Load(string mapPath)
    {
        if (!File.Exists(mapPath))
            throw new FileNotFoundException("ConfuserEx symbols.map not found", mapPath);

        var byObfuscated = new Dictionary<string, string>(StringComparer.Ordinal);
        var collisions = new HashSet<string>(StringComparer.Ordinal);
        int lineCount = 0;
        int skipped = 0;

        foreach (var rawLine in File.ReadLines(mapPath))
        {
            lineCount++;
            if (string.IsNullOrWhiteSpace(rawLine)) { skipped++; continue; }
            var tabIdx = rawLine.IndexOf('\t');
            if (tabIdx <= 0 || tabIdx == rawLine.Length - 1) { skipped++; continue; }
            var obf = rawLine[..tabIdx];
            var orig = rawLine[(tabIdx + 1)..];
            if (string.IsNullOrEmpty(obf) || string.IsNullOrEmpty(orig)) { skipped++; continue; }

            if (!byObfuscated.TryAdd(obf, orig))
            {
                // ConfuserEx con ReuseNames=false (default-effective con
                // mode=decodable) non dovrebbe mai produrre collisioni, ma
                // tracciamo per diagnostica.
                collisions.Add(obf);
            }
        }

        if (byObfuscated.Count == 0)
            throw new InvalidDataException(
                $"symbols.map has no valid mappings: {mapPath}");

        return new ConfuserSymbolMap(
            ByObfuscated: byObfuscated.ToFrozenDictionary(),
            Collisions: collisions.ToFrozenSet(),
            EntryCount: byObfuscated.Count,
            SourceLineCount: lineCount,
            SkippedLineCount: skipped,
            SourcePath: mapPath);
    }

    /// <summary>
    ///  Applica il map reverse a uno stack trace .NET. Sostituisce ogni token
    ///  che assomiglia a un identifier ConfuserEx Decodable
    ///  (regex <c>_[A-Za-z0-9]{15,40}</c>) con la signature originale, se
    ///  presente nel map. Preserva tutto il resto della stringa.
    /// </summary>
    public string Apply(ConfuserSymbolMap map, string obfuscatedStack)
    {
        if (string.IsNullOrEmpty(obfuscatedStack)) return obfuscatedStack;
        if (map.ByObfuscated.Count == 0) return obfuscatedStack;

        var sb = new StringBuilder(obfuscatedStack.Length + 256);
        int last = 0;
        foreach (Match m in _obfuscatedTokenRegex.Matches(obfuscatedStack))
        {
            sb.Append(obfuscatedStack, last, m.Index - last);
            if (map.ByObfuscated.TryGetValue(m.Value, out var orig))
            {
                sb.Append(orig);
            }
            else
            {
                sb.Append(m.Value);
            }
            last = m.Index + m.Length;
        }
        if (last < obfuscatedStack.Length)
            sb.Append(obfuscatedStack, last, obfuscatedStack.Length - last);
        return sb.ToString();
    }
}

/// <summary>Risultato del parsing di un symbols.map — immutable, thread-safe.</summary>
public sealed record ConfuserSymbolMap(
    FrozenDictionary<string, string> ByObfuscated,
    FrozenSet<string> Collisions,
    int EntryCount,
    int SourceLineCount,
    int SkippedLineCount,
    string SourcePath);
