# Release Notes — WUIC Framework v1.3.2

**Data**: 14 giugno 2026
**Versione precedente pubblicata**: 1.3.0 (11 giugno 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Release di consolidamento sul **chatbot RAG** introdotto in 1.3.0: il modello conversazionale non è più legato ad Anthropic — qualunque endpoint OpenAI-compatibile, inclusi runtime locali come Ollama con modelli open (Qwen), è ora configurabile e gira senza API key. Accanto a questo, una serie di fix su first-run installer, pacchetto sorgente e scaffolding metadata che si manifestavano su installazioni fresche, e un workspace pronto per gli assistenti AI di coding.

---

## 🤖 RAG Chatbot — provider LLM flessibile (incluso locale e gratuito)

Il modello conversazionale del chatbot è ora provider-agnostico. Oltre ad Anthropic sono supportati gli endpoint **OpenAI-compatibili**, il che include i runtime locali (es. Ollama): è possibile far girare modelli open e gratuiti come **Qwen** sulla propria macchina, **senza API key e senza costi per token**.

- `rag-llm-provider` — `anthropic` (default) / `openai` / `openrouter`. Seleziona il dialetto wire del provider.
- `rag-llm-base-url` — override dell'endpoint; valorizzandolo con l'URL di un server locale (es. `http://localhost:11434/v1` per Ollama) il chatbot parla con il modello in locale.
- `rag-llm-default-chat-model` — id del modello per il provider scelto (es. un modello Qwen su Ollama).
- `llm-api-key` — chiave del provider attivo; per i runtime locali che non la validano basta un valore segnaposto (es. `ollama`). La storica `anthropic-api-key` resta valida quando `rag-llm-provider=anthropic` (zero migrazione).

Tutte le chiavi sono in **hot-reload** da `appsettings.json`: cambiare provider o modello non richiede restart.

**Retrieval più accurato** — il re-ranking dei risultati è stato affinato: il chatbot cita fonti più pertinenti sulle query in linguaggio naturale.

**Notifiche di setup** — al primo utilizzo il motore .NET scarica on-demand i modelli ONNX. Ora l'amministratore riceve nel campanello le notifiche di **inizio / pronto / errore** del download, su tutti e quattro i provider DB, anche quando l'inizializzazione è innescata da una richiesta priva di utente loggato.

**Accelerazione GPU automatica** — su una macchina con GPU NVIDIA l'engine usa la GPU senza installare CUDA: al primo avvio, oltre ai modelli ONNX, scarica on-demand anche il runtime CUDA 12 + cuDNN 9 necessario (~1.8 GB, una volta sola, solo se la GPU è presente) e lo configura da solo. Senza GPU → CPU, nessun download aggiuntivo. Override manuale con `rag-engine-cuda-path`.

---

## 🧩 Workspace pronto per assistenti AI di coding

Le applicazioni generate con il framework includono ora una **raccolta di file markdown di contesto** (descrizione del progetto, convenzioni, regole operative) nella root del workspace. Questi file rendono gli assistenti AI agentici — **Continue**, **Cline**, Cursor e simili — immediatamente consapevoli della struttura e delle convenzioni WUIC, senza installare estensioni proprietarie. Qualunque client che legge il contesto del workspace si comporta come un assistente "WUIC-native".

---

## 🐛 Bug fix degni di nota

- **First-run installer — percorso a script SQL (non-BAK)**: nel provisioning del metadata DB tramite script SQL incrementale (alternativa al restore da `.bak`), il parser dei batch separati da `GO` non gestiva correttamente alcuni separatori, facendo fallire la creazione dello schema su installazioni fresche. Lo splitter è stato corretto e l'install via script completa regolarmente.

- **Pacchetto sorgente — motore RAG .NET non trovato a runtime**: nel pacchetto sorgente (`-src-`) il motore `WuicRagEngine.dll` veniva posizionato nella root del pacchetto, mentre l'eseguibile, avviato da `bin/`, lo cercava accanto a sé — il chatbot RAG non partiva ("WuicRagEngine.dll non trovato"). Il loader ora cerca la cartella `rag-engine/` in più posizioni (output di build, content-root, working directory) e trova il motore in entrambi i layout di deploy.

- **First-run — persistenza della API key del chatbot**: la chiave LLM inserita nel wizard di prima installazione viene ora scritta nell'`appsettings.json` canonico effettivamente letto dal runtime. In precedenza, in alcuni layout, poteva finire in una copia non letta dal processo, lasciando il chatbot senza chiave subito dopo l'installazione.

- **Scaffolding metadata — diagnostica e robustezza**: la generazione dei metadata di alcune tabelle poteva fallire con un messaggio generico ("Unable to scaffold metadata table") che mascherava la causa reale. L'errore SQL effettivo ora risale fino al chiamante, e il caso che lo provocava è risolto.

- **Pacchetto sorgente — notifiche in tempo reale in dev**: nel pacchetto `-src-`, il proxy del dev-server (`ng serve`) non inoltrava le connessioni WebSocket al backend; il canale delle notifiche (`/ws`) andava in timeout e gli aggiornamenti comparivano solo ricaricando la pagina. Il proxy ora inoltra anche i WebSocket: le notifiche arrivano in tempo reale.

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.3.0 | 1.3.2 |
| Wuic.Webcore | 1.3.0 | 1.3.2 |
| WuicOData | 1.3.0 | 1.3.2 |
| RuntimeEfCore | 1.3.0 | 1.3.2 |
| Wuic.MySqlProvider | 1.3.0 | 1.3.2 |
| Wuic.PostgresProvider | 1.3.0 | 1.3.2 |
| Wuic.OracleProvider | 1.3.0 | 1.3.2 |
| wuic-framework-lib (NPM) | 1.3.0 | 1.3.2 |

---

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. Per far girare il chatbot con un **modello locale e gratuito** (es. Qwen via Ollama): impostare `rag-llm-provider=openai`, `rag-llm-base-url` all'endpoint locale (es. `http://localhost:11434/v1`) e `rag-llm-default-chat-model` all'id del modello; valorizzare `llm-api-key` con un segnaposto (es. `ollama`) se il runtime non la valida. Nessun restart: le chiavi sono in hot-reload.
2. Per restare su Anthropic non serve alcuna azione: `anthropic-api-key` continua a funzionare con `rag-llm-provider=anthropic` (default).
3. Il pacchetto **sorgente (`-src-`) è più leggero**: non include più le DLL framework ridondanti nella root, che vengono ricreate da `dotnet build` a partire dai pacchetti NuGet. Scaricando la nuova `-src-` non è richiesta alcuna azione.
4. Al **primo utilizzo del chatbot** con motore .NET, l'amministratore vedrà nel campanello l'avanzamento del download dei modelli ONNX. Attendere la notifica "pronto" prima del primo `Ask`.
5. Le **nuove app** generate includono automaticamente i file di contesto per assistenti AI nella root del workspace; per le app esistenti possono essere rigenerati.
