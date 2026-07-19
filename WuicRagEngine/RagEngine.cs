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
    private readonly IntentCache? _intentCache; // retrieval pre-rerankato per intento (null = feature off)
    public int DocsLoaded { get; }

    private RagEngine(Pipeline pipe, OnnxEmbedder emb, OnnxReranker ce,
                      Dictionary<string, string> translate, string toolsJson, string envProfile, int docs,
                      IntentCache? intentCache)
    { _pipe = pipe; _emb = emb; _ce = ce; _translate = translate; _toolsJson = toolsJson; _envProfile = envProfile; DocsLoaded = docs; _intentCache = intentCache; }

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

        // Intent-cache (opzionale): {root}/intent_cache.json. Assente -> null (pipeline
        // classico). Gli exemplar vengono embeddati in background dentro TryLoad.
        var intentCache = IntentCache.TryLoad(root, pipe.EmbedQuery);

        string envProfile = (profile ?? "internal").Trim().ToLowerInvariant() == "release" ? "release" : "internal";
        return new RagEngine(pipe, emb, ce, translate, toolsJson, envProfile, docs.Count, intentCache);
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
        // Intent-cache first: su match (1 embed, cosine vs exemplar) serviamo il
        // contesto pre-rerankato e saltiamo embed+BM25+cross-encoder (il collo di
        // bottiglia CPU). Miss/warm-up incompleto/chunk_id stantii -> pipeline pieno.
        List<RagHit>? raw = null;
        if (_intentCache is not null
            && _intentCache.TryMatch(query, _pipe.EmbedQuery, out _, out var cachedHits, out _))
        {
            raw = _pipe.TryHitsByChunkIds(cachedHits, minHits: Math.Min(topK, 5));
        }
        raw ??= _pipe.SearchHits(Translate(query), Math.Max(topK + 8, 12));
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
        string eff = EffectiveProfile(profile);
        var srcs = BuildSources(query, topK, eff);
        int rank = 1;
        var dto = new QueryOutDto { Results = srcs.Select(s => ToDto(s.hit, rank++, s.snippet, eff)).ToList() };
        return JsonSerializer.Serialize(dto);
    }

    /// <summary>Stato (contratto /health) + provider ONNX attivo (GPU/CPU) + profilo.</summary>
    public string HealthJson()
    {
        object? intent = null;
        if (_intentCache is not null)
        {
            var (hits, misses, lastIntent, ready, intents) = _intentCache.Stats;
            intent = new { ready, intents, hits, misses, last_intent = lastIntent };
        }
        return JsonSerializer.Serialize(new
        {
            status = "ok",
            engine = "dotnet-onnx",
            provider = OnnxSession.LastProvider,
            profile = _envProfile,
            docs_loaded = DocsLoaded,
            translate_cache_size = _translate.Count,
            intent_cache = intent,
        });
    }

    private static RagSourceDto ToDto(RagHit h, int rank, string snippet, string effProfile)
    {
        bool release = effProfile == "release";
        // In release il path del sorgente framework -> nome pacchetto pubblico (vedi
        // ReleaseRedaction.RedactPath); per quei chunk azzeriamo anche start/end line
        // (un numero di riga verso un path redatto e' un residuo di localizzazione).
        bool pathRedacted = release && ReleaseRedaction.PathIsRedacted(h.RelPath, h.SymbolType, h.SymbolName);
        return new()
        {
            Rank = rank, ChunkId = h.ChunkId,
            RelPath = release ? ReleaseRedaction.RedactPath(h.RelPath, h.SymbolType, h.SymbolName) : h.RelPath,
            SymbolName = h.SymbolName, SymbolType = h.SymbolType,
            StartLine = pathRedacted ? 0 : h.StartLine,
            EndLine = pathRedacted ? 0 : h.EndLine,
            ScoreVector = h.ScoreVector, ScoreBm25 = h.ScoreBm25,
            Snippet = snippet.Length > 500 ? snippet.Substring(0, 500) : snippet,
        };
    }

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
        string eff = EffectiveProfile(profile);
        var srcs = BuildSources(query, topK, eff);
        int rk = 1;
        var sources = srcs.Select(s => ToDto(s.hit, rk++, s.snippet, eff)).ToList();

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
            // In release il path nel CONTESTO passato all'LLM va redatto (sennò l'LLM
            // cita il path interno del sorgente framework nelle [parentesi quadre]).
            string hdrPath = eff == "release" ? ReleaseRedaction.RedactPath(h.RelPath, h.SymbolType, h.SymbolName) : h.RelPath;
            string header = string.IsNullOrEmpty(h.SymbolName) ? $"[{hdrPath}]" : $"[{hdrPath}::{h.SymbolName}]";
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
                .Append("  - `request_metadata_detail{detail:'lookup_value', route:'<route>', column:'<col>', value:'<valore_visualizzato>'}` per RISOLVERE un valore VISUALIZZATO di una colonna lookupByID (es. 'Virginia') nel suo ID reale: interroga la tabella di lookup (NON le righe in grid) e ritorna `matched_ids`. Usalo prima di scrivere un condition_js che filtra per il valore di un lookup.\n")
                .Append("Attendi il tool_result, POI emetti il `propose_*` usando i valori ottenuti. Puoi chiamarlo piu' volte (es. prima `columns`, poi `lookup_columns`).\n")
                .Append("REGOLE:\n")
                .Append("1. Usa SEMPRE i NOMI REALI delle colonne (da contesto o da `request_metadata_detail`), es. `record.<nome>.value` / `record.<nome>.next(...)`. Mai placeholder inventati.\n")
                .Append("2. Per i tool `propose_*`: se l'utente NON menziona esplicitamente una route diversa, il parametro `route` DEVE essere la route della pagina corrente.\n")
                .Append("3. Per i tool che richiedono `column_name`: scegli il `mc_nome_colonna` REALE corrispondente (dal contesto o da `request_metadata_detail{detail:'columns'}`).\n")
                .Append("4. Per snippet SQL (computed_formula / sql_metadata_field): usa il full qualifier e, per i lookup, l'alias di join, entrambi ottenuti da `request_metadata_detail`. Non dedurli a mano.\n")
                .Append("5. ANTI-ECHO MULTI-TURNO (OBBLIGATORIO): genera la proposta basandoti ESCLUSIVAMENTE sull'ULTIMA richiesta dell'utente. La conversazione puo' contenere proposte precedenti su intenti DIVERSI: NON ricopiare MAI classe CSS, callback/condizione, colori, operatori di confronto o descrizione da un turno precedente. Esempio: se prima hai proposto 'rosso se > 12' (row-danger, `> 12`) e ora l'utente chiede 'verde se <= 12', DEVI produrre row-success con condizione `<= 12` e descrizione coerente col verde — NON riproporre la versione rossa. Ricalcola OGNI parametro dall'intento corrente.\n")
                .Append("6. COLONNA/CAMPO INESISTENTE o NON SPECIFICATA → CLARIFICATION UTILE (OBBLIGATORIO): se la richiesta d'azione cita una colonna/campo che NON riconosci tra quelli reali, OPPURE non specifica su quale colonna agire, chiama PRIMA `request_metadata_detail{detail:'columns', route:'<route>'}` per le colonne REALI. Poi e' VIETATO rispondere 'Non ho trovato informazioni sufficienti nel codebase' (frase riservata SOLO alle domande Q&A, MAI alle azioni). Devi produrre UN SOLO messaggio di chiarimento per l'utente finale. REGOLE FERREE sul messaggio: rispondi SOLO con quel testo finale, MAI con prefissi o etichette (NON scrivere MAI parole come 'Esempio', 'Esempio di risposta corretta', 'Risposta:', 'Formato:'); max 2 frasi, italiano naturale; termina con una domanda. Sostituisci i segnaposto <...> coi valori reali:\n")
                .Append("   - se l'utente ha citato una colonna che non esiste, usa la forma: La colonna \"<NOME_CITATO>\" non esiste su questa pagina. Colonne disponibili: <2-4 COLONNE_REALI_PERTINENTI>. Quale vuoi usare?\n")
                .Append("   - se l'utente NON ha indicato la colonna, usa la forma: Su quale colonna vuoi applicare l'azione? Colonne disponibili: <2-4 COLONNE_REALI_PERTINENTI>.\n")
                .Append("   Al turno successivo, con la colonna scelta dall'utente, emetti il `propose_*` corretto.\n")
                .Append("7. COLONNE LOOKUP (lookupByID) NEI CALLBACK JS (OBBLIGATORIO): in un `condition_js` (stile riga/colonna, validazione, selezione) il `record` contiene l'ID della colonna lookup in `record.<column>` (es. `record.StateProvinceID`), NON la stringa visualizzata nella cella. Quindi per una richiesta tipo 'colora se <colonna_lookup> = <valore_visualizzato>' (es. provincia = Virginia): (a) chiama `request_metadata_detail{detail:'lookup_value', route:'<route>', column:'<colonna_lookup>', value:'<valore>'}` per ottenere l'ID reale (`matched_ids`); (b) genera il `condition_js` confrontando l'ID, es: `return Number(record.<column>?.value ?? record.<column>) === <id>;`. E' VIETATO confrontare la stringa visualizzata, ed e' VIETATO usare l'alias di join SQL (es. `record.<column>_<entity>.<x>`) che NON esiste nel record JS. Se `matched_ids` e' vuoto, fai una clarification (valore inesistente, elenca alcuni valori validi); se ha piu' ID, chiedi quale o usa `[id1,id2].includes(Number(record.<column>?.value ?? record.<column>))`.");
        }
        if (!string.IsNullOrWhiteSpace(contextSummary))
            system.Append("\n\nSUMMARY SESSIONE (turn precedenti riassunti):\n").Append(contextSummary.Trim()).Append('\n')
                .Append("Usa questo summary come contesto storico ma cita SOLO sources nuovi del retrieval.");
        if (!string.IsNullOrWhiteSpace(memoryFacts))
            system.Append("\n\nMEMORY FACTS (decisioni/preferenze pinnate via remember_fact):\n").Append(memoryFacts.Trim()).Append('\n')
                .Append("Rispetta SEMPRE questi fatti. Usa `forget_fact(id)` se l'utente li contraddice esplicitamente o se sono diventati obsoleti.");

        // ---- AGENT-SDK (subscription MAX via `claude` CLI) ----
        // Sentinel: apiKey=="agent-sdk" -> NON chiamiamo l'HTTP /v1/messages (API a consumo) ma
        // spawniamo il `claude` CLI (Agent runtime ufficiale, dentro lo scope ToS della subscription).
        // I tool propose_*/request_metadata_detail arrivano a Claude via un MCP server bridge stdio
        // (mcp-wuic-tools.mjs, embeddato). Il loop agentico (request_metadata_detail -> proxy backend)
        // lo fa il CLI nativamente. Vedi memory project_rag_agent_sdk_subscription.
        // ---- intent detection (per il tool_choice forcing piu' sotto). ----
        bool exampleIntent = LooksLikeExampleRequest(query);
        bool actionIntent = !string.IsNullOrWhiteSpace(routeContext) && LooksLikeActionRequest(query) && !exampleIntent;

        if (string.Equals(apiKey.Trim(), "agent-sdk", StringComparison.OrdinalIgnoreCase))
            return ChatViaAgentSdk(system.ToString(), query, historyJson, sources, model, contextWindowMax, actionIntent, exampleIntent);

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
            // Richiesta di ESEMPIO/SPIEGAZIONE ("dammi un esempio", "come funziona", "senza
            // applicare"): NON e' un'azione, e per evitare l'over-trigger (il modello che
            // propone un tool quando l'utente voleva solo un esempio) NON passeremo i tool.
            // (exampleIntent / actionIntent gia' calcolati in alto, prima del messages-building, per
            //  alimentare l'anti-echo FIX B; qui li riusiamo per il tool_choice forcing.)
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
            // Esempio/spiegazione: nessun tool -> il modello risponde a TESTO, niente azione (true-negative robusto).
            if (exampleIntent) toolSource.Clear();

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
                    ["max_tokens"] = 4096,
                    ["temperature"] = TemperatureCfg(),
                    ["messages"] = oaiMessages,
                };
                if (oaiTools.Count > 0)
                {
                    body["tools"] = oaiTools;
                    if (actionIntent) body["tool_choice"] = "required";
                }
            }
            else
            {
                // ---- body Anthropic (invariato) ----
                body = new Dictionary<string, object>
                {
                    ["model"] = model,
                    ["max_tokens"] = 4096,
                    // temperature=0: piu' focus, meno allucinazioni nelle risposte Q&A RAG.
                    ["temperature"] = TemperatureCfg(),
                    ["system"] = system.ToString(),
                    ["messages"] = messages,
                };
                if (toolSource.Count > 0)
                {
                    // prompt caching: ultimo tool marcato cache_control:ephemeral (vedi BuildCachedTools)
                    body["tools"] = BuildCachedTools(toolSource);
                    if (actionIntent) body["tool_choice"] = new Dictionary<string, object> { ["type"] = "any" };
                }
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

    // ============================================================================
    // AGENT-SDK: chat via `claude` CLI (subscription MAX) invece di /v1/messages a consumo.
    // ============================================================================

    /// <summary>
    /// Esegue la chat RAG facendo girare il `claude` CLI (Agent runtime ufficiale) anziche'
    /// la HTTP API a consumo. I tool propose_*/request_metadata_detail sono esposti via un MCP
    /// server bridge stdio (mcp-wuic-tools.mjs, embeddato e estratto in una temp dir). Il CLI
    /// chiama nativamente i tool: il propose_* viene CATTURATO su file dal bridge (terminale),
    /// request_metadata_detail PROXY-a il backend (loop agentico nativo). Al termine leggiamo la
    /// cattura -> proposed_action e il testo finale dal `--output-format json`.
    ///
    /// Trade-off: ~spawn CLI per call (1-3s+). Pensato per i TEST (credito subscription, zero API
    /// key), non per la prod interattiva (vedi qwen locale come alternativa zero-costo).
    /// </summary>
    private string ChatViaAgentSdk(string system, string query, string? historyJson,
        List<RagSourceDto> sources, string model, int contextWindowMax,
        bool actionIntent = false, bool exampleIntent = false)
    {
        string? work = null;
        try
        {
            string? cli = ResolveClaudeCli();
            if (cli == null)
                return JsonSerializer.Serialize(new ChatOutDto
                {
                    Mode = "retrieval-only", Sources = sources, Model = "agent-sdk",
                    Warning = "agent-sdk: `claude` CLI non trovato (imposta WUIC_RAG_CLAUDE_CLI o installa @anthropic-ai/claude-code).",
                    ContextWindowMax = contextWindowMax,
                });

            work = Path.Combine(Path.GetTempPath(), "wuic-agent-sdk-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(work);
            string mcpScript = Path.Combine(work, "mcp-wuic-tools.mjs");
            string toolsFile = Path.Combine(work, "rag_tools.json");
            string captureFile = Path.Combine(work, "capture.jsonl");
            string mcpConfig = Path.Combine(work, "mcp-config.json");

            ExtractEmbeddedMcpScript(mcpScript);
            File.WriteAllText(toolsFile, string.IsNullOrWhiteSpace(_toolsJson) ? "[]" : _toolsJson);
            File.WriteAllText(captureFile, string.Empty);

            // mcp-config: path con FORWARD SLASH obbligatori (i backslash danno "MCP config is not a
            // valid JSON" perche' sono escape invalidi nel JSON). Vedi spike 2026-06-20.
            string nodeExe = ResolveNodeExe();
            string backend = Environment.GetEnvironmentVariable("WUIC_RAG_BACKEND_URL");
            if (string.IsNullOrWhiteSpace(backend)) backend = "http://localhost:5000";
            var cfg = new Dictionary<string, object>
            {
                ["mcpServers"] = new Dictionary<string, object>
                {
                    ["wuic"] = new Dictionary<string, object>
                    {
                        ["command"] = nodeExe.Replace('\\', '/'),
                        ["args"] = new[] { mcpScript.Replace('\\', '/') },
                        ["env"] = new Dictionary<string, string>
                        {
                            ["WUIC_RAG_TOOLS_PATH"] = toolsFile.Replace('\\', '/'),
                            ["WUIC_RAG_CAPTURE_PATH"] = captureFile.Replace('\\', '/'),
                            ["WUIC_BACKEND"] = backend.TrimEnd('/'),
                        },
                    },
                },
            };
            File.WriteAllText(mcpConfig, JsonSerializer.Serialize(cfg));

            // allowedTools (arrivano come mcp__wuic__<name>). TOOL-FORCING SURROGATO: la CLI NON
            // espone `tool_choice:any`, quindi su una richiesta d'azione Claude a volte risponde a
            // TESTO invece di emettere il propose_* (osservato: ~45% miss `got:null` sulle variations).
            // Mitigazione: sotto actionIntent restringiamo allowedTools ai SOLI propose_* +
            // request_metadata_detail (niente remember/forget/suggest_followups che distraggono) e
            // aggiungiamo un nudge imperativo al prompt. Sotto exampleIntent niente propose_* (vogliamo
            // testo). Per Q&A normale lasciamo tutto.
            var allowed = new List<string>();
            try
            {
                using var td = JsonDocument.Parse(string.IsNullOrWhiteSpace(_toolsJson) ? "[]" : _toolsJson);
                foreach (var t in td.RootElement.EnumerateArray())
                {
                    string s = t.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "";
                    if (s.Length == 0) continue;
                    if (exampleIntent && s.StartsWith("propose_", StringComparison.Ordinal)) continue; // esempio -> testo
                    if (actionIntent && !s.StartsWith("propose_", StringComparison.Ordinal)) continue; // azione -> solo propose_*
                    allowed.Add("mcp__wuic__" + s);
                }
            }
            catch { }
            if (!exampleIntent) allowed.Add("mcp__wuic__request_metadata_detail"); // retrieval agentico sempre utile (tranne esempi)
            if (allowed.Count == 0) allowed.Add("mcp__wuic__request_metadata_detail"); // mai vuoto

            // System prompt via --append-system-prompt (cap di sicurezza sul command-line Windows
            // ~32K: tronchiamo a 28K tenendo la testa con istruzioni + contesto piu' rilevante).
            string sysArg = system.Length > 28000 ? system.Substring(0, 28000) : system;
            string promptText = BuildAgentPrompt(historyJson, query);
            if (actionIntent)
                // Nudge imperativo finale: surrogato del tool_choice:any mancante nella CLI.
                promptText += "\n\nISTRUZIONE VINCOLANTE: questa e' una RICHIESTA D'AZIONE sulla pagina corrente. "
                    + "DEVI chiamare il tool `mcp__wuic__propose_*` piu' appropriato (eventualmente dopo "
                    + "`mcp__wuic__request_metadata_detail` per i nomi reali). E' VIETATO rispondere solo a "
                    + "testo o spiegare a parole: se non emetti il tool, la richiesta NON viene soddisfatta. "
                    + "Se manca un dettaglio (colonna/route), chiama prima request_metadata_detail, poi emetti il propose_*.";

            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = cli,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = work, // isola dal CLAUDE.md del repo (no noise, no slowdown)
                StandardOutputEncoding = System.Text.Encoding.UTF8,
            };
            psi.ArgumentList.Add("-p");
            psi.ArgumentList.Add("--mcp-config"); psi.ArgumentList.Add(mcpConfig.Replace('\\', '/'));
            psi.ArgumentList.Add("--allowedTools"); psi.ArgumentList.Add(string.Join(",", allowed));
            psi.ArgumentList.Add("--permission-mode"); psi.ArgumentList.Add("bypassPermissions");
            psi.ArgumentList.Add("--append-system-prompt"); psi.ArgumentList.Add(sysArg);
            psi.ArgumentList.Add("--output-format"); psi.ArgumentList.Add("json");
            // Modello CONFIG-DRIVEN: env WUIC_RAG_AGENT_MODEL > model risolto dalla config
            // (rag-llm-default-chat-model / anthropic-default-chat-model, se id Claude) > default
            // subscription della CLI. Cosi' la config e' autoritativa e si sa "cosa usa".
            string modelArg = ResolveAgentModel(model);
            if (!string.IsNullOrWhiteSpace(modelArg)) { psi.ArgumentList.Add("--model"); psi.ArgumentList.Add(modelArg); }
            // ZERO API key nel child: se ANTHROPIC_API_KEY fosse ereditata, il CLI userebbe l'API a
            // consumo invece della subscription. La rimuoviamo esplicitamente.
            psi.Environment.Remove("ANTHROPIC_API_KEY");
            psi.Environment.Remove("ANTHROPIC_AUTH_TOKEN");

            int timeoutMs = AgentTimeoutMs();
            string stdout, stderr;
            using (var proc = new System.Diagnostics.Process { StartInfo = psi })
            {
                proc.Start();
                try { proc.StandardInput.Write(promptText); proc.StandardInput.Close(); } catch { }
                var outTask = proc.StandardOutput.ReadToEndAsync();
                var errTask = proc.StandardError.ReadToEndAsync();
                if (!proc.WaitForExit(timeoutMs))
                {
                    try { proc.Kill(true); } catch { }
                    return JsonSerializer.Serialize(new ChatOutDto
                    {
                        Mode = "retrieval-only", Sources = sources, Model = "agent-sdk",
                        Warning = $"agent-sdk: CLI call exception (timeout {timeoutMs}ms); degraded to retrieval-only",
                        ContextWindowMax = contextWindowMax,
                    });
                }
                stdout = outTask.GetAwaiter().GetResult();
                stderr = errTask.GetAwaiter().GetResult();
            }

            // Testo finale dal --output-format json: { type:"result", result:"<text>", ... }.
            string answer = ExtractCliResultText(stdout);
            // Modello REALE usato (da modelUsage del CLI) -> riportato in `model` per togliere
            // ogni ambiguita' su "cosa ha usato". Fallback: il --model richiesto, poi "agent-sdk".
            string usedModel = ExtractCliPrimaryModel(stdout) ?? (string.IsNullOrWhiteSpace(modelArg) ? "agent-sdk" : modelArg);

            // AUTH-CONFLICT DETECTION: il `claude -p` headless usa il token della subscription, che
            // puo' NON essere valido in modalita' non-interattiva o entrare in CONFLITTO con una
            // sessione Claude Code interattiva concorrente sulla stessa subscription -> 401. In quel
            // caso la CLI ritorna il testo d'errore come `result` (e `is_error:true`): NON va presentato
            // come risposta della chat. Degradiamo a retrieval-only con warning esplicito cosi' il
            // chiamante (RagController.ClassifyLlmFailure) lo tratta come fallimento LLM, non come Q&A.
            if (CliIsAuthError(stdout, answer))
                return JsonSerializer.Serialize(new ChatOutDto
                {
                    Mode = "retrieval-only", Sources = sources, Model = usedModel,
                    Warning = "agent-sdk: LLM call failed (HTTP 401) auth della subscription non valida/in conflitto "
                        + "(headless claude -p in parallelo a una sessione interattiva); degraded to retrieval-only",
                    ContextWindowMax = contextWindowMax,
                });

            // Cattura: prima azione propose_* + memory/followups.
            string? proposedActionJson = null;
            var memoryChanges = new List<object>();
            List<string>? followups = null;
            foreach (var (name, inputEl) in ReadCapturedToolCalls(captureFile))
            {
                if (proposedActionJson == null && s_actionToolToKind.TryGetValue(name, out var kind)
                    && inputEl.ValueKind == JsonValueKind.Object)
                {
                    proposedActionJson = BuildProposedAction(kind, inputEl);
                }
                else if (name == "remember_fact" && inputEl.ValueKind == JsonValueKind.Object
                         && inputEl.TryGetProperty("fact", out var f) && (f.GetString() ?? "").Trim() is string fact && fact.Length > 0)
                {
                    memoryChanges.Add(new { op = "add", fact = fact.Length > 200 ? fact.Substring(0, 200) : fact });
                }
                else if (name == "forget_fact" && inputEl.ValueKind == JsonValueKind.Object
                         && inputEl.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number
                         && idEl.TryGetInt32(out var fid) && fid > 0)
                {
                    memoryChanges.Add(new { op = "remove", id = fid });
                }
                else if (name == "suggest_followups" && followups == null && inputEl.ValueKind == JsonValueKind.Object
                         && inputEl.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array)
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

            if (string.IsNullOrWhiteSpace(answer) && proposedActionJson == null)
                return JsonSerializer.Serialize(new ChatOutDto
                {
                    Mode = "retrieval-only", Sources = sources, Model = usedModel,
                    Warning = "agent-sdk: CLI non ha prodotto output (stderr: " + (stderr ?? "").Trim().Replace("\n", " ").Substring(0, Math.Min(180, (stderr ?? "").Trim().Length)) + ")",
                    ContextWindowMax = contextWindowMax,
                });

            return JsonSerializer.Serialize(new ChatOutDto
            {
                Mode = "rag-llm", Answer = answer, Sources = sources, Model = usedModel,
                ProposedActionJson = proposedActionJson,
                ProposedMemoryChanges = memoryChanges.Count > 0 ? memoryChanges : null,
                FollowupQuestions = followups,
                ContextWindowMax = contextWindowMax,
            });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new ChatOutDto
            {
                Mode = "retrieval-only", Sources = sources, Model = "agent-sdk",
                Warning = $"agent-sdk: CLI call exception ({ex.GetType().Name}: {ex.Message}); degraded to retrieval-only",
                ContextWindowMax = contextWindowMax,
            });
        }
        finally
        {
            if (work != null) { try { Directory.Delete(work, true); } catch { } }
        }
    }

    /// <summary>Rende la history + la richiesta corrente in un prompt testuale per il CLI
    /// (single-shot `-p`). La cronologia diventa contesto leggibile; l'ultima riga e' la
    /// richiesta su cui agire.</summary>
    private static string BuildAgentPrompt(string? historyJson, string query)
    {
        var sb = new System.Text.StringBuilder();
        if (!string.IsNullOrWhiteSpace(historyJson))
        {
            try
            {
                using var hd = JsonDocument.Parse(historyJson);
                var turns = new List<(string role, string content)>();
                foreach (var t in hd.RootElement.EnumerateArray())
                {
                    string role = t.TryGetProperty("role", out var r) ? r.GetString() ?? "user" : "user";
                    string content = t.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(content)) turns.Add((role, content));
                }
                if (turns.Count > 0)
                {
                    sb.Append("CRONOLOGIA CONVERSAZIONE (contesto, NON e' la richiesta corrente):\n");
                    foreach (var (role, content) in turns)
                        sb.Append(role == "assistant" ? "ASSISTENTE: " : "UTENTE: ")
                          .Append(content.Length > 1500 ? content.Substring(0, 1500) : content).Append('\n');
                    sb.Append('\n');
                }
            }
            catch { }
        }
        sb.Append("RICHIESTA CORRENTE DELL'UTENTE (agisci SOLO su questa):\n").Append(query);
        return sb.ToString();
    }

    /// <summary>Estrae il testo della risposta dal JSON del CLI (`--output-format json`):
    /// campo `result` (success) o `error`. Fallback: stdout raw troncato.</summary>
    private static string ExtractCliResultText(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout)) return "";
        try
        {
            using var doc = JsonDocument.Parse(stdout.Trim());
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("result", out var res) && res.ValueKind == JsonValueKind.String)
                    return res.GetString() ?? "";
                if (root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                    return err.GetString() ?? "";
            }
        }
        catch { /* non-JSON (stream-json o errore CLI): ripiega su raw */ }
        return stdout.Trim().Length > 4000 ? stdout.Trim().Substring(0, 4000) : stdout.Trim();
    }

    /// <summary>True se l'output del CLI indica un fallimento di AUTENTICAZIONE (401 / token
    /// subscription non valido o in conflitto con una sessione interattiva concorrente). Controlla
    /// sia il flag `is_error` del JSON sia pattern testuali noti nel `result`/raw.</summary>
    private static bool CliIsAuthError(string stdout, string answer)
    {
        bool isErrorFlag = false;
        try
        {
            using var doc = JsonDocument.Parse((stdout ?? "").Trim());
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("is_error", out var ie) && ie.ValueKind == JsonValueKind.True)
                isErrorFlag = true;
        }
        catch { }
        string probe = ((answer ?? "") + " " + (stdout ?? "")).ToLowerInvariant();
        bool authText = probe.Contains("401")
            || probe.Contains("invalid authentication")
            || probe.Contains("failed to authenticate")
            || probe.Contains("authentication_error")
            || probe.Contains("oauth")
            || (probe.Contains("authenticate") && probe.Contains("credential"));
        // is_error da solo non basta (puo' essere un errore non-auth); ma is_error + pattern auth, o
        // anche solo il pattern 401/authenticate, indicano il caso che vogliamo intercettare.
        return authText || (isErrorFlag && probe.Contains("auth"));
    }

    /// <summary>Legge le tool-call catturate dal bridge MCP (one JSON per line): {name, arguments}.
    /// Ritorna (name, argumentsElement) in ordine di cattura.</summary>
    private static IEnumerable<(string name, JsonElement input)> ReadCapturedToolCalls(string captureFile)
    {
        string[] lines;
        try { lines = File.Exists(captureFile) ? File.ReadAllLines(captureFile) : Array.Empty<string>(); }
        catch { yield break; }
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonDocument doc = null;
            string name = null; JsonElement input = default;
            try
            {
                doc = JsonDocument.Parse(line);
                if (doc.RootElement.TryGetProperty("name", out var nm)) name = nm.GetString();
                if (doc.RootElement.TryGetProperty("arguments", out var args)) input = args.Clone();
            }
            catch { doc?.Dispose(); continue; }
            doc.Dispose();
            if (!string.IsNullOrEmpty(name)) yield return (name, input);
        }
    }

    /// <summary>Estrae il bridge MCP embeddato nella DLL verso <paramref name="target"/>.</summary>
    private static void ExtractEmbeddedMcpScript(string target)
    {
        var asm = typeof(RagEngine).Assembly;
        using var s = asm.GetManifestResourceStream("WuicRagEngine.mcp-wuic-tools.mjs")
            ?? throw new InvalidOperationException("Risorsa embeddata mcp-wuic-tools.mjs non trovata nella DLL.");
        using var fs = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None);
        s.CopyTo(fs);
    }

    /// <summary>Path del `claude` CLI: env WUIC_RAG_CLAUDE_CLI, altrimenti probe nelle dir del PATH
    /// per <c>node_modules/@anthropic-ai/claude-code/bin/claude.exe</c> (npm global) o claude.exe diretto.
    /// Null se non trovato.</summary>
    private static string? ResolveClaudeCli()
    {
        string env = Environment.GetEnvironmentVariable("WUIC_RAG_CLAUDE_CLI");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;
        bool win = OperatingSystem.IsWindows();
        string exe = win ? "claude.exe" : "claude";
        string rel = Path.Combine("node_modules", "@anthropic-ai", "claude-code", "bin", exe);
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            string d = dir.Trim();
            try
            {
                string p1 = Path.Combine(d, rel);
                if (File.Exists(p1)) return p1;
                string p2 = Path.Combine(d, exe);
                if (File.Exists(p2)) return p2;
            }
            catch { }
        }
        return null;
    }

    /// <summary>Path di <c>node</c>: env WUIC_RAG_NODE, altrimenti probe nel PATH. Fallback "node".</summary>
    private static string ResolveNodeExe()
    {
        string env = Environment.GetEnvironmentVariable("WUIC_RAG_NODE");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;
        string exe = OperatingSystem.IsWindows() ? "node.exe" : "node";
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            try { string p = Path.Combine(dir.Trim(), exe); if (File.Exists(p)) return p; } catch { }
        }
        return "node";
    }

    /// <summary>Modello da passare al CLI (--model): env WUIC_RAG_AGENT_MODEL, altrimenti il model
    /// risolto dalla config (rag-llm-default-chat-model / anthropic-default-chat-model) se e' un id
    /// Claude; null = default subscription della CLI (es. opus). Rende la scelta config-driven.</summary>
    private static string ResolveAgentModel(string model)
    {
        var ov = Environment.GetEnvironmentVariable("WUIC_RAG_AGENT_MODEL");
        if (!string.IsNullOrWhiteSpace(ov)) return ov.Trim();
        if (!string.IsNullOrWhiteSpace(model) && model.Trim().StartsWith("claude", StringComparison.OrdinalIgnoreCase))
            return model.Trim();
        return null;
    }

    /// <summary>Modello primario realmente usato dal CLI, dal blocco `modelUsage` del
    /// `--output-format json`: la chiave con piu' input_tokens (l'agente principale, non il
    /// quick-model dei subtask). Null se assente.</summary>
    private static string ExtractCliPrimaryModel(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout)) return null;
        try
        {
            using var doc = JsonDocument.Parse(stdout.Trim());
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("modelUsage", out var mu) && mu.ValueKind == JsonValueKind.Object)
            {
                string best = null; long bestIn = -1;
                foreach (var p in mu.EnumerateObject())
                {
                    long inTok = 0;
                    if (p.Value.ValueKind == JsonValueKind.Object
                        && p.Value.TryGetProperty("inputTokens", out var it) && it.ValueKind == JsonValueKind.Number)
                        inTok = it.GetInt64();
                    if (inTok > bestIn) { bestIn = inTok; best = p.Name; }
                }
                return best;
            }
        }
        catch { }
        return null;
    }

    private static int AgentTimeoutMs()
    {
        var v = Environment.GetEnvironmentVariable("WUIC_RAG_AGENT_TIMEOUT_MS");
        return !string.IsNullOrWhiteSpace(v) && int.TryParse(v.Trim(), out var n) && n > 0 ? n : 120000;
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
        ["propose_scene3d_inject"] = "scene3d_inject",
        ["propose_workflow_inject"] = "workflow_inject",
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
            || provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase)
            || provider.Equals("ollama", StringComparison.OrdinalIgnoreCase));

    /// <summary>Base URL del provider: override esplicito, altrimenti default per provider.</summary>
    internal static string ResolveBaseUrl(string? provider, string? baseUrl)
    {
        if (!string.IsNullOrWhiteSpace(baseUrl)) return baseUrl!.TrimEnd('/');
        if (provider != null && provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase)) return "https://openrouter.ai/api/v1";
        if (provider != null && provider.Equals("openai", StringComparison.OrdinalIgnoreCase)) return "https://api.openai.com/v1";
        if (provider != null && provider.Equals("ollama", StringComparison.OrdinalIgnoreCase)) return "http://localhost:11434/v1";
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
    /// (content[].text / content[].tool_use{name,input} + usage) attesa dal parser.
    /// FALLBACK: alcuni server OpenAI-compatible (notabilmente Ollama, e in generale
    /// sotto `tool_choice:"required"`) NON popolano `message.tool_calls` e restituiscono
    /// la tool-call come JSON grezzo dentro `message.content` (es. `{"name":"propose_...",
    /// "arguments":{...}}`). In quel caso sintetizziamo il blocco tool_use dal content,
    /// cosi' il parser di ChatJson (e il loop agentico request_metadata_detail) restano
    /// identici e l'azione viene proposta lo stesso. Vedi smoke-test Ollama 2026-06-13.</summary>
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
            string textContent = "";
            var toolBlocks = new List<object>();
            if (root.TryGetProperty("choices", out var ch) && ch.ValueKind == JsonValueKind.Array && ch.GetArrayLength() > 0
                && ch[0].TryGetProperty("message", out var msg))
            {
                if (msg.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String)
                    textContent = c.GetString() ?? "";
                if (msg.TryGetProperty("tool_calls", out var tc) && tc.ValueKind == JsonValueKind.Array)
                {
                    foreach (var call in tc.EnumerateArray())
                    {
                        if (!call.TryGetProperty("function", out var fn)) continue;
                        string name = fn.TryGetProperty("name", out var nm) ? (nm.GetString() ?? "") : "";
                        string args = fn.TryGetProperty("arguments", out var a) && a.ValueKind == JsonValueKind.String ? (a.GetString() ?? "{}") : "{}";
                        object input;
                        try { using var ad = JsonDocument.Parse(string.IsNullOrWhiteSpace(args) ? "{}" : args); input = CoerceStringifiedStructuredArgs(ad.RootElement); }
                        catch { input = new Dictionary<string, object>(); }
                        toolBlocks.Add(new { type = "tool_use", name, input });
                    }
                }
            }
            // Fallback content->tool_use quando il provider non ha popolato tool_calls.
            if (toolBlocks.Count == 0 && !string.IsNullOrWhiteSpace(textContent))
            {
                var synth = TryExtractToolUseFromContent(textContent);
                if (synth != null) { toolBlocks.Add(synth); textContent = ""; }
            }
            if (!string.IsNullOrWhiteSpace(textContent)) content.Add(new { type = "text", text = textContent });
            content.AddRange(toolBlocks);
            return JsonSerializer.Serialize(new { content, usage = new { input_tokens = tin, output_tokens = tout } });
        }
        catch { return openaiResp; }
    }

    /// <summary>Cerca nel testo (content del messaggio) il PRIMO oggetto JSON bilanciato
    /// che rappresenti una tool-call di un tool WUIC noto (`{"name":"propose_*"|utility,
    /// "arguments"|"parameters":{...}}`) e lo converte nel blocco Anthropic
    /// `{type:"tool_use", name, input}`. Ritorna null se nessun candidato valido.
    /// Scansione brace-aware (string/escape) per gestire callback_js/condition_js con
    /// graffe e virgolette annidate, e un eventuale prefisso spurio del modello.</summary>
    private static object? TryExtractToolUseFromContent(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        int start = text.IndexOf('{');
        while (start >= 0)
        {
            int depth = 0; bool inStr = false, esc = false;
            for (int i = start; i < text.Length; i++)
            {
                char chx = text[i];
                if (inStr)
                {
                    if (esc) esc = false;
                    else if (chx == '\\') esc = true;
                    else if (chx == '"') inStr = false;
                }
                else if (chx == '"') inStr = true;
                else if (chx == '{') depth++;
                else if (chx == '}')
                {
                    depth--;
                    if (depth == 0)
                    {
                        var tu = TryBuildToolUse(text.Substring(start, i - start + 1));
                        if (tu != null) return tu;
                        break; // candidato non valido -> prova dal prossimo '{'
                    }
                }
            }
            start = text.IndexOf('{', start + 1);
        }
        // Nessun envelope {name,arguments}: prova il formato Ollama "<nome_tool> {args}".
        return ScanNamedBlock(text);
    }

    /// <summary>Riconosce il pattern (frequente con Ollama sotto tool_choice required) in cui
    /// il modello scrive il nome del tool seguito direttamente dagli ARGS, es.
    /// `propose_table_style [sig] {"route":...}` oppure `propose_designer_inject{action_type:'inject', layout=[...]}`.
    /// Trova il token nome-tool noto, salta un eventuale `[...]` di firma, cattura il blocco
    /// `{...}` bilanciato e lo normalizza (JS-literal -> JSON) per ottenere gli input.</summary>
    private static object? ScanNamedBlock(string text)
    {
        var rx = new System.Text.RegularExpressions.Regex(
            @"(propose_[A-Za-z_]+|request_metadata_detail|remember_fact|forget_fact|suggest_followups)");
        foreach (System.Text.RegularExpressions.Match m in rx.Matches(text))
        {
            string name = m.Value;
            int j = m.Index + m.Length;
            while (j < text.Length && char.IsWhiteSpace(text[j])) j++;
            if (j < text.Length && text[j] == '[') // salta firma opzionale [campo campo ...]
            {
                int d = 0;
                for (; j < text.Length; j++) { if (text[j] == '[') d++; else if (text[j] == ']') { d--; if (d == 0) { j++; break; } } }
                while (j < text.Length && char.IsWhiteSpace(text[j])) j++;
            }
            if (j >= text.Length || text[j] != '{') continue;
            string block = ExtractBalancedBraces(text, j);
            if (block == null) continue;
            string json = NormalizeJsObjectToJson(block);
            if (json == null) continue;
            try { using var d = JsonDocument.Parse(SanitizeModelJsonEscapes(json)); return new { type = "tool_use", name, input = d.RootElement.Clone() }; }
            catch { /* prova il prossimo match */ }
        }
        return null;
    }

    /// <summary>Estrae la sottostringa `{...}` bilanciata che parte all'indice start, rispettando
    /// stringhe con apici `'` `"` e backtick e gli escape. null se non bilanciata.</summary>
    private static string ExtractBalancedBraces(string s, int start)
    {
        int depth = 0; char q = '\0'; bool esc = false;
        for (int i = start; i < s.Length; i++)
        {
            char c = s[i];
            if (q != '\0')
            {
                if (esc) esc = false;
                else if (c == '\\') esc = true;
                else if (c == q) q = '\0';
            }
            else if (c == '\'' || c == '"' || c == '`') q = c;
            else if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) return s.Substring(start, i - start + 1); }
        }
        return null;
    }

    /// <summary>Normalizza un object-literal JS (apici singoli/backtick, chiavi non quotate,
    /// separatore `:` o `=`, virgole finali) in JSON valido. Recursive-descent quote-aware:
    /// i body JS (callback_js/condition_js) dentro le stringhe restano intatti. null se non parsabile.</summary>
    private static string NormalizeJsObjectToJson(string s)
    {
        try { int i = 0; var sb = new System.Text.StringBuilder(); if (!NormVal(s, ref i, sb)) return null; return sb.ToString(); }
        catch { return null; }
    }

    /// <summary>Campi tool-arg che sono BODY di codice/SQL/markup o testo libero: mai
    /// coercerli in array/oggetto anche se il valore stringa somiglia a JSON (un
    /// callback JS puo' iniziare con '[' o '{').</summary>
    private static readonly HashSet<string> s_noCoerceArgFields = new(StringComparer.Ordinal)
    {
        "callback_js", "condition_js", "formula_js", "template_html", "sql_snippet",
        "rationale", "label", "description", "innerText", "text"
    };

    /// <summary>Alcuni modelli OpenAI-compat (es. qwen3-coder via Ollama) serializzano i
    /// parametri tool di tipo ARRAY/OGGETTO come STRINGA JSON (spesso JS-literal con apici
    /// singoli): es. designer_inject.layout / scene3d_inject.objects arrivano come
    /// <c>"[{'tool_name':...}]"</c> invece che come array. Il validator client fa
    /// <c>Array.isArray</c> e li scarta → tool droppato. Qui, dopo il parse degli arguments,
    /// ricostruiamo l'oggetto coercendo ogni valore-stringa che (a) non e' un campo
    /// codice/testo (<see cref="s_noCoerceArgFields"/>) e (b) inizia con '[' o '{' e
    /// (c) parsa come array/oggetto JSON (diretto o via <see cref="NormalizeJsObjectToJson"/>).
    /// Idempotente sugli array/oggetti gia' strutturati. Vale per TUTTI i tool con param
    /// strutturati (layout, objects, archetype_config, repeater_config, binding, fieldMap, value, ...).</summary>
    private static object CoerceStringifiedStructuredArgs(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return root.Clone();
        var dict = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var p in root.EnumerateObject())
        {
            if (p.Value.ValueKind == JsonValueKind.String && !s_noCoerceArgFields.Contains(p.Name))
            {
                string raw = p.Value.GetString() ?? "";
                string t = raw.TrimStart();
                if (t.Length > 0 && (t[0] == '[' || t[0] == '{'))
                {
                    JsonElement? parsed = TryParseJsonElement(raw) ?? TryParseJsonElement(NormalizeJsObjectToJson(raw));
                    if (parsed.HasValue && (parsed.Value.ValueKind == JsonValueKind.Array || parsed.Value.ValueKind == JsonValueKind.Object))
                    {
                        dict[p.Name] = parsed.Value;
                        continue;
                    }
                }
            }
            dict[p.Name] = p.Value.Clone();
        }
        return dict;
    }

    /// <summary>Parse difensivo di una stringa in JsonElement (clone svincolato dal document); null se invalida.</summary>
    private static JsonElement? TryParseJsonElement(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        try { using var d = JsonDocument.Parse(s); return d.RootElement.Clone(); }
        catch { return null; }
    }

    private static void NormWs(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

    private static bool NormVal(string s, ref int i, System.Text.StringBuilder sb)
    {
        NormWs(s, ref i);
        if (i >= s.Length) return false;
        char c = s[i];
        if (c == '{') return NormObj(s, ref i, sb);
        if (c == '[') return NormArr(s, ref i, sb);
        if (c == '\'' || c == '"' || c == '`') { NormStr(s, ref i, sb); return true; }
        // bareword / numero / literal: leggi fino a delimitatore
        int st = i;
        while (i < s.Length && ",}]".IndexOf(s[i]) < 0) i++;
        string tok = s.Substring(st, i - st).Trim();
        if (tok.Length == 0) return false;
        if (tok == "true" || tok == "false" || tok == "null") { sb.Append(tok); return true; }
        if (System.Text.RegularExpressions.Regex.IsMatch(tok, @"^-?\d+(\.\d+)?([eE][+-]?\d+)?$")) { sb.Append(tok); return true; }
        AppendJsonString(sb, tok); // qualsiasi altra cosa -> stringa
        return true;
    }

    private static bool NormObj(string s, ref int i, System.Text.StringBuilder sb)
    {
        sb.Append('{'); i++; // '{'
        bool first = true;
        while (true)
        {
            NormWs(s, ref i);
            if (i >= s.Length) return false;
            if (s[i] == '}') { i++; sb.Append('}'); return true; }
            if (!first) sb.Append(',');
            first = false;
            // chiave
            string key;
            if (s[i] == '\'' || s[i] == '"' || s[i] == '`') { var kb = new System.Text.StringBuilder(); NormStr(s, ref i, kb); sb.Append(kb); }
            else { int ks = i; while (i < s.Length && s[i] != ':' && s[i] != '=' && !char.IsWhiteSpace(s[i])) i++; key = s.Substring(ks, i - ks); AppendJsonString(sb, key); }
            NormWs(s, ref i);
            if (i >= s.Length || (s[i] != ':' && s[i] != '=')) return false;
            i++; // ':' o '='
            sb.Append(':');
            if (!NormVal(s, ref i, sb)) return false;
            NormWs(s, ref i);
            if (i < s.Length && s[i] == ',') { i++; continue; }
        }
    }

    private static bool NormArr(string s, ref int i, System.Text.StringBuilder sb)
    {
        sb.Append('['); i++; // '['
        bool first = true;
        while (true)
        {
            NormWs(s, ref i);
            if (i >= s.Length) return false;
            if (s[i] == ']') { i++; sb.Append(']'); return true; }
            if (!first) sb.Append(',');
            first = false;
            if (!NormVal(s, ref i, sb)) return false;
            NormWs(s, ref i);
            if (i < s.Length && s[i] == ',') { i++; continue; }
        }
    }

    private static void NormStr(string s, ref int i, System.Text.StringBuilder sb)
    {
        char q = s[i]; i++;
        var raw = new System.Text.StringBuilder();
        while (i < s.Length)
        {
            char c = s[i];
            if (c == '\\' && i + 1 < s.Length) { raw.Append(c); raw.Append(s[i + 1]); i += 2; continue; }
            if (c == q) { i++; break; }
            raw.Append(c); i++;
        }
        AppendJsonString(sb, raw.ToString(), unescapeInput: true);
    }

    private static void AppendJsonString(System.Text.StringBuilder sb, string val, bool unescapeInput = false)
    {
        sb.Append('"');
        for (int k = 0; k < val.Length; k++)
        {
            char c = val[k];
            if (unescapeInput && c == '\\' && k + 1 < val.Length)
            {
                char n = val[k + 1];
                // mantieni gli escape JSON validi; converti \' -> ' (non valido in JSON)
                if (n == '\'') { sb.Append('\''); k++; continue; }
                if ("\"\\/bfnrtu".IndexOf(n) >= 0) { sb.Append('\\').Append(n); k++; continue; }
                sb.Append('\\').Append('\\'); continue; // backslash letterale
            }
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c); break;
            }
        }
        sb.Append('"');
    }

    /// <summary>Costruisce un blocco tool_use da una stringa JSON candidata, validando che
    /// `name` sia un tool WUIC noto (propose_* o utility). Accetta sia `arguments` sia
    /// `parameters` come contenitore degli input (alcuni modelli usano l'uno o l'altro).</summary>
    /// <summary>Ripara gli escape NON-JSON che i modelli locali (qwen/Ollama) producono
    /// spesso dentro callback_js/condition_js: tipicamente `\'` (apice singolo escapato,
    /// valido in JS ma NON in JSON -> JsonDocument.Parse fallisce e la tool-call viene persa).
    /// L'apice singolo non va MAI escapato in JSON, quindi `\'` -> `'` e' sempre sicuro;
    /// la lookbehind evita di toccare `\\'` (backslash escapato + apice). Verificato
    /// 2026-06-21: variante toolbar_action 'bulk-archive' falliva 1/5 SOLO per questo.</summary>
    private static string SanitizeModelJsonEscapes(string json)
    {
        if (string.IsNullOrEmpty(json) || json.IndexOf("\\'", StringComparison.Ordinal) < 0) return json;
        return System.Text.RegularExpressions.Regex.Replace(json, @"(?<!\\)\\'", "'");
    }

    private static object? TryBuildToolUse(string json)
    {
        try
        {
            using var d = JsonDocument.Parse(SanitizeModelJsonEscapes(json));
            var r = d.RootElement;
            if (r.ValueKind != JsonValueKind.Object) return null;
            if (!r.TryGetProperty("name", out var nmEl) || nmEl.ValueKind != JsonValueKind.String) return null;
            string name = nmEl.GetString() ?? "";
            bool known = name.StartsWith("propose_", StringComparison.Ordinal)
                || name == "request_metadata_detail" || name == "remember_fact"
                || name == "forget_fact" || name == "suggest_followups";
            if (!known) return null;
            object input;
            if (r.TryGetProperty("arguments", out var argEl) || r.TryGetProperty("parameters", out argEl))
            {
                if (argEl.ValueKind == JsonValueKind.Object) input = CoerceStringifiedStructuredArgs(argEl);
                else if (argEl.ValueKind == JsonValueKind.String)
                {
                    try { using var ad = JsonDocument.Parse(argEl.GetString() ?? "{}"); input = CoerceStringifiedStructuredArgs(ad.RootElement); }
                    catch { input = new Dictionary<string, object>(); }
                }
                else input = new Dictionary<string, object>();
            }
            else return null;
            return new { type = "tool_use", name, input };
        }
        catch { return null; }
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

    /// <summary>
    /// Anthropic prompt caching: marca l'ULTIMO tool del blocco con
    /// <c>cache_control: {type:"ephemeral"}</c>, cosi' l'intero array <c>tools</c>
    /// (~17-18K token statici da <c>rag_tools.json</c>, che rende PRIMA di <c>system</c>)
    /// viene messo in cache. E' l'unica regione cacheabile in modo affidabile: il
    /// <c>system</c> contiene i chunk RAG VOLATILI per-query, quindi tutto cio' che lo
    /// segue non e' un prefisso stabile tra turni. Una cache read costa ~0.1x del prezzo
    /// input -> forte risparmio su conversazioni multi-turn (entro il TTL di 5 min).
    /// Solo path Anthropic (l'openai/openrouter usa un'altra wire-format).
    /// Kill-switch: env <c>WUIC_RAG_DISABLE_PROMPT_CACHE=1</c>.
    /// </summary>
    private static object BuildCachedTools(List<JsonElement> toolSource)
    {
        if (toolSource == null || toolSource.Count == 0) return (object?)toolSource ?? new List<object>();
        if (string.Equals(Environment.GetEnvironmentVariable("WUIC_RAG_DISABLE_PROMPT_CACHE"), "1", StringComparison.Ordinal))
            return toolSource;

        var result = new List<object>(toolSource.Count);
        for (int i = 0; i < toolSource.Count - 1; i++) result.Add(toolSource[i]);

        // Ultimo tool: copia i campi + aggiunge cache_control. I JsonElement value
        // serializzano col loro raw value; cache_control come dict annidato.
        var lastWithCache = new Dictionary<string, object>();
        foreach (var prop in toolSource[^1].EnumerateObject())
            lastWithCache[prop.Name] = prop.Value;
        lastWithCache["cache_control"] = new Dictionary<string, string> { ["type"] = "ephemeral" };
        result.Add(lastWithCache);
        return result;
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

    // Frasi che segnalano una richiesta di ESEMPIO/SPIEGAZIONE (non un'azione da applicare).
    // Specifiche per evitare falsi positivi su "per esempio" mid-frase.
    private static readonly string[] s_exampleIndicators =
    {
        "esempio di", "un esempio", "mi dai un esempio", "dammi un esempio", "fammi un esempio",
        "mostrami un esempio", "fai un esempio", "come funziona", "come si fa", "spiegami",
        "spiega come", "spiega il", "spiega la", "senza applicar", "senza salvar",
        "example of", "an example", "give me an example", "show me an example", "how does", "how do i",
    };

    /// <summary>True se la query e' una richiesta di esempio/spiegazione (Q&A), non un'azione.
    /// In tal caso ChatJson NON passa i tool al modello -> nessuna proposta d'azione (true-negative).</summary>
    private static bool LooksLikeExampleRequest(string query)
    {
        string s = (query ?? "").Trim().ToLowerInvariant();
        if (s.Length == 0) return false;
        foreach (var v in s_exampleIndicators) if (s.Contains(v)) return true;
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
