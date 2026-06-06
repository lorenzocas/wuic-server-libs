using System.Text.RegularExpressions;

namespace WuicRagEngine;

/// <summary>
/// Porting fedele di search_loaded() (generate_embeddings.py) con i parametri che
/// il server usa (_do_search): top_k variabile, candidate_window=null =>
/// max(30, top_k*4), doc_recall_guarantee=5, adaptive_alpha=true, alpha 0.55/0.45,
/// tech/desc 0.10/0.90, rerank symbol1.35/path0.70/textoverlap0.60, CE on,
/// ce_top_n=40, ce_blend=0.85, ce_intent_weight=0.0, no hyde.
/// </summary>
public sealed class Pipeline
{
    private readonly List<Doc> _docs;
    private readonly float[] _vectors;
    private readonly int _rows, _cols;
    private readonly Bm25 _bm25;
    private readonly OnnxEmbedder _emb;
    private readonly OnnxReranker _ce;
    private readonly Xlmr _tok;

    public Pipeline(List<Doc> docs, float[] vectors, int rows, int cols,
                    Bm25 bm25, OnnxEmbedder emb, OnnxReranker ce, Xlmr tok)
    { _docs = docs; _vectors = vectors; _rows = rows; _cols = cols; _bm25 = bm25; _emb = emb; _ce = ce; _tok = tok; }

    // ---------- stage 0: tokenize / tech score ----------
    private static readonly Regex TechRe = new(
        "(^mc_|^md_|^wg_|^mm_|_id$|^get[A-Z]|^set[A-Z]|^save[A-Z]|^load[A-Z]|^suggest[A-Z]|^parse[A-Z]|^build[A-Z])",
        RegexOptions.Compiled);
    private static readonly HashSet<string> TechWords = new(StringComparer.Ordinal)
        { "sql", "stored", "metadata", "metadati", "route", "callback", "lookup", "workflow" };

    private static double Technicality(string query)
    {
        var q = Bm25.Tokenize(query);
        if (q.Count == 0) return 0.0;
        double score = 0;
        foreach (var t in q)
        {
            if (TechRe.IsMatch(t)) score += 1.0;
            if (t.Contains('_') || t.Contains('.')) score += 0.5;
            if (TechWords.Contains(t)) score += 0.35;
        }
        double capped = Math.Min(score / Math.Max(1.0, q.Count * 0.8), 1.0);
        return Math.Max(0.0, Math.Min(1.0, capped));
    }

    // ---------- vector scores ----------
    private double[] VectorScores(string query)
    {
        var ids = _tok.EncodeSingle(query);
        var qv = _emb.Encode(ids); // già normalizzato
        var s = new double[_rows];
        for (int i = 0; i < _rows; i++)
        {
            int b = i * _cols; double acc = 0;
            for (int k = 0; k < _cols; k++) acc += (double)_vectors[b + k] * qv[k];
            s[i] = acc;
        }
        return s;
    }

    // ---------- public API ----------
    /// <summary>Solo chunk_id (usato dal gate di parità).</summary>
    public List<string> Search(string query, int topK = 8, double ceBlend = 0.85,
        int ceTopN = 40, double ceIntentWeight = 0.0, int docRecallGuarantee = 5)
        => RankIndices(query, topK, ceBlend, ceTopN, ceIntentWeight, docRecallGuarantee, out _, out _)
            .Select(i => _docs[i].ChunkId).ToList();

    /// <summary>Risultati ricchi (contratto server /api/rag/query).</summary>
    public List<RagHit> SearchHits(string query, int topK = 8, double ceBlend = 0.85,
        int ceTopN = 40, double ceIntentWeight = 0.0, int docRecallGuarantee = 5)
    {
        var idx = RankIndices(query, topK, ceBlend, ceTopN, ceIntentWeight, docRecallGuarantee, out var vec, out var lex);
        var hits = new List<RagHit>(idx.Count);
        int rank = 1;
        foreach (var i in idx)
        {
            var d = _docs[i];
            string text = d.Text ?? "";
            // Fino a 1500 char: QueryJson tronca a 500 per la UI, ChatJson usa l'intero per il contesto LLM.
            string snippet = text.Length > 1500 ? text.Substring(0, 1500) : text;
            hits.Add(new RagHit(rank++, d.ChunkId, d.RelPath, d.SymbolName, d.SymbolType,
                d.StartLine, d.EndLine, vec[i], lex.Length > i ? lex[i] : 0.0, snippet));
        }
        return hits;
    }

    // ---------- main ----------
    private List<int> RankIndices(string query, int topK, double ceBlend, int ceTopN,
        double ceIntentWeight, int docRecallGuarantee, out double[] vec, out double[] lex)
    {
        double tech = Technicality(query);
        double effAv = 0.90 * (1.0 - tech) + 0.10 * tech;
        effAv = Math.Max(0.0, Math.Min(1.0, effAv));
        double effAb = 1.0 - effAv;

        vec = VectorScores(query);
        lex = _bm25.Scores(query);

        var vecRank = ArgsortDesc(vec);
        var lexRank = ArgsortDesc(lex);

        // RRF fuse su top-200 di ciascun ranking (k=60). Mantengo ordine d'inserimento.
        var fused = new Dictionary<int, double>();
        var insertion = new List<int>();
        void Fuse(int[] rank)
        {
            int lim = Math.Min(200, rank.Length);
            for (int r = 0; r < lim; r++)
            {
                int doc = rank[r];
                if (!fused.ContainsKey(doc)) { fused[doc] = 0; insertion.Add(doc); }
                fused[doc] += 1.0 / (60 + (r + 1));
            }
        }
        Fuse(vecRank); Fuse(lexRank);

        // min-max normalize vec/lex sul candidate pool
        var candIds = insertion;
        double vlo = double.MaxValue, vhi = double.MinValue, llo = double.MaxValue, lhi = double.MinValue;
        foreach (var d in candIds)
        {
            vlo = Math.Min(vlo, vec[d]); vhi = Math.Max(vhi, vec[d]);
            llo = Math.Min(llo, lex[d]); lhi = Math.Max(lhi, lex[d]);
        }
        double MM(double x, double lo, double hi) => (hi - lo < 1e-9) ? 0.0 : (x - lo) / (hi - lo);

        var blended = new List<(int doc, double s)>(candIds.Count);
        foreach (var d in candIds)
        {
            double vn = MM(vec[d], vlo, vhi), ln = MM(lex[d], llo, lhi);
            blended.Add((d, effAv * vn + effAb * ln + fused[d]));
        }
        // sort desc stabile (preserva ordine d'inserimento sui pari) come Python list.sort
        var blendedSorted = blended.OrderByDescending(x => x.s).ToList();

        int cw = Math.Max(30, topK * 4);
        var candidates = blendedSorted.Take(cw).Select(x => x.doc).ToList();

        // doc-recall guarantee: aggiungi fino a N docs/pages non già nel pool
        if (docRecallGuarantee > 0)
        {
            var inPool = new HashSet<int>(candidates);
            int added = 0;
            foreach (var (doc, _) in blendedSorted)
            {
                if (added >= docRecallGuarantee) break;
                if (inPool.Contains(doc)) continue;
                string rp = (_docs[doc].RelPath ?? "").Replace('\\', '/').ToLowerInvariant();
                if (rp.Contains("/docs/pages/") && rp.EndsWith(".md"))
                { candidates.Add(doc); inPool.Add(doc); added++; }
            }
        }

        var reranked = RerankLight(query, candidates);

        // ---------- cross-encoder ----------
        if (reranked.Count > 0)
        {
            var topForCe = reranked.Take(ceTopN).ToList();
            var ceScores = new double[topForCe.Count];
            for (int i = 0; i < topForCe.Count; i++)
            {
                string t = _docs[topForCe[i]].Text ?? "";
                if (t.Length > 1500) t = t.Substring(0, 1500);
                var ids = _tok.EncodePair(query, t);
                ceScores[i] = _ce.Score(ids);
            }
            // min-max CE
            double clo = double.MaxValue, chi = double.MinValue;
            foreach (var c in ceScores) { clo = Math.Min(clo, c); chi = Math.Max(chi, c); }
            var ceNorm = new double[ceScores.Length];
            for (int i = 0; i < ceScores.Length; i++)
                ceNorm[i] = (chi - clo < 1e-9) ? 0.0 : (ceScores[i] - clo) / (chi - clo);

            var qRaw = new HashSet<string>(Bm25.Tokenize(query));
            var qExp = ExpandQueryTokens(qRaw);
            int n = Math.Max(1, topForCe.Count);
            // intent boost normalizzato (intent_weight=1.0 in raw, poi /max)
            var rawIntent = new double[topForCe.Count];
            double maxIntent = 0;
            for (int i = 0; i < topForCe.Count; i++)
            {
                string rp = (_docs[topForCe[i]].RelPath ?? "").ToLowerInvariant();
                rawIntent[i] = IntentPathBoost(qRaw, rp, 1.0);
                maxIntent = Math.Max(maxIntent, rawIntent[i]);
            }

            var blendedCe = new List<(int doc, double s)>(topForCe.Count);
            for (int ri = 0; ri < topForCe.Count; ri++)
            {
                int doc = topForCe[ri];
                double light = 1.0 - ((double)ri / n);
                double intentNorm = maxIntent > 0 ? rawIntent[ri] / maxIntent : 0.0;
                double score = ceBlend * ceNorm[ri] + (1.0 - ceBlend) * light + intentNorm * ceIntentWeight;
                string rpath = _docs[doc].RelPath ?? "";
                score *= SourcePriorityBoost(rpath);
                score *= DocTitleBoost(rpath, _docs[doc].Text ?? "", qExp);
                blendedCe.Add((doc, score));
            }
            var ceSorted = blendedCe.OrderByDescending(x => x.s).Select(x => x.doc).ToList();
            // reranked = ceSorted + reranked[ceTopN:]
            reranked = ceSorted.Concat(reranked.Skip(ceTopN)).ToList();
        }

        return reranked.Take(topK).ToList();
    }

    // argsort discendente, tie-break per indice crescente (deterministico)
    private static int[] ArgsortDesc(double[] x)
    {
        var idx = new int[x.Length];
        for (int i = 0; i < x.Length; i++) idx[i] = i;
        Array.Sort(idx, (a, b) => { int c = x[b].CompareTo(x[a]); return c != 0 ? c : a.CompareTo(b); });
        return idx;
    }

    // ---------- rerank_light_weighted ----------
    private List<int> RerankLight(string query, List<int> candidateIds,
        double symbolWeight = 1.35, double pathWeight = 0.70, double textOverlapWeight = 0.60,
        double methodTypeBonus = 0.45, double classTypePenalty = 0.30,
        double windowTypePenalty = 0.50, double intentPathWeight = 0.70)
    {
        var qRaw = new HashSet<string>(Bm25.Tokenize(query));
        if (qRaw.Count == 0) return candidateIds;
        var qTokens = ExpandQueryTokens(qRaw);
        int nQ = Math.Max(1, qTokens.Count);
        bool asksForClass = qRaw.Overlaps(new[] { "classe", "class", "componente", "component", "service", "servizio" });
        string qLower = (query ?? "").ToLowerInvariant();

        var scored = new List<(int doc, double s)>(candidateIds.Count);
        foreach (var i in candidateIds)
        {
            var toks = new HashSet<string>(Bm25.Tokenize(_docs[i].Text));
            int inter = 0; foreach (var t in qTokens) if (toks.Contains(t)) inter++;
            double overlap = (inter / (double)nQ) * textOverlapWeight;

            string sname = (_docs[i].SymbolName ?? "").ToLowerInvariant();
            string rpath = (_docs[i].RelPath ?? "").ToLowerInvariant();
            double symbolBonus = 0, pathBonus = 0;
            foreach (var t in qTokens)
            {
                if (sname.Length > 0 && sname.Contains(t)) symbolBonus += symbolWeight;
                if (rpath.Contains(t)) pathBonus += pathWeight;
            }
            double exactSymbol = (sname.Length > 0 && qLower.Contains(sname)) ? 1.25 : 0.0;

            string symType = (_docs[i].SymbolType ?? "").ToLowerInvariant();
            double typeBias = 0;
            if (symType == "method") typeBias = methodTypeBonus;
            else if (symType == "class" && !asksForClass) typeBias = -classTypePenalty;
            else if (symType == "window") typeBias = -windowTypePenalty;

            double intentBoost = IntentPathBoost(qRaw, rpath, intentPathWeight);
            scored.Add((i, overlap + symbolBonus + pathBonus + exactSymbol + typeBias + intentBoost));
        }
        return scored.OrderByDescending(x => x.s).Select(x => x.doc).ToList();
    }

    // ---------- tabelle / boost ----------
    private static readonly Dictionary<string, string[]> ItEn = BuildItEn();
    private static HashSet<string> ExpandQueryTokens(HashSet<string> q)
    {
        var e = new HashSet<string>(q, StringComparer.Ordinal);
        foreach (var tok in q)
            if (ItEn.TryGetValue(tok, out var al)) foreach (var a in al) e.Add(a);
        return e;
    }

    private static readonly (string[] triggers, string[] frags)[] IntentBoosts =
    {
        (new[]{"endpoint","api","controller","controllers","rest"}, new[]{"/controllers/"}),
        (new[]{"service","servizio","servizi","logica","business"}, new[]{"/services/"}),
        (new[]{"helper","helpers","utility","utilities","util"}, new[]{"/helpers/"}),
        (new[]{"metamodel","entita","entity","entities","modello"}, new[]{"/metamodel/"}),
        (new[]{"frontend","client","componente","component","angular"}, new[]{"/wuic-framework-lib/src/lib/"}),
        (new[]{"workflow","graph","grafo","runner","designer"}, new[]{"/workflow-runner/","/workflow-designer/","workflow-runtime"}),
        (new[]{"auth","autenticazione","login","logout","accesso"}, new[]{"/authcontroller","auth-session"}),
        (new[]{"notifica","notifiche","notification","notifications"}, new[]{"/notificationscontroller","/notifications/"}),
        (new[]{"report","reportistica","stampa","pdf"}, new[]{"/reportdesignercontroller","/report-"}),
        (new[]{"datasource","data-source","grid","griglia"}, new[]{"/data-source/","/list-grid/"}),
        (new[]{"menu","voce","voci"}, new[]{"/meta-menu/","metamodelraw"}),
        (new[]{"scheduler","schedulazione","schedulato","cron"}, new[]{"/scheduler","scheduler_"}),
        (new[]{"pivot","pivoting"}, new[]{"pivot"}),
        (new[]{"import","importazione","importa"}, new[]{"/import-export-button/","import"}),
        (new[]{"export","esportazione","esporta"}, new[]{"/import-export-button/","export"}),
    };
    private static double IntentPathBoost(HashSet<string> qRaw, string rpathLower, double w)
    {
        if (qRaw.Count == 0 || string.IsNullOrEmpty(rpathLower)) return 0.0;
        double boost = 0;
        foreach (var (triggers, frags) in IntentBoosts)
            if (qRaw.Overlaps(triggers))
                foreach (var f in frags) if (rpathLower.Contains(f)) { boost += w; break; }
        return boost;
    }

    private const double TierDocs = 1.55, TierWuictest = 1.30, TierCore = 1.00, TierSkill = 0.80;
    private static double SourcePriorityBoost(string rpath)
    {
        if (string.IsNullOrEmpty(rpath)) return TierCore;
        string norm = rpath.Replace('\\', '/').ToLowerInvariant();
        if (norm.Contains("/docs/pages/") && norm.EndsWith(".md")) return TierDocs;
        if (norm.EndsWith(".md") && (norm.Contains("/skills/") || norm.Contains("/scripts/"))) return TierSkill;
        if (norm.StartsWith("wuictest/") || norm.Contains("/wuictest/")) return TierWuictest;
        return TierCore;
    }

    private const double DocTitleW = 0.60;
    private static readonly HashSet<string> TitleStop = new(StringComparer.Ordinal)
    {
        "il","lo","la","i","gli","le","un","uno","una","di","a","da","in","con","su","per","tra","fra",
        "e","o","ed","od","del","della","dello","dei","degli","delle","al","allo","alla","ai","agli","alle",
        "come","cosa","che","chi","dove","quando","the","an","of","to","on","for","and","or","with","how",
        "what","is","are","do","does",
    };
    private static readonly Regex HeadingRe = new(@"^\s{0,3}#{1,3}\s+(.+?)\s*$", RegexOptions.Multiline | RegexOptions.Compiled);

    private static HashSet<string> DocTitleTokens(string rpathNorm, string text)
    {
        var tokens = new HashSet<string>(StringComparer.Ordinal);
        string fname = rpathNorm.Contains('/') ? rpathNorm[(rpathNorm.LastIndexOf('/') + 1)..] : rpathNorm;
        if (fname.EndsWith(".md")) fname = fname[..^3];
        foreach (var part in Regex.Split(fname, "[-_]"))
        {
            string p = part.Trim().ToLowerInvariant();
            if (p.Length > 0 && !TitleStop.Contains(p)) tokens.Add(p);
        }
        var m = HeadingRe.Match(text ?? "");
        if (m.Success)
            foreach (var t in Bm25.Tokenize(m.Groups[1].Value)) if (!TitleStop.Contains(t)) tokens.Add(t);
        return tokens;
    }
    private static double DocTitleBoost(string rpath, string text, HashSet<string> qExpanded)
    {
        if (string.IsNullOrEmpty(rpath) || qExpanded.Count == 0) return 1.0;
        string norm = rpath.Replace('\\', '/').ToLowerInvariant();
        if (!norm.Contains("/docs/pages/") || !norm.EndsWith(".md")) return 1.0;
        var title = DocTitleTokens(norm, text);
        if (title.Count == 0) return 1.0;
        int matched = title.Count(qExpanded.Contains);
        if (matched == 0) return 1.0;
        double coverage = (double)matched / title.Count;
        return 1.0 + DocTitleW * coverage;
    }

    private static Dictionary<string, string[]> BuildItEn() => new(StringComparer.Ordinal)
    {
        ["tabella"]=new[]{"table"}, ["tabelle"]=new[]{"table","tables"},
        ["colonna"]=new[]{"column","field"}, ["colonne"]=new[]{"column","columns","field","fields"},
        ["campo"]=new[]{"field","column"}, ["campi"]=new[]{"field","fields","column","columns"},
        ["voce"]=new[]{"entry","item"}, ["voci"]=new[]{"entry","entries","item","items"},
        ["menu"]=new[]{"menu"}, ["riga"]=new[]{"row","record"}, ["righe"]=new[]{"row","rows","record","records"},
        ["record"]=new[]{"record"}, ["pagina"]=new[]{"page"}, ["pagine"]=new[]{"page","pages"},
        ["ricerca"]=new[]{"search","find"}, ["cerca"]=new[]{"search","find"},
        ["lettura"]=new[]{"read","get","load"}, ["leggere"]=new[]{"read","get"}, ["leggi"]=new[]{"read","get"},
        ["salvataggio"]=new[]{"save","store","update","insert"}, ["salva"]=new[]{"save","store"},
        ["inserimento"]=new[]{"insert","add","create"}, ["inserisci"]=new[]{"insert","add","create"},
        ["aggiunta"]=new[]{"add","insert","create"}, ["aggiungi"]=new[]{"add","insert","create"},
        ["creazione"]=new[]{"create","new","make"}, ["crea"]=new[]{"create","new"},
        ["modifica"]=new[]{"update","edit","modify"}, ["aggiornamento"]=new[]{"update","refresh"},
        ["aggiorna"]=new[]{"update","refresh"}, ["cancellazione"]=new[]{"delete","remove"},
        ["cancella"]=new[]{"delete","remove"}, ["eliminazione"]=new[]{"delete","remove"},
        ["elimina"]=new[]{"delete","remove"}, ["ripristino"]=new[]{"restore","undelete"},
        ["ripristina"]=new[]{"restore"}, ["esecuzione"]=new[]{"execute","run","exec"},
        ["esegui"]=new[]{"execute","run"}, ["stampa"]=new[]{"print","report"},
        ["esportazione"]=new[]{"export"}, ["esporta"]=new[]{"export"},
        ["importazione"]=new[]{"import"}, ["importa"]=new[]{"import"},
        ["report"]=new[]{"report","pdf","print"}, ["scheda"]=new[]{"form","card"},
        ["elenco"]=new[]{"list","grid"}, ["lista"]=new[]{"list","grid"}, ["griglia"]=new[]{"grid","datagrid"},
        ["filtro"]=new[]{"filter","where"}, ["filtra"]=new[]{"filter"},
        ["ordinamento"]=new[]{"sort","order"}, ["ordina"]=new[]{"sort","order"},
        ["metadati"]=new[]{"metadata","meta"}, ["metadato"]=new[]{"metadata","meta"},
        ["utente"]=new[]{"user"}, ["utenti"]=new[]{"user","users"},
        ["permesso"]=new[]{"permission","auth","role"}, ["permessi"]=new[]{"permission","permissions","auth","role","roles"},
        ["ruolo"]=new[]{"role"}, ["ruoli"]=new[]{"role","roles"},
        ["autenticazione"]=new[]{"auth","authenticate","login"}, ["accesso"]=new[]{"login","access","auth"},
        ["uscita"]=new[]{"logout"}, ["stored"]=new[]{"stored","procedure","sproc"},
        ["procedura"]=new[]{"procedure","stored"}, ["procedure"]=new[]{"procedure","stored"},
        ["vista"]=new[]{"view"}, ["viste"]=new[]{"view","views"}, ["tenant"]=new[]{"tenant"},
        ["notifica"]=new[]{"notification","notify"}, ["notifiche"]=new[]{"notification","notifications"},
        ["schedulazione"]=new[]{"scheduler","schedule","cron"}, ["schedulato"]=new[]{"scheduled","scheduler"},
        ["completo"]=new[]{"full","complete"}, ["paginato"]=new[]{"paged","paginated","page"},
        ["paginazione"]=new[]{"paging","pagination","page"}, ["lookup"]=new[]{"lookup","combo","select"},
        ["combo"]=new[]{"combo","lookup","dropdown"}, ["dashboard"]=new[]{"dashboard","board"},
        ["workflow"]=new[]{"workflow","wf","graph"}, ["grafo"]=new[]{"graph","workflow"},
        ["albero"]=new[]{"tree"}, ["nodo"]=new[]{"node"},
    };
}
