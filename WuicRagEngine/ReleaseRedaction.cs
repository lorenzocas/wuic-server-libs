using System.Text;
using System.Text.RegularExpressions;

namespace WuicRagEngine;

/// <summary>
/// Porting fedele di release_redaction.py: regole di redazione del profilo "release".
/// Classifica ogni chunk in public | signature | deny e, in release, espone:
///   public    -> testo integrale
///   signature -> sola firma (doc-comment + dichiarazione, body troncato)  oppure null se non estraibile
///   deny      -> null (chunk escluso)
/// In profilo "internal" non si applica (testo integrale). Difesa-in-profondita':
/// anche sull'indice internal, in release i body del framework non escono nella risposta.
/// </summary>
public static class ReleaseRedaction
{
    private static readonly HashSet<string> InternalDocSlugs = new(StringComparer.Ordinal) { "rag-knowledge-gaps" };
    private const string DocInternalMarker = "rag:internal";

    private static readonly string[] ExampleAppPrefixes =
        { "wuictest/", "crmapp/", "fatturazioneelettronica/", "flottamezzi/" };

    private static readonly HashSet<string> FrameworkSigSymbols = new(StringComparer.Ordinal)
    { "method", "constructor", "property", "function", "class", "interface", "enum", "accessor" };

    private static readonly Regex PartRe = new(@"__part0*(\d+)$", RegexOptions.Compiled);

    private static readonly HashSet<string> DeclWords = new(StringComparer.Ordinal)
    {
        "public","private","protected","internal","static","async","abstract","virtual","override",
        "sealed","partial","class","interface","enum","struct","record","void","function","const",
        "let","readonly","get","set","export","declare",
    };
    private static readonly HashSet<string> CtrlWords = new(StringComparer.Ordinal)
    {
        "if","for","while","switch","foreach","using","return","new","var","else","catch","try",
        "throw","await","yield","lock","do",
    };
    private static readonly HashSet<char> BodyStartChars = new("=[]{}.).,;+-*/&|<>!?:");

    private static string DocSlug(string norm)
    {
        string after = norm.Split(new[] { "/docs/pages/" }, 2, StringSplitOptions.None)[1];
        string fname = after.Contains('/') ? after.Substring(after.LastIndexOf('/') + 1) : after;
        return fname.EndsWith(".md") ? fname.Substring(0, fname.Length - 3) : fname;
    }

    private static bool DocIsPublic(string norm) => !InternalDocSlugs.Contains(DocSlug(norm));
    private static bool TextMarksInternal(string? text) => !string.IsNullOrEmpty(text) && text.Contains(DocInternalMarker);

    public static bool IsAiInternalGuide(string? relPath)
    {
        string norm = (relPath ?? "").Replace('\\', '/').ToLowerInvariant();
        return norm.EndsWith(".md") && (norm.Contains("/skills/") || norm.Contains("/scripts/"));
    }

    private static bool IsContinuationChunk(string? symbolName)
    {
        var m = PartRe.Match(symbolName ?? "");
        return m.Success && int.Parse(m.Groups[1].Value) >= 2;
    }

    public static bool LooksLikeDeclaration(string decl)
    {
        string d = (decl ?? "").Trim();
        if (d.Length == 0 || BodyStartChars.Contains(d[0])) return false;
        var m = Regex.Match(d, @"[A-Za-z_]\w*");
        string first = m.Success ? m.Value.ToLowerInvariant() : "";
        if (CtrlWords.Contains(first)) return false;
        if (DeclWords.Contains(first)) return true;
        if (Regex.IsMatch(d, @"^[A-Za-z_]\w*\s*\(")) return true;
        return Regex.IsMatch(d, @"^[\w<>\[\],\.\?\s]+\b\w+\s*\(");
    }

    /// <summary>'public' | 'signature' | 'deny' secondo le regole release.</summary>
    public static string Classify(string? relPath, string? symbolType, string? symbolName)
    {
        string norm = (relPath ?? "").Replace('\\', '/').ToLowerInvariant();
        if (norm.Length == 0) return "deny";
        if (norm.Contains("/secrets/") || norm.StartsWith("secrets/")) return "deny";
        if (norm.Contains("/docs/pages/") && norm.EndsWith(".md"))
            return DocIsPublic(norm) ? "public" : "deny";
        if (norm.EndsWith(".d.ts")) return "public";
        if (norm.EndsWith(".md") && (norm.Contains("/skills/") || norm.Contains("/scripts/"))) return "deny";
        foreach (var p in ExampleAppPrefixes)
            if (norm.StartsWith(p) || norm.Contains("/" + p)) return "public";
        bool isFrameworkSrc = norm.EndsWith(".cs")
            || (norm.Contains("/wuic-framework-lib/src/lib/") && norm.EndsWith(".ts"));
        if (isFrameworkSrc)
        {
            if (!FrameworkSigSymbols.Contains((symbolType ?? "").ToLowerInvariant())) return "deny";
            if (IsContinuationChunk(symbolName)) return "deny";
            return "signature";
        }
        return "deny";
    }

    private const string BodyMarker = "  { … }"; // "  { … }"

    /// <summary>Estrae la firma (doc-comment + dichiarazione) troncando il body.
    /// "" se cio' che precede il body non sembra una dichiarazione.</summary>
    public static string ExtractSignature(string text, int maxLen = 1100)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var lines = text.Replace("\r\n", "\n").Split('\n');
        var head = new List<string>();
        int i = 0;
        while (i < lines.Length)
        {
            string s = lines[i].Trim();
            if (s.Length == 0 || s.StartsWith("///") || s.StartsWith("//") || s.StartsWith("*")
                || s.StartsWith("/*") || s.StartsWith("[") || s.StartsWith("@"))
            { head.Add(lines[i].TrimEnd()); i++; }
            else break;
        }
        string rest = string.Join("\n", lines.Skip(i));
        int cut = rest.Length;
        foreach (var marker in new[] { "{", ";", "=>" })
        {
            int p = rest.IndexOf(marker, StringComparison.Ordinal);
            if (p != -1) cut = Math.Min(cut, p);
        }
        string decl = string.Join(" ", rest.Substring(0, cut).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (!LooksLikeDeclaration(decl)) return "";
        var headLines = head.Where(h => h.Trim().Length > 0).ToList();
        if (headLines.Count == 0) return decl + BodyMarker;
        int budget = maxLen - decl.Length - BodyMarker.Length - 1;
        string headTxt = string.Join("\n", headLines);
        if (budget <= 0) return decl + BodyMarker;
        if (headTxt.Length > budget)
        {
            var kept = new List<string>(); int used = 0;
            foreach (var h in headLines)
            {
                int add = h.Length + 1;
                if (used + add > budget) break;
                kept.Add(h); used += add;
            }
            kept.Add("/// …");
            headTxt = string.Join("\n", kept);
        }
        return headTxt + "\n" + decl + BodyMarker;
    }

    /// <summary>Testo da conservare in release: integrale (public), firma (signature) o null (deny).</summary>
    public static string? RedactText(string? relPath, string? symbolType, string? symbolName, string text)
    {
        string cls = Classify(relPath, symbolType, symbolName);
        if (cls == "deny") return null;
        string norm = (relPath ?? "").Replace('\\', '/').ToLowerInvariant();
        if (norm.Contains("/docs/pages/") && TextMarksInternal(text)) return null;
        if (cls == "signature")
        {
            string sig = ExtractSignature(text);
            return sig.Length > 0 ? sig : null;
        }
        return text;
    }

    /// <summary>Path da ESPORRE in release. Per il sorgente framework (`signature`) il path
    /// interno del sorgente proprietario NON deve trapelare: lo sostituiamo col nome del
    /// PACCHETTO pubblico (npm/NuGet) che l'end developer referenzia comunque. Il riferimento
    /// utile resta (firma del metodo/classe + symbol_name), ma non il percorso del file.
    /// Per i chunk `public` (docs/pages, *.d.ts, app-esempio) il path e' un riferimento
    /// legittimo e viene mantenuto. `deny` non arriva mai qui (RedactText lo droppa prima).</summary>
    public static string RedactPath(string? relPath, string? symbolType, string? symbolName)
    {
        string norm = (relPath ?? "").Replace('\\', '/');
        string lower = norm.ToLowerInvariant();

        // Docs pubbliche: il CONTENUTO e' anche pubblicato online -> emetti l'URL NAVIGABILE del
        // docs-site (https://wuic-framework.com/docs/<slug>), cliccabile dall'end-dev. NON il path
        // del file interno (KonvergenceCore/wwwroot/my-workspace/.../docs/pages/...): quel file non
        // esiste nel pacchetto e leakerebbe il layout del repo. Slug = filename senza .md; il locale
        // e' una directory e NON cambia lo slug (en-US/datasource.md e datasource.md -> 'datasource').
        if ((lower.Contains("/docs/pages/") || lower.StartsWith("docs/pages/")) && lower.EndsWith(".md"))
        {
            string fname = norm.Substring(norm.LastIndexOf('/') + 1);
            string slug = fname.Substring(0, fname.Length - 3).ToLowerInvariant();
            return "https://wuic-framework.com/docs/" + slug;
        }

        // *.d.ts pubblici del framework: esponi il PACCHETTO, non il path interno.
        if (lower.EndsWith(".d.ts") && lower.Contains("/wuic-framework-lib/"))
            return "wuic-framework-lib";

        string cls = Classify(relPath, symbolType, symbolName);
        if (cls != "signature") return relPath ?? "";   // app-esempio (WuicTest/...): path utente, tenuto
        if (lower.Contains("/wuic-framework-lib/src/lib/") && lower.EndsWith(".ts"))
            return "wuic-framework-lib";   // pacchetto npm pubblico
        if (lower.EndsWith(".cs"))
            return "WuicCore";             // pacchetto NuGet pubblico
        return "WUIC (framework)";
    }

    /// <summary>True se per questo chunk, in release, il path viene redatto (sorgente framework
    /// signature). I chiamanti la usano per azzerare anche start/end line (un numero di riga
    /// verso un path redatto e' insensato e resta un residuo di localizzazione del sorgente).</summary>
    public static bool PathIsRedacted(string? relPath, string? symbolType, string? symbolName)
        => Classify(relPath, symbolType, symbolName) == "signature";
}
