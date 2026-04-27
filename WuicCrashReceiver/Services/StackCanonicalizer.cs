using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Calcola un hash deterministico per stack trace .NET / JavaScript, in
///  modo che lo stesso bug (stesso path di chiamate) produca lo stesso
///  <c>stack_hash</c> indipendentemente da:
///   - line/column offsets (variano fra build minified/non)
///   - URL absoluti dei chunk webpack (`@fs/...`, `?v=hash`, ecc.)
///   - hex/numeric ids (`0xdeadbeef`, `index_4827`)
///   - timestamp inline (es. `built at 1777289400`)
///   - <c>at &lt;anonymous&gt;:LINE:COL</c> JS suffix
///
///  Il client puo' calcolarlo in advance (per dedup ottimistico in-memory)
///  ma se l'invia il server lo ricomputa e PREFERISCE il proprio (così
///  client malevolo non fa esplodere il dedup forgiando hash random).
/// </summary>
public static class StackCanonicalizer
{
    // Numeri lunghi (>= 4 cifre): line/column/build hashes / mem addresses.
    private static readonly Regex RxLongNumber = new(@"\d{4,}", RegexOptions.Compiled);
    // Hex sequences (>= 8 chars): chunk hashes, build ids, addresses.
    private static readonly Regex RxLongHex = new(@"\b[0-9a-fA-F]{8,}\b", RegexOptions.Compiled);
    // URL queries: `?v=abcd` and similar.
    private static readonly Regex RxQueryV = new(@"\?v=[A-Za-z0-9]+", RegexOptions.Compiled);
    // Anonymous frame markers used by JS engines.
    private static readonly Regex RxAnonymous = new(@"<anonymous>:\d+:\d+", RegexOptions.Compiled);
    // Multiple whitespace -> single space.
    private static readonly Regex RxWs = new(@"\s+", RegexOptions.Compiled);

    public static string Canonicalize(string stack)
    {
        if (string.IsNullOrWhiteSpace(stack)) return string.Empty;
        string s = stack;
        s = RxQueryV.Replace(s, "");
        s = RxAnonymous.Replace(s, "<anon>");
        s = RxLongHex.Replace(s, "<hex>");
        s = RxLongNumber.Replace(s, "<n>");
        s = RxWs.Replace(s, " ").Trim();
        return s;
    }

    public static string ComputeHash(string canonical)
    {
        if (string.IsNullOrEmpty(canonical)) return string.Empty;
        byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        var sb = new StringBuilder(bytes.Length * 2);
        foreach (byte b in bytes) sb.Append(b.ToString("x2"));
        return sb.ToString();
    }

    /// <summary>One-shot helper: canonicalize + hash.</summary>
    public static string CanonicalHash(string stack) => ComputeHash(Canonicalize(stack));
}
