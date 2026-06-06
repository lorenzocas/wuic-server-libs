using System.Text.Json;
using System.Text.Json.Serialization;

namespace WuicRagEngine;

/// <summary>
/// Facade pubblico del satellite RAG .NET. Entry-point caricato da KonvergenceCore
/// via Assembly.LoadFrom (reflection) SOLO quando AppSetting rag-use-dotnet-engine=true.
///
/// Layout artefatti atteso sotto `root` (stesso che il downloader on-demand ricrea):
///   {root}/bge_m3.onnx (+ .onnx_data)
///   {root}/reranker_merged.onnx (+ .onnx_data)
///   {root}/tokenizer/sentencepiece.bpe.model
///   {root}/tokenizer/bge_m3/tokenizer.json
///   {root}/index/vectors.npy
///   {root}/index/metadata.jsonl
///   {root}/_translate_cache_v3.json   (opzionale, lookup IT->EN)
///
/// Parità validata (gate end-to-end): top-1 39/40, overlap top-8 99.4% vs Python.
/// </summary>
public sealed class RagEngine : IDisposable
{
    private readonly Pipeline _pipe;
    private readonly OnnxEmbedder _emb;
    private readonly OnnxReranker _ce;
    private readonly Dictionary<string, string> _translate;
    private readonly string _toolsJson; // array tool-definition (verbatim da rag_tools.json), passato a Claude
    private readonly string _envProfile; // floor profile del server: "internal" | "release"
    public int DocsLoaded { get; }

    private RagEngine(Pipeline pipe, OnnxEmbedder emb, OnnxReranker ce,
                      Dictionary<string, string> translate, string toolsJson, string envProfile, int docs)
    { _pipe = pipe; _emb = emb; _ce = ce; _translate = translate; _toolsJson = toolsJson; _envProfile = envProfile; DocsLoaded = docs; }

    /// <summary>Carica indice + modelli ONNX + tokenizer + translate-cache. Costoso (~secondi,
    /// warm-up modelli). Da chiamare una volta e tenere come singleton.</summary>
    public static RagEngine Create(string root, string device = "auto", string profile = "internal")
    {
        // Risoluzione tollerante: layout PROD flat ({root}/X) o layout DEV ({root}/onnx_export/X).
        string Resolve(params string[] candidates)
        {
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0]; // lascia fallire con messaggio chiaro sul path atteso
        }
        string Onnx(string n) => Resolve(Path.Combine(root, n), Path.Combine(root, "onnx_export", n));
        string spModel = Resolve(
            Path.Combine(root, "tokenizer", "sentencepiece.bpe.model"),
            Path.Combine(root, "onnx_export", "tokenizer", "sentencepiece.bpe.model"));
        string tokJson = Resolve(
            Path.Combine(root, "tokenizer", "bge_m3", "tokenizer.json"),
            Path.Combine(root, "onnx_export", "tokenizer", "bge_m3", "tokenizer.json"));
        string vectorsNpy = Path.Combine(root, "index", "vectors.npy");
        string metaJsonl = Path.Combine(root, "index", "metadata.jsonl");
        string translateCache = Path.Combine(root, "_translate_cache_v3.json");

        var docs = Doc.LoadAll(metaJsonl);
        var vectors = Npy.LoadF32Matrix(vectorsNpy, out int rows, out int cols);
        var bm25 = new Bm25(docs);
        var tok = new Xlmr(spModel, tokJson);
        var emb = new OnnxEmbedder(Onnx("bge_m3.onnx"), device);
        var ce = new OnnxReranker(Onnx("reranker_merged.onnx"), device);
        var pipe = new Pipeline(docs, vectors, rows, cols, bm25, emb, ce, tok);

        var translate = new Dictionary<string, string>(StringComparer.Ordinal);
        if (File.Exists(translateCache))
        {
            try
            {
                using var d = JsonDocument.Parse(File.ReadAllText(translateCache));
                foreach (var p in d.RootElement.EnumerateObject())
                    if (p.Value.ValueKind == JsonValueKind.String) translate[p.Name] = p.Value.GetString()!;
            }
            catch { /* cache best-effort */ }
        }

        // tool-definition agentiche (verbatim dal Python). Senza, la chat degrada a Q&A puro.
        string toolsPath = Resolve(Path.Combine(root, "rag_tools.json"), Path.Combine(root, "onnx_export", "rag_tools.json"));
        string toolsJson = File.Exists(toolsPath) ? File.ReadAllText(toolsPath) : "[]";

        // warm-up: prima query reale veloce (evita cold start su prima richiesta utente)
        try { _ = pipe.SearchHits("warmup", topK: 1); } catch { }

        string envProfile = (profile ?? "internal").Trim().ToLowerInvariant() == "release" ? "release" : "internal";
        return new RagEngine(pipe, emb, ce, translate, toolsJson, envProfile, docs.Count);
    }

    /// <summary>Lookup IT->EN nella cache (come _translate_query del server: solo cache, no live).</summary>
    private string Translate(string q) => _translate.TryGetValue(q, out var en) ? en : q;

    /// <summary>Profilo effettivo = strictest-of(env, richiesta): la richiesta puo' solo
    /// AUMENTARE la redazione (preview release su server internal), mai scendere sotto il floor.</summary>
    private string EffectiveProfile(string? reqProfile)
    {
        string req = (reqProfile ?? "").Trim().ToLowerInvariant();
        return (_envProfile == "release" || req == "release") ? "release" : "internal";
    }

    /// <summary>Pipeline sorgenti: over-fetch -> dedup doc-locale -> drop AI-internal ->
    /// (release) drop deny + redact a firma -> slice topK. Ritorna (hit, snippet_finale).</summary>
    private List<(RagHit hit, string snippet)> BuildSources(string query, int topK, string effProfile)
    {
        var raw = _pipe.SearchHits(Translate(query), Math.Max(topK + 8, 12));
        var filtered = DedupDocLocales(DropAiInternal(raw));
        var outp = new List<(RagHit, string)>(topK);
        foreach (var h in filtered)
        {
            string snippet = h.Snippet; // fino a 1500
            if (effProfile == "release")
            {
                var red = ReleaseRedaction.RedactText(h.RelPath, h.SymbolType, h.SymbolName, h.Snippet);
                if (red == null) continue; // deny -> escluso
                snippet = red;
            }
            outp.Add((h, snippet));
            if (outp.Count >= topK) break;
        }
        return outp;
    }

    /// <summary>Retrieval puro -> JSON contratto server /api/rag/query.</summary>
    public string QueryJson(string query, int topK, string profile)
    {
        var srcs = BuildSources(query, topK, EffectiveProfile(profile));
        int rank = 1;
        var dto = new QueryOutDto { Results = srcs.Select(s => ToDto(s.hit, rank++, s.snippet)).ToList() };
        return JsonSerializer.Serialize(dto);
    }

    /// <summary>Stato (contratto /health) + provider ONNX attivo (GPU/CPU) + profilo.</summary>
    public string HealthJson() => JsonSerializer.Serialize(new
    {
        status = "ok",
        engine = "dotnet-onnx",
        provider = OnnxSession.LastProvider,
        profile = _envProfile,
        docs_loaded = DocsLoaded,
        translate_cache_size = _translate.Count,
    });

    private static RagSourceDto ToDto(RagHit h, int rank, string snippet) => new()
    {
        Rank = rank, ChunkId = h.ChunkId, RelPath = h.RelPath,
        SymbolName = h.SymbolName, SymbolType = h.SymbolType,
        StartLine = h.StartLine, EndLine = h.EndLine,
        ScoreVector = h.ScoreVector, ScoreBm25 = h.ScoreBm25,
        Snippet = snippet.Length > 500 ? snippet.Substring(0, 500) : snippet,
    };

    // ---- CHAT (retrieval + Claude) — drop-in di /api/rag/chat del rag_server.py ----
    private static readonly System.Net.Http.HttpClient s_http = new() { Timeout = TimeSpan.FromSeconds(120) };
    private const string SYSTEM_PROMPT =
        "Sei un assistente esperto del codebase WUIC. Rispondi alla domanda dell'utente " +
        "usando ESCLUSIVAMENTE il contesto fornito. Se la risposta non e' nel contesto, " +
        "rispondi 'Non ho trovato informazioni sufficienti nel codebase per rispondere.' " +
        "Cita sempre i file rilevanti tra parentesi quadre nel formato [file.ext::SimboloOpzionale]. " +
        "Rispondi in italiano salvo richiesta esplicita di un'altra lingua. " +
        "Non inventare API o nomi di metodi: se non sono nel contesto, dillo esplicitamente.";

    // System prompt per le RICHIESTE D'AZIONE (vedi LooksLikeActionRequest): action-oriented,
    // NON RAG. Non dice "rispondi solo dal contesto" (che farebbe dire 'non ho trovato info'
    // invece di emettere il tool) e non include snippet codebase (che distraggono dal tool_use).
    private const string ACTION_SYSTEM_PROMPT =
        "Sei l'assistente del CRM WUIC. L'utente sta lavorando sulla pagina indicata nel CONTESTO " +
        "PAGINA UTENTE qui sotto e ti chiede di compiere un'AZIONE sui metadati o sulla UI " +
        "(creare/modificare/aggiungere: toolbar action, row action, colonne o colonne calcolate, " +
        "stili riga/colonna, formule di display o titolo, callback default-value/validazione/" +
        "selezione/lifecycle, pagesize o altri metadati semplici, SQL metadata field, ecc.). " +
        "Emetti SEMPRE il tool `propose_*` piu' appropriato con i parametri dedotti dal contesto " +
        "pagina e dalla richiesta. NON rispondere MAI 'non ho trovato informazioni' e non limitarti " +
        "a spiegare o mostrare codice: hai tutto cio' che serve nel CONTESTO PAGINA UTENTE + nei tool. " +
        "Usa SEMPRE i NOMI REALI delle colonne dal contesto. Solo se e' davvero impossibile capire " +
        "quale colonna/route, chiedi UNA precisazione breve; in ogni altro caso proponi l'azione.";

    private const string COMPACT_SYSTEM_PROMPT =
        "Sei un compattatore di conversazioni. Dato l'archivio di una conversazione " +
        "tra un utente e un assistente, produci un RIASSUNTO conciso (target 1500-3000 " +
        "token, MAI superare 5000) che preservi:\n" +
        "  - Le decisioni architetturali / di design prese\n" +
        "  - I vincoli tecnici scoperti\n" +
        "  - Le route/colonne/entita' discusse\n" +
        "  - Gli endpoint/API menzionati\n" +
        "  - Le preferenze dell'utente esplicitate\n" +
        "  - Lo stato dei task in costruzione (cosa fatto, cosa pendente)\n" +
        "OMETTI:\n" +
        "  - Snippet di codice (l'utente li recupera dalla history visibile)\n" +
        "  - Spiegazioni didattiche/concettuali\n" +
        "  - Errori gia' risolti\n" +
        "  - Chiarimenti gia' dati\n" +
        "Formato: paragrafi italiani, niente bullet eccessivi. Scrivi SOLO il riassunto, " +
        "senza intro tipo 'Ecco il riassunto:'. Sii denso ma leggibile.";

    /// <summary>
    /// Compatta una conversazione in un summary (drop-in di /api/rag/compact del
    /// rag_server.py). `historyJson` = [{role,content}], `previousSummary` per compact
    /// incrementale. Ritorna {summary, tokens_in, tokens_out, warning}.
    /// </summary>
    public string CompactJson(string historyJson, string model, string apiKey, string? previousSummary,
        string? provider = null, string? baseUrl = null)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            return JsonSerializer.Serialize(new { summary = "", warning = "llm-disabled" });

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(historyJson))
        {
            try
            {
                using var hd = JsonDocument.Parse(historyJson);
                foreach (var t in hd.RootElement.EnumerateArray())
                {
                    string role = t.TryGetProperty("role", out var r) ? r.GetString() ?? "user" : "user";
                    string content = t.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(content)) messages.Add(new { role, content });
                }
            }
            catch { }
        }
        if (messages.Count == 0)
            return JsonSerializer.Serialize(new { summary = "", warning = "empty-history" });

        string system = COMPACT_SYSTEM_PROMPT;
        if (!string.IsNullOrWhiteSpace(previousSummary))
            system += "\n\nRIASSUNTO PRECEDENTE (i turn sopra sono successivi a questo summary; "
                    + "merge-a entrambi mantenendo la coerenza cronologica):\n" + previousSummary.Trim();
        // chiusura esplicita: niente tool_use nel compact
        messages.Add(new { role = "user", content = "Produci ora il riassunto della conversazione qui sopra, seguendo le regole del system prompt." });

        try
        {
            Dictionary<string, object> body;
            if (IsOpenAiCompat(provider))
            {
                var oaiMsgs = new List<object> { new { role = "system", content = system } };
                foreach (var m in messages) oaiMsgs.Add(m);
                body = new Dictionary<string, object> { ["model"] = model, ["max_tokens"] = 5000, ["messages"] = oaiMsgs };
            }
            else
            {
                body = new Dictionary<string, object> { ["model"] = model, ["max_tokens"] = 5000, ["system"] = system, ["messages"] = messages };
            }
            var (statusCode, respBody) = PostLlmWithRetry(provider, baseUrl, JsonSerializer.Serialize(body), apiKey);
            if (statusCode < 200 || statusCode >= 300)
                return JsonSerializer.Serialize(new { summary = "", warning = $"LLM call failed (HTTP {statusCode})" });
            using var doc = JsonDocument.Parse(respBody);
            var root = doc.RootElement;
            var summary = new System.Text.StringBuilder();
            if (root.TryGetProperty("content", out var blocks) && blocks.ValueKind == JsonValueKind.Array)
                foreach (var b in blocks.EnumerateArray())
                    if (b.TryGetProperty("type", out var ty) && ty.GetString() == "text" && b.TryGetProperty("text", out var tx))
                        summary.Append(tx.GetString());
            int? tin = null, tout = null;
            if (root.TryGetProperty("usage", out var u))
            {
                if (u.TryGetProperty("input_tokens", out var it)) tin = it.GetInt32();
                if (u.TryGetProperty("output_tokens", out var ot)) tout = ot.GetInt32();
            }
            return JsonSerializer.Serialize(new { summary = summary.ToString().Trim(), tokens_in = tin, tokens_out = tout });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { summary = "", warning = $"Anthropic call failed: {ex.GetType().Name}" });
        }
    }

    /// <summary>
    /// Chat AGENTICA RAG + Claude (drop-in di /api/rag/chat del rag_server.py): retrieval +
    /// tool-use (propose_*, designer_inject, remember/forget_fact, suggest_followups) +
    /// injection di route_context/context_summary/memory_facts nel system prompt.
    /// `historyJson` = [{role,content}]. Se `apiKey` vuota -> retrieval-only.
    /// Ritorna il JSON del contratto ChatOut (mode/answer/sources/proposed_action_json/
    /// proposed_memory_changes/followup_questions/tokens/context_*).
    /// </summary>
    public string ChatJson(string query, int topK, string model, string apiKey,
        string? historyJson, string? routeContext, string? contextSummary, string? memoryFacts,
        string? profile, string? provider = null, string? baseUrl = null,
        Func<string, string>? metadataResolver = null)
    {
        bool oaiProvider = IsOpenAiCompat(provider);
        int contextWindowMax = ContextWindow(model);
        // Over-fetch -> dedup doc-locale -> drop AI-internal -> (release) redact -> slice topK.
        var srcs = BuildSources(query, topK, EffectiveProfile(profile));
        int rk = 1;
        var sources = srcs.Select(s => ToDto(s.hit, rk++, s.snippet)).ToList();

        if (string.IsNullOrWhiteSpace(apiKey))
            return JsonSerializer.Serialize(new ChatOutDto
            {
                Mode = "retrieval-only", Sources = sources,
                Warning = "ANTHROPIC_API_KEY non impostata sull'engine .NET; LLM disabilitato, solo retrieval.",
                ContextWindowMax = contextWindowMax,
            });

        // ---- system prompt ----
        // CONTESTO codebase: snippet troncati a 500 char (come ToDto/QueryJson). I 1500-char
        // pieni distraevano l'LLM dal tool_use (osservato empiricamente: con snippet 1500 il
        // propose_metadata_column_create NON veniva emesso 0/3; con snippet 500 emette 3/3,
        // confermato A/B via Anthropic diretto). Il grounding del contesto AIUTA l'emit (dare
        // il pattern concreto), e' la LUNGHEZZA eccessiva che disturba -> cap a 500.
        var ctx = new System.Text.StringBuilder();
        foreach (var s in srcs)
        {
            var h = s.hit;
            string header = string.IsNullOrEmpty(h.SymbolName) ? $"[{h.RelPath}]" : $"[{h.RelPath}::{h.SymbolName}]";
            string snip = s.snippet.Length > 500 ? s.snippet.Substring(0, 500) : s.snippet;
            ctx.Append(header).Append('\n').Append(snip).Append("\n\n");
        }
        var system = new System.Text.StringBuilder($"{SYSTEM_PROMPT}\n\nCONTESTO:\n{ctx}");
        if (!string.IsNullOrWhiteSpace(routeContext))
        {
            system.Append("\n\nCONTESTO PAGINA UTENTE:\n")
                .Append(routeContext.Trim()).Append('\n')
                .Append("ISTRUZIONE PRIORITARIA — AZIONI SULLA PAGINA: se l'utente chiede di CREARE / AGGIUNGERE / MODIFICARE / IMPOSTARE / COLORARE / APPLICARE qualcosa sulla pagina corrente (toolbar action, row action, colonna o colonna calcolata, stile riga/colonna, formula di display o titolo, callback default-value/validazione/selezione/lifecycle, pagesize o altro metadato semplice, SQL metadata field, ecc.), DEVI emettere il corrispondente tool `propose_*` con i parametri corretti. NON limitarti a spiegare, descrivere o mostrare il codice: l'azione va PROPOSTA via tool_use. Il CONTESTO codebase sopra serve solo a scrivere snippet/parametri corretti e NON deve MAI impedirti di emettere il tool d'azione.\n")
                .Append("RETRIEVAL DINAMICO DEI METADATA (OBBLIGATORIO quando servono nomi reali): il CONTESTO PAGINA qui sopra puo' contenere SOLO la route/pagina corrente (es. `cities/list`), SENZA l'elenco colonne. NON inventare MAI nomi di colonna, identita' SQL (schema/tabella) o dettagli di un lookup (alias di join, colonne correlate). Se ti servono e non sono nel contesto, chiama PRIMA il tool `request_metadata_detail`:\n")
                .Append("  - `request_metadata_detail{detail:'columns', route:'<route>'}` per ottenere l'elenco colonne reali + l'identita' SQL (schema/tabella + full qualifier) della route;\n")
                .Append("  - `request_metadata_detail{detail:'lookup_columns', route:'<route>', column:'<col>'}` per l'alias di join reale e le colonne della tabella correlata di una colonna lookupByID.\n")
                .Append("Attendi il tool_result, POI emetti il `propose_*` usando i valori ottenuti. Puoi chiamarlo piu' volte (es. prima `columns`, poi `lookup_columns`).\n")
                .Append("REGOLE:\n")
                .Append("1. Usa SEMPRE i NOMI REALI delle colonne (da contesto o da `request_metadata_detail`), es. `record.<nome>.value` / `record.<nome>.next(...)`. Mai placeholder inventati.\n")
                .Append("2. Per i tool `propose_*`: se l'utente NON menziona esplicitamente una route diversa, il parametro `route` DEVE essere la route della pagina corrente.\n")
                .Append("3. Per i tool che richiedono `column_name`: scegli il `mc_nome_colonna` REALE corrispondente (dal contesto o da `request_metadata_detail{detail:'columns'}`).\n")
                .Append("4. Per snippet SQL (computed_formula / sql_metadata_field): usa il full qualifier e, per i lookup, l'alias di join, entrambi ottenuti da `request_metadata_detail`. Non dedurli a mano.");
        }
        if (!string.IsNullOrWhiteSpace(contextSummary))
            system.Append("\n\nSUMMARY SESSIONE (turn precedenti riassunti):\n").Append(contextSummary.Trim()).Append('\n')
                .Append("Usa questo summary come contesto storico ma cita SOLO sources nuovi del retrieval.");
        if (!string.IsNullOrWhiteSpace(memoryFacts))
            system.Append("\n\nMEMORY FACTS (decisioni/preferenze pinnate via remember_fact):\n").Append(memoryFacts.Trim()).Append('\n')
                .Append("Rispetta SEMPRE questi fatti. Usa `forget_fact(id)` se l'utente li contraddice esplicitamente o se sono diventati obsoleti.");

        // ---- messages ----
        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(historyJson))
        {
            try
            {
                using var hd = JsonDocument.Parse(historyJson);
                foreach (var t in hd.RootElement.EnumerateArray())
                {
                    string role = t.TryGetProperty("role", out var r) ? r.GetString() ?? "user" : "user";
                    string content = t.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(content)) messages.Add(new { role, content });
                }
            }
            catch { }
        }
        messages.Add(new { role = "user", content = query });

        // ---- Claude call con tools ----
        try
        {
            using var toolsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(_toolsJson) ? "[]" : _toolsJson);

            // ROBUSTEZZA AZIONI: per una RICHIESTA D'AZIONE (route_context presente + verbo
            // d'azione, non una domanda) FORZIAMO l'emissione del tool via tool_choice:any sui
            // soli tool propose_*. Senza questo, l'emissione del proposed_action e' solo
            // PROBABILISTICA: a temp=0 con system identico haiku resta "sul filo" tra tool_use e
            // risposta testuale (osservato empiricamente 1/5..4/4 a parita' di richiesta), perche'
            // temp=0 NON e' deterministico lato Anthropic su decisioni borderline. Forzando
            // tool_choice:any l'azione e' GARANTITA. Per le domande/Q&A restiamo su auto (l'LLM
            // puo' e DEVE poter rispondere a testo). Filtriamo ai propose_* per evitare che il
            // forcing scelga un tool non-azione (remember_fact/forget_fact/suggest_followups).
            bool actionIntent = !string.IsNullOrWhiteSpace(routeContext) && LooksLikeActionRequest(query);
            // Elementi tool da inviare: se actionIntent filtra ai soli propose_*.
            var toolSource = new List<JsonElement>();
            foreach (var t in toolsDoc.RootElement.EnumerateArray())
            {
                string tn = t.TryGetProperty("name", out var nmEl) ? nmEl.GetString() ?? "" : "";
                // Sotto actionIntent forziamo i propose_*, ma TENIAMO SEMPRE request_metadata_detail:
                // e' il tool di retrieval agentico (non-terminale) che il model puo' chiamare PRIMA
                // del propose_* per recuperare dettagli metadata mancanti (es. alias di join lookup).
                if (actionIntent && !tn.StartsWith("propose_", StringComparison.Ordinal)
                    && tn != "request_metadata_detail") continue;
                toolSource.Add(t.Clone());
            }
            if (actionIntent && toolSource.Count == 0)
                foreach (var t in toolsDoc.RootElement.EnumerateArray()) toolSource.Add(t.Clone());

            Dictionary<string, object> body;
            if (oaiProvider)
            {
                // ---- body OpenAI-compatible (openai / openrouter) ----
                // system come primo message; tool tradotti in {type:function, function:{name,description,parameters}};
                // tool_choice:"required" per forzare l'azione (equivalente Anthropic {type:any}).
                var oaiMessages = new List<object> { new { role = "system", content = system.ToString() } };
                foreach (var m in messages) oaiMessages.Add(m);
                var oaiTools = new List<object>();
                foreach (var t in toolSource)
                {
                    string tn = t.TryGetProperty("name", out var nm2) ? nm2.GetString() ?? "" : "";
                    string td = t.TryGetProperty("description", out var d2) ? d2.GetString() ?? "" : "";
                    object parameters = t.TryGetProperty("input_schema", out var ps)
                        ? (object)ps.Clone() : new Dictionary<string, object> { ["type"] = "object" };
                    oaiTools.Add(new { type = "function", function = new { name = tn, description = td, parameters } });
                }
                body = new Dictionary<string, object>
                {
                    ["model"] = model,
                    ["max_tokens"] = 2048,
                    ["temperature"] = TemperatureCfg(),
                    ["messages"] = oaiMessages,
                    ["tools"] = oaiTools,
                };
                if (actionIntent) body["tool_choice"] = "required";
            }
            else
            {
                // ---- body Anthropic (invariato) ----
                body = new Dictionary<string, object>
                {
                    ["model"] = model,
                    ["max_tokens"] = 2048,
                    // temperature=0: piu' focus, meno allucinazioni nelle risposte Q&A RAG.
                    ["temperature"] = TemperatureCfg(),
                    ["system"] = system.ToString(),
                    ["messages"] = messages,
                    ["tools"] = toolSource,
                };
                if (actionIntent) body["tool_choice"] = new Dictionary<string, object> { ["type"] = "any" };
            }
            string bodyJson = JsonSerializer.Serialize(body);
            string? dumpPath = Environment.GetEnvironmentVariable("WUIC_RAG_DEBUG_BODY");
            if (!string.IsNullOrWhiteSpace(dumpPath))
            {
                try { File.WriteAllText(dumpPath, bodyJson); } catch { }
            }
            // RETRIEVAL AGENTICO (tool-loop multi-turn): il model puo' chiamare il tool
            // non-terminale `request_metadata_detail` per ottenere dettagli metadata MANCANTI nel
            // contesto pagina (es. l'alias di join reale di una colonna lookup) PRIMA di emettere il
            // propose_*. La richiesta viene risolta via `metadataResolver` (callback verso il
            // framework: l'engine NON ha accesso al DB metadata); iniettiamo assistant(tool_use) +
            // tool_result nei messages e ri-chiamiamo l'LLM. Cosi' il CONTESTO PAGINA resta lean —
            // niente bloat a prescindere dal prompt: si recupera SOLO cio' che il prompt richiede.
            // Cap a MAX_RETRIEVAL_TURNS per evitare loop. Quando il model emette un propose_* (o
            // testo) si esce e si procede col parsing esistente.
            const int MAX_RETRIEVAL_TURNS = 3;
            int retrievalTurns = 0;
            int statusCode; string respBody;
            while (true)
            {
                // Retry/backoff su 429 (rate limit) / 529 (overloaded) / 503: senza retry un 429
                // transitorio fa degradare la chiamata a retrieval-only e l'utente NON riceve
                // l'azione proposta (osservato: con chiamate ravvicinate l'API risponde 429 e il
                // proposed_action_json risultava null pur essendo l'emissione del tool corretta).
                (statusCode, respBody) = PostLlmWithRetry(provider, baseUrl, bodyJson, apiKey);
                // Compat PARAMETRI per i modelli che rifiutano alcuni parametri (gpt-5 / o-series /
                // claude extended-thinking): rispondono 400 con un parametro non supportato alla volta.
                // Applichiamo un fix per giro (max 3) e ri-mandiamo, senza deny-list da mantenere:
                //   - `temperature` deprecata/non supportata (solo default) -> rimuovi
                //   - `max_tokens` non supportato (gpt-5/o-series vogliono `max_completion_tokens`) -> rinomina
                // Solo al PRIMO giro: i parametri sono stabili tra i turni di retrieval, e dal 2o giro
                // `body` (il dict originale) non riflette piu' i messages appesi -> riserializzarlo
                // perderebbe i tool_result. Un'eventuale incompatibilita' parametri emerge al 1o POST.
                for (int paramFix = 0; paramFix < 3 && statusCode == 400 && retrievalTurns == 0; paramFix++)
                {
                    bool changed = false;
                    if (respBody.Contains("temperature")
                        && (respBody.Contains("deprecated") || respBody.Contains("unsupported")
                            || respBody.Contains("not support") || respBody.Contains("does not support")
                            || respBody.Contains("Only the default"))
                        && body.Remove("temperature"))
                    {
                        changed = true;
                    }
                    else if (respBody.Contains("max_tokens") && respBody.Contains("max_completion_tokens")
                             && body.Remove("max_tokens", out var maxTok))
                    {
                        body["max_completion_tokens"] = maxTok;
                        changed = true;
                    }
                    if (!changed) break;
                    bodyJson = JsonSerializer.Serialize(body);
                    (statusCode, respBody) = PostLlmWithRetry(provider, baseUrl, bodyJson, apiKey);
                }
                if (statusCode < 200 || statusCode >= 300)
                {
                    bool overflow = respBody.Contains("prompt is too long") || respBody.Contains("context window");
                    return JsonSerializer.Serialize(new ChatOutDto
                    {
                        Mode = "retrieval-only", Sources = sources, Model = model,
                        Warning = overflow ? "context-overflow" : $"LLM call failed (HTTP {statusCode}) dopo retry; degraded to retrieval-only",
                        ContextWindowMax = contextWindowMax,
                    });
                }
                // Il model ha chiesto un dettaglio metadata? Risolvilo e continua il loop.
                if (metadataResolver != null && retrievalTurns < MAX_RETRIEVAL_TURNS)
                {
                    var (hasReq, reqId, reqInputRaw) = TryExtractRetrievalRequest(respBody);
                    if (hasReq)
                    {
                        string resolved = SafeResolveMetadata(metadataResolver, reqInputRaw);
                        bodyJson = AppendRetrievalTurn(bodyJson, oaiProvider, reqId, reqInputRaw, resolved, retrievalTurns);
                        retrievalTurns++;
                        if (!string.IsNullOrWhiteSpace(dumpPath)) { try { File.WriteAllText(dumpPath, bodyJson); } catch { } }
                        continue;
                    }
                }
                break;
            }

            // ---- parsing: text + tool_use ----
            using var doc = JsonDocument.Parse(respBody);
            var root = doc.RootElement;
            var answer = new System.Text.StringBuilder();
            string? proposedActionJson = null;
            // Cattura del tool d'azione scelto (nome/kind/input raw) invece di costruire subito
            // la proposed_action: serve al post-processing robustezza-campi (#1 route backfill
            // deterministico + #2 retry singolo) per mergiare i campi MANCANTI in modo
            // NON-DISTRUTTIVO (mai sovrascrivere quelli gia' popolati dal model).
            string? chosenActionName = null, chosenActionKind = null, chosenActionInputRaw = null;
            var memoryChanges = new List<object>();
            List<string>? followups = null;

            if (root.TryGetProperty("content", out var blocks) && blocks.ValueKind == JsonValueKind.Array)
            {
                foreach (var b in blocks.EnumerateArray())
                {
                    string btype = b.TryGetProperty("type", out var ty) ? ty.GetString() ?? "" : "";
                    if (btype == "text")
                    {
                        if (b.TryGetProperty("text", out var tx)) answer.Append(tx.GetString());
                        continue;
                    }
                    if (btype != "tool_use") continue;
                    string name = b.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "";
                    JsonElement input = b.TryGetProperty("input", out var inp) && inp.ValueKind == JsonValueKind.Object
                        ? inp : default;

                    if (s_actionToolToKind.TryGetValue(name, out var kind))
                    {
                        if (chosenActionName == null && input.ValueKind == JsonValueKind.Object)
                        {
                            chosenActionName = name;
                            chosenActionKind = kind;
                            chosenActionInputRaw = input.GetRawText();
                        }
                    }
                    else if (name == "remember_fact" && input.ValueKind == JsonValueKind.Object)
                    {
                        string fact = input.TryGetProperty("fact", out var f) ? (f.GetString() ?? "").Trim() : "";
                        if (fact.Length > 0) memoryChanges.Add(new { op = "add", fact = fact.Length > 200 ? fact.Substring(0, 200) : fact });
                    }
                    else if (name == "forget_fact" && input.ValueKind == JsonValueKind.Object)
                    {
                        if (input.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number && idEl.TryGetInt32(out var fid) && fid > 0)
                            memoryChanges.Add(new { op = "remove", id = fid });
                    }
                    else if (name == "suggest_followups" && followups == null && input.ValueKind == JsonValueKind.Object)
                    {
                        if (input.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array)
                        {
                            var cleaned = new List<string>();
                            foreach (var q in qs.EnumerateArray())
                            {
                                string s = (q.GetString() ?? "").Trim();
                                if (s.Length > 0) cleaned.Add(s.Length > 80 ? s.Substring(0, 80) : s);
                                if (cleaned.Count >= 3) break;
                            }
                            if (cleaned.Count > 0) followups = cleaned;
                        }
                    }
                }
            }

            // ---- ROBUSTEZZA CAMPI PROPOSED_ACTION (#1 route backfill + #2 retry su required vuoti) ----
            // NON-DISTRUTTIVO: tocchiamo SOLO i campi lasciati vuoti dal model, mai i popolati.
            if (chosenActionName != null && chosenActionKind != null && chosenActionInputRaw != null)
            {
                var merged = System.Text.Json.Nodes.JsonNode.Parse(chosenActionInputRaw)!.AsObject();
                // #1 — route DETERMINISTICO (= pagina corrente, nel routeContext): se vuoto/mancante
                // lo iniettiamo; se il model l'ha gia' messo lo rispettiamo.
                string ctxRoute = ExtractRouteFromContext(routeContext);
                if (FieldIsEmpty(merged, "route") && !string.IsNullOrEmpty(ctxRoute))
                    merged["route"] = ctxRoute;
                // #2 — campi required ANCORA vuoti (escluso route gia' gestito e rationale non
                // critico): UN secondo tentativo con nudge esplicito, merge SOLO dei mancanti.
                var missing = new List<string>();
                foreach (var f in RequiredStringFieldsForTool(toolSource, chosenActionName))
                    if (f != "route" && f != "rationale" && FieldIsEmpty(merged, f)) missing.Add(f);
                if (missing.Count > 0)
                {
                    try
                    {
                        var retryBody = System.Text.Json.Nodes.JsonNode.Parse(bodyJson)!.AsObject();
                        if (retryBody["messages"] is System.Text.Json.Nodes.JsonArray rmsgs)
                            rmsgs.Add(new System.Text.Json.Nodes.JsonObject {
                                ["role"] = "user",
                                ["content"] = $"Richiama lo stesso tool ma COMPILA TUTTI i campi obbligatori (nessuno vuoto). Campi mancanti da valorizzare: {string.Join(", ", missing)}."
                            });
                        var (rs, rb) = PostLlmWithRetry(provider, baseUrl, retryBody.ToJsonString(), apiKey);
                        if (rs >= 200 && rs < 300)
                        {
                            var retryInput = ExtractToolInput(rb, chosenActionName);
                            if (retryInput != null)
                                foreach (var f in missing)
                                    if (!FieldIsEmpty(retryInput, f))
                                        merged[f] = retryInput[f]!.DeepClone();
                        }
                    }
                    catch { /* best-effort: teniamo quel che il primo tentativo ha prodotto */ }
                }
                using var mergedDoc = JsonDocument.Parse(merged.ToJsonString());
                proposedActionJson = BuildProposedAction(chosenActionKind, mergedDoc.RootElement);
            }

            int? tin = null, tout = null;
            if (root.TryGetProperty("usage", out var u))
            {
                if (u.TryGetProperty("input_tokens", out var it)) tin = it.GetInt32();
                if (u.TryGetProperty("output_tokens", out var ot)) tout = ot.GetInt32();
            }
            return JsonSerializer.Serialize(new ChatOutDto
            {
                Mode = "rag-llm", Answer = answer.ToString(), Sources = sources, Model = model,
                TokensIn = tin, TokensOut = tout,
                ProposedActionJson = proposedActionJson,
                ProposedMemoryChanges = memoryChanges.Count > 0 ? memoryChanges : null,
                FollowupQuestions = followups,
                ContextWindowMax = contextWindowMax,
                ContextUsed = tin,
            });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new ChatOutDto
            {
                Mode = "retrieval-only", Sources = sources, Model = model,
                Warning = $"Anthropic call exception ({ex.GetType().Name}); degraded to retrieval-only",
                ContextWindowMax = contextWindowMax,
            });
        }
    }

    // ---- mapping tool -> kind (verbatim da rag_server) ----
    private static readonly Dictionary<string, string> s_actionToolToKind = new(StringComparer.Ordinal)
    {
        ["propose_toolbar_action"] = "toolbar_action",
        ["propose_row_action"] = "row_action",
        ["propose_table_style"] = "table_style",
        ["propose_column_style"] = "column_style",
        ["propose_display_formula"] = "display_formula",
        ["propose_form_title_formula"] = "form_title_formula",
        ["propose_default_value_callback"] = "default_value_callback",
        ["propose_custom_validation"] = "custom_validation",
        ["propose_selection_changed"] = "selection_changed",
        ["propose_lifecycle_callback"] = "lifecycle_callback",
        ["propose_simple_metadata_update"] = "simple_metadata_update",
        ["propose_designer_inject"] = "designer_inject",
        ["propose_sql_metadata_field"] = "sql_metadata_field",
        ["propose_metadata_column_create"] = "metadata_column_create",
    };
    private static readonly string[] s_sanitizeTextFields = { "rationale", "label", "description" };
    private static readonly System.Text.RegularExpressions.Regex s_callbackHeadRe = new(
        @"^\s*(?:(?:async\s+)?function\b\s*(?:[A-Za-z_$][\w$]*\s*)?\([^)]*\)\s*\{|(?:async\s+)?\([^)]*\)\s*=>\s*\{)",
        System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.Compiled);
    private static readonly System.Text.RegularExpressions.Regex s_xmlResidueRe = new(
        @"</?[A-Za-z_][A-Za-z0-9_:.-]*(\s+[^>]*)?/?>",
        System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>{"kind":..., ...tool_input} con unwrap callback_js/condition_js + sanitize NL fields.</summary>
    internal static bool IsOpenAiCompat(string? provider)
        => provider != null && (provider.Equals("openai", StringComparison.OrdinalIgnoreCase)
            || provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase));

    /// <summary>Base URL del provider: override esplicito, altrimenti default per provider.</summary>
    internal static string ResolveBaseUrl(string? provider, string? baseUrl)
    {
        if (!string.IsNullOrWhiteSpace(baseUrl)) return baseUrl!.TrimEnd('/');
        if (provider != null && provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase)) return "https://openrouter.ai/api/v1";
        if (provider != null && provider.Equals("openai", StringComparison.OrdinalIgnoreCase)) return "https://api.openai.com/v1";
        return "https://api.anthropic.com";
    }

    /// <summary>POST all'LLM con retry+backoff su 429/529/503. Provider-aware:
    /// anthropic -> /v1/messages (x-api-key); openai/openrouter -> /chat/completions
    /// (Authorization Bearer) con risposta NORMALIZZATA alla shape Anthropic
    /// (content[].text + content[].tool_use + usage.input/output_tokens) cosi' il parser
    /// di ChatJson resta identico. Ritorna (httpStatus, responseBody) — il body di SUCCESSO
    /// e' sempre shape-Anthropic; i body di ERRORE restano raw (per la fallback temperature).</summary>
    private static (int status, string body) PostLlmWithRetry(string? provider, string? baseUrl, string bodyJson, string apiKey)
    {
        bool oai = IsOpenAiCompat(provider);
        string url = oai ? (ResolveBaseUrl(provider, baseUrl) + "/chat/completions") : "https://api.anthropic.com/v1/messages";
        int maxAttempts = RetryCfg();
        int status = 0; string respBody = "";
        for (int attempt = 0; attempt < maxAttempts; attempt++)
        {
            using var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, url);
            if (oai) { req.Headers.Add("Authorization", "Bearer " + apiKey); }
            else { req.Headers.Add("x-api-key", apiKey); req.Headers.Add("anthropic-version", "2023-06-01"); }
            req.Content = new System.Net.Http.StringContent(bodyJson, System.Text.Encoding.UTF8, "application/json");
            double retryAfter = -1;
            try
            {
                using var resp = s_http.Send(req);
                status = (int)resp.StatusCode;
                respBody = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (status != 429 && status != 529 && status != 503)
                {
                    if (oai && status >= 200 && status < 300) respBody = NormalizeOpenAiToAnthropic(respBody);
                    return (status, respBody);
                }
                if (resp.Headers.TryGetValues("retry-after", out var ra))
                {
                    var v = System.Linq.Enumerable.FirstOrDefault(ra);
                    if (v != null && double.TryParse(v, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var rs)) retryAfter = rs;
                }
            }
            catch (Exception ex)
            {
                status = 0; respBody = ex.Message; // errore di rete -> retry
            }
            if (attempt == maxAttempts - 1)
            {
                if (oai && status >= 200 && status < 300) respBody = NormalizeOpenAiToAnthropic(respBody);
                return (status, respBody);
            }
            double delaySec = retryAfter > 0 ? retryAfter : Math.Min(20, Math.Pow(2, attempt) * 2);
            System.Threading.Thread.Sleep((int)(delaySec * 1000));
        }
        return (status, respBody);
    }

    /// <summary>Trasforma una risposta OpenAI chat-completions nella shape Anthropic
    /// (content[].text / content[].tool_use{name,input} + usage) attesa dal parser.</summary>
    private static string NormalizeOpenAiToAnthropic(string openaiResp)
    {
        try
        {
            using var doc = JsonDocument.Parse(openaiResp);
            var root = doc.RootElement;
            var content = new List<object>();
            int tin = 0, tout = 0;
            if (root.TryGetProperty("usage", out var u))
            {
                if (u.TryGetProperty("prompt_tokens", out var pt) && pt.ValueKind == JsonValueKind.Number) tin = pt.GetInt32();
                if (u.TryGetProperty("completion_tokens", out var ct) && ct.ValueKind == JsonValueKind.Number) tout = ct.GetInt32();
            }
            if (root.TryGetProperty("choices", out var ch) && ch.ValueKind == JsonValueKind.Array && ch.GetArrayLength() > 0
                && ch[0].TryGetProperty("message", out var msg))
            {
                if (msg.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String)
                {
                    string txt = c.GetString() ?? "";
                    if (txt.Length > 0) content.Add(new { type = "text", text = txt });
                }
                if (msg.TryGetProperty("tool_calls", out var tc) && tc.ValueKind == JsonValueKind.Array)
                {
                    foreach (var call in tc.EnumerateArray())
                    {
                        if (!call.TryGetProperty("function", out var fn)) continue;
                        string name = fn.TryGetProperty("name", out var nm) ? (nm.GetString() ?? "") : "";
                        string args = fn.TryGetProperty("arguments", out var a) && a.ValueKind == JsonValueKind.String ? (a.GetString() ?? "{}") : "{}";
                        object input;
                        try { using var ad = JsonDocument.Parse(string.IsNullOrWhiteSpace(args) ? "{}" : args); input = ad.RootElement.Clone(); }
                        catch { input = new Dictionary<string, object>(); }
                        content.Add(new { type = "tool_use", name, input });
                    }
                }
            }
            return JsonSerializer.Serialize(new { content, usage = new { input_tokens = tin, output_tokens = tout } });
        }
        catch { return openaiResp; }
    }

    /// <summary>Cerca nella risposta (shape-Anthropic) un tool_use `request_metadata_detail`.
    /// Ritorna (trovato, id-del-tool_use-o-null, input-raw-json). Per il path OpenAI normalizzato
    /// l'id non e' preservato (null) -> il chiamante ne sintetizza uno consistente per il re-POST.</summary>
    private static (bool has, string? id, string inputRaw) TryExtractRetrievalRequest(string respBody)
    {
        try
        {
            using var doc = JsonDocument.Parse(respBody);
            if (doc.RootElement.TryGetProperty("content", out var blocks) && blocks.ValueKind == JsonValueKind.Array)
            {
                foreach (var b in blocks.EnumerateArray())
                {
                    if ((b.TryGetProperty("type", out var ty) ? ty.GetString() : "") != "tool_use") continue;
                    if ((b.TryGetProperty("name", out var nm) ? nm.GetString() : "") != "request_metadata_detail") continue;
                    string? id = b.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String ? idEl.GetString() : null;
                    string inputRaw = b.TryGetProperty("input", out var inp) && inp.ValueKind == JsonValueKind.Object ? inp.GetRawText() : "{}";
                    return (true, id, inputRaw);
                }
            }
        }
        catch { }
        return (false, null, "{}");
    }

    /// <summary>Invoca il resolver del framework in modo sicuro: qualunque eccezione/empty diventa
    /// un tool_result JSON di errore (il model puo' gestirlo o ripiegare), mai un crash dell'engine.</summary>
    private static string SafeResolveMetadata(Func<string, string> resolver, string inputRaw)
    {
        try
        {
            string r = resolver(inputRaw);
            return string.IsNullOrWhiteSpace(r)
                ? "{\"error\":\"empty_resolver_result\"}"
                : r;
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = "resolver_failed", detail = ex.Message });
        }
    }

    /// <summary>Appende al body (parsato dal bodyJson corrente) il turno di retrieval:
    /// assistant(tool_use request_metadata_detail) + tool_result con il JSON risolto. Shape-aware:
    /// Anthropic -> content[] con tool_use/tool_result; OpenAI -> assistant.tool_calls + role=tool.
    /// Per OpenAI l'id del tool_call e' sintetizzato (l'id originale e' perso nella normalizzazione),
    /// ma e' consistente tra assistant.tool_calls[].id e tool.tool_call_id (l'unico vincolo OAI).</summary>
    private static string AppendRetrievalTurn(string bodyJson, bool oai, string? reqId, string inputRaw, string resolved, int turn)
    {
        var bodyNode = System.Text.Json.Nodes.JsonNode.Parse(bodyJson)!.AsObject();
        var msgs = bodyNode["messages"]!.AsArray();
        string callId = !string.IsNullOrEmpty(reqId) ? reqId! : ("wuic_call_" + turn.ToString(System.Globalization.CultureInfo.InvariantCulture));
        System.Text.Json.Nodes.JsonNode inputNode;
        try { inputNode = System.Text.Json.Nodes.JsonNode.Parse(string.IsNullOrWhiteSpace(inputRaw) ? "{}" : inputRaw)!; }
        catch { inputNode = new System.Text.Json.Nodes.JsonObject(); }

        if (oai)
        {
            msgs.Add(new System.Text.Json.Nodes.JsonObject
            {
                ["role"] = "assistant",
                ["tool_calls"] = new System.Text.Json.Nodes.JsonArray(
                    new System.Text.Json.Nodes.JsonObject
                    {
                        ["id"] = callId,
                        ["type"] = "function",
                        ["function"] = new System.Text.Json.Nodes.JsonObject
                        {
                            ["name"] = "request_metadata_detail",
                            ["arguments"] = inputNode.ToJsonString(),
                        },
                    }),
            });
            msgs.Add(new System.Text.Json.Nodes.JsonObject
            {
                ["role"] = "tool",
                ["tool_call_id"] = callId,
                ["content"] = resolved,
            });
        }
        else
        {
            msgs.Add(new System.Text.Json.Nodes.JsonObject
            {
                ["role"] = "assistant",
                ["content"] = new System.Text.Json.Nodes.JsonArray(
                    new System.Text.Json.Nodes.JsonObject
                    {
                        ["type"] = "tool_use",
                        ["id"] = callId,
                        ["name"] = "request_metadata_detail",
                        ["input"] = inputNode,
                    }),
            });
            msgs.Add(new System.Text.Json.Nodes.JsonObject
            {
                ["role"] = "user",
                ["content"] = new System.Text.Json.Nodes.JsonArray(
                    new System.Text.Json.Nodes.JsonObject
                    {
                        ["type"] = "tool_result",
                        ["tool_use_id"] = callId,
                        ["content"] = resolved,
                    }),
            });
        }
        return bodyNode.ToJsonString();
    }

    /// <summary>Numero massimo di tentativi della chiamata Anthropic (default 4), override via env.</summary>
    private static int RetryCfg()
    {
        string? raw = Environment.GetEnvironmentVariable("WUIC_RAG_MAX_RETRIES");
        if (!string.IsNullOrWhiteSpace(raw) && int.TryParse(raw, out var n) && n >= 1 && n <= 10) return n;
        return 4;
    }

    /// <summary>Temperature per la chat: default 0 (emissione tool deterministica), override via env.</summary>
    private static double TemperatureCfg()
    {
        string? raw = Environment.GetEnvironmentVariable("WUIC_RAG_TEMPERATURE");
        if (!string.IsNullOrWhiteSpace(raw) &&
            double.TryParse(raw, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var t) &&
            t >= 0 && t <= 1)
            return t;
        return 0.0;
    }

    private static string BuildProposedAction(string kind, JsonElement input)
    {
        var map = new Dictionary<string, object> { ["kind"] = kind };
        foreach (var p in input.EnumerateObject())
        {
            if ((p.Name == "callback_js" || p.Name == "condition_js") && p.Value.ValueKind == JsonValueKind.String)
                map[p.Name] = UnwrapCallbackBody(p.Value.GetString() ?? "");
            else if (Array.IndexOf(s_sanitizeTextFields, p.Name) >= 0 && p.Value.ValueKind == JsonValueKind.String)
                map[p.Name] = StripXmlResidue(p.Value.GetString() ?? "");
            else
                map[p.Name] = p.Value.Clone();
        }
        return JsonSerializer.Serialize(map);
    }

    /// <summary>Estrae il nome route dal routeContext (formato "route: cities | ...").
    /// Vuoto se non presente. Case-insensitive, accetta ':' o '='.</summary>
    private static string ExtractRouteFromContext(string? routeContext)
    {
        if (string.IsNullOrWhiteSpace(routeContext)) return "";
        var m = System.Text.RegularExpressions.Regex.Match(routeContext,
            @"route\s*[:=]\s*([^\s|,;\r\n]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.Trim() : "";
    }

    /// <summary>True se il campo manca, e' null, o e' una stringa vuota/whitespace.
    /// Valori non-stringa presenti (number/bool/object/array) NON sono "empty".</summary>
    private static bool FieldIsEmpty(System.Text.Json.Nodes.JsonObject o, string field)
    {
        if (!o.TryGetPropertyValue(field, out var v) || v == null) return true;
        var k = v.GetValueKind();
        if (k == JsonValueKind.Null) return true;
        if (k == JsonValueKind.String) return string.IsNullOrWhiteSpace(v.GetValue<string>());
        return false;
    }

    /// <summary>Lista dei campi `required` (solo stringhe) dell'input_schema del tool indicato.</summary>
    private static List<string> RequiredStringFieldsForTool(List<JsonElement> toolSource, string toolName)
    {
        var res = new List<string>();
        foreach (var t in toolSource)
        {
            if (!(t.TryGetProperty("name", out var nm) && nm.GetString() == toolName)) continue;
            if (t.TryGetProperty("input_schema", out var sch)
                && sch.TryGetProperty("required", out var req) && req.ValueKind == JsonValueKind.Array)
                foreach (var r in req.EnumerateArray())
                    if (r.ValueKind == JsonValueKind.String) res.Add(r.GetString()!);
            break;
        }
        return res;
    }

    /// <summary>Estrae l'`input` del tool_use con nome dato da una risposta gia' normalizzata
    /// alla shape Anthropic (content[].tool_use). Null se assente/non parsabile.</summary>
    private static System.Text.Json.Nodes.JsonObject? ExtractToolInput(string respBody, string toolName)
    {
        try
        {
            var content = System.Text.Json.Nodes.JsonNode.Parse(respBody)?["content"]?.AsArray();
            if (content == null) return null;
            foreach (var b in content)
            {
                if ((string?)b?["type"] != "tool_use" || (string?)b?["name"] != toolName) continue;
                if (b!["input"] is System.Text.Json.Nodes.JsonObject jo)
                    return (System.Text.Json.Nodes.JsonObject)jo.DeepClone();
            }
        }
        catch { }
        return null;
    }

    /// <summary>Estrae il BODY-only se l'LLM ha emesso una function/arrow wrapper (bracket-depth).</summary>
    private static string UnwrapCallbackBody(string js)
    {
        if (string.IsNullOrWhiteSpace(js)) return js;
        string text = js.Trim();
        var m = s_callbackHeadRe.Match(text);
        if (!m.Success) return js;
        int bodyStart = m.Index + m.Length, depth = 1, i = bodyStart;
        while (i < text.Length && depth > 0)
        {
            char ch = text[i];
            if (ch == '{') depth++;
            else if (ch == '}') { depth--; if (depth == 0) break; }
            i++;
        }
        if (depth != 0) return js;
        string body = text.Substring(bodyStart, i - bodyStart).Trim();
        return body.Length == 0 ? js : body;
    }

    private static string StripXmlResidue(string value)
        => string.IsNullOrEmpty(value) ? value : s_xmlResidueRe.Replace(value, "").Trim();

    // ---- retrieval-layer post-processing (porting di _drop_ai_internal + _dedup_doc_locales) ----
    private static List<RagHit> DropAiInternal(List<RagHit> hits)
    {
        var outp = new List<RagHit>(hits.Count);
        foreach (var h in hits)
        {
            string rp = (h.RelPath ?? "").Replace('\\', '/').ToLowerInvariant();
            bool aiGuide = rp.EndsWith(".md") && (rp.Contains("/skills/") || rp.Contains("/scripts/"));
            if (aiGuide || rp.Contains("/assets/declarations/")) continue;
            outp.Add(h);
        }
        return outp;
    }

    private static readonly string[] s_docLocales = { "en-us/", "fr-fr/", "es-es/", "de-de/", "it-it/" };
    private static (string slug, bool isSource)? DocPageSlug(string relPath)
    {
        if (string.IsNullOrEmpty(relPath)) return null;
        string norm = relPath.Replace('\\', '/').ToLowerInvariant();
        int i = norm.IndexOf("/docs/pages/", StringComparison.Ordinal);
        if (i < 0 || !norm.EndsWith(".md")) return null;
        string rest = norm.Substring(i + "/docs/pages/".Length);
        bool localized = false;
        foreach (var loc in s_docLocales) if (rest.StartsWith(loc, StringComparison.Ordinal)) { localized = true; break; }
        string file = rest.Contains('/') ? rest.Substring(rest.LastIndexOf('/') + 1) : rest;
        string slug = file.EndsWith(".md") ? file.Substring(0, file.Length - 3) : file;
        return (slug, !localized); // sorgente IT = senza prefisso locale (preferito)
    }

    /// <summary>Collassa le varianti cross-locale della stessa pagina docs/pages, preferendo
    /// il sorgente IT, mantenendo la posizione del miglior ranking.</summary>
    private static List<RagHit> DedupDocLocales(List<RagHit> hits)
    {
        var outp = new List<RagHit>(hits.Count);
        var slot = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var h in hits)
        {
            var info = DocPageSlug(h.RelPath);
            if (info == null) { outp.Add(h); continue; }
            var (slug, isSource) = info.Value;
            if (!slot.TryGetValue(slug, out int idx)) { slot[slug] = outp.Count; outp.Add(h); continue; }
            var cur = DocPageSlug(outp[idx].RelPath);
            bool curIsSource = cur?.isSource ?? false;
            if (isSource && !curIsSource) outp[idx] = h; // preferisci il sorgente
        }
        return outp;
    }

    private static int ContextWindow(string model) => 200_000; // tutti i modelli correnti: 200k base

    private static readonly string[] s_actionVerbs =
    {
        "crea ", "creare", "creami", "crea una", "crea un", "aggiungi", "aggiung", "modifica",
        "modific", "imposta", "impost", "colora", "applica", "applic", "metti ", "nascondi",
        "rendi ", "abilita", "disabilita", "cambia", "setta", "aggiorna", "rimuovi", "elimina",
    };
    private static readonly string[] s_questionStarts =
    {
        "come ", "cosa ", "perch", "quando ", "dove ", "quale ", "quali ", "che cos", "spiega",
        "what ", "how ", "why ", "where ", "which ", "mostrami", "dimmi", "elenca", "trova",
    };
    /// <summary>Heuristic: la query e' una RICHIESTA D'AZIONE (crea/modifica/imposta/...) sulla
    /// pagina e NON una domanda. Quando vera (con route_context presente) forziamo
    /// `tool_choice:{type:"any"}` sui soli tool propose_* -> emissione del proposed_action
    /// GARANTITA invece che probabilistica (haiku e' troppo debole per scegliere in modo
    /// affidabile tra 17 tool su prompt complessi). Conservativa: in dubbio (domanda) ritorna
    /// false -> tool_choice auto (l'LLM puo' rispondere a testo).</summary>
    private static bool LooksLikeActionRequest(string query)
    {
        string s = (query ?? "").Trim().ToLowerInvariant();
        if (s.Length == 0) return false;
        if (s.EndsWith("?")) return false;                       // domanda esplicita -> Q&A
        foreach (var qw in s_questionStarts) if (s.StartsWith(qw)) return false;
        foreach (var v in s_actionVerbs) if (s.Contains(v)) return true;
        return false;
    }

    public void Dispose() { _emb.Dispose(); _ce.Dispose(); }

    // ---- DTO serializzazione (snake_case come il server Python) ----
    private sealed class QueryOutDto
    {
        [JsonPropertyName("results")] public List<RagSourceDto> Results { get; set; } = new();
    }
    private sealed class RagSourceDto
    {
        [JsonPropertyName("rank")] public int Rank { get; set; }
        [JsonPropertyName("chunk_id")] public string ChunkId { get; set; } = "";
        [JsonPropertyName("rel_path")] public string RelPath { get; set; } = "";
        [JsonPropertyName("symbol_name")] public string SymbolName { get; set; } = "";
        [JsonPropertyName("symbol_type")] public string SymbolType { get; set; } = "";
        [JsonPropertyName("start_line")] public int StartLine { get; set; }
        [JsonPropertyName("end_line")] public int EndLine { get; set; }
        [JsonPropertyName("score_vector")] public double ScoreVector { get; set; }
        [JsonPropertyName("score_bm25")] public double ScoreBm25 { get; set; }
        [JsonPropertyName("snippet")] public string Snippet { get; set; } = "";
    }
    private sealed class ChatOutDto
    {
        [JsonPropertyName("mode")] public string Mode { get; set; } = "";
        [JsonPropertyName("answer")] public string? Answer { get; set; }
        [JsonPropertyName("sources")] public List<RagSourceDto> Sources { get; set; } = new();
        [JsonPropertyName("warning")] public string? Warning { get; set; }
        [JsonPropertyName("model")] public string? Model { get; set; }
        [JsonPropertyName("tokens_in")] public int? TokensIn { get; set; }
        [JsonPropertyName("tokens_out")] public int? TokensOut { get; set; }
        [JsonPropertyName("proposed_action_json")] public string? ProposedActionJson { get; set; }
        [JsonPropertyName("proposed_memory_changes")] public List<object>? ProposedMemoryChanges { get; set; }
        [JsonPropertyName("followup_questions")] public List<string>? FollowupQuestions { get; set; }
        [JsonPropertyName("context_window_max")] public int? ContextWindowMax { get; set; }
        [JsonPropertyName("context_used")] public int? ContextUsed { get; set; }
    }
}
