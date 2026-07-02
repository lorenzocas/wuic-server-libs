# Release Notes — WUIC Framework v1.3.3

**Data**: 21 giugno 2026
**Versione precedente pubblicata**: 1.3.2 (18 giugno 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Release dedicata al **chatbot RAG**: la configurazione del modello LLM è stata semplificata e unificata, l'uso di un modello locale gratuito (Qwen via Ollama) è ora di prima classe, e il motore è stato reso robusto verso le particolarità dei modelli locali — così le azioni proposte sul designer e sui metadati funzionano in modo affidabile anche senza un provider commerciale. Il pacchetto include inoltre un nuovo plugin per **Visual Studio Code**, **WUIC Assistant**, che porta lo stesso approccio agentico dentro l'editor.

---

## 🤖 RAG Chatbot — configurazione LLM unificata

La configurazione del provider LLM del chatbot è stata consolidata attorno a **una sola chiave** e a un elenco esplicito di provider.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **da impostare esplicitamente** (nessun provider di default: se vuoto il chatbot resta in retrieval-only, senza invocare alcun LLM). `ollama` è ora un valore di prima classe: punta a un runtime locale via `rag-llm-base-url`, con formato OpenAI-compatibile.
- `rag-llm-api-key` — **unica fonte** della chiave, indipendente dal provider scelto. Sostituisce la precedente coppia `llm-api-key` / `anthropic-api-key` (che restano accettate solo come fallback di migrazione). Il valore speciale `agent-sdk` usa l'Agent SDK (`claude` CLI) via subscription invece dell'API a consumo, se installato.
- `rag-llm-base-url` — override dell'endpoint; obbligatorio per `ollama` (es. `http://HOST:11434/v1`), opzionale per gli altri provider.
- `rag-llm-default-chat-model` — id del modello per il provider scelto.

Tutte le chiavi restano in **hot-reload** da `appsettings.json`: cambiare provider o modello non richiede restart.

## 🧠 LLM locale gratuito (Qwen via Ollama), zero API key

Il chatbot può ora girare interamente su un **modello locale open** — ad esempio **Qwen** (`qwen2.5-coder:32b`) servito da **Ollama** sulla propria macchina o sulla LAN — senza API key e senza costi per token. Configurazione tipica in `appsettings.json` → `AppSettings`:

```
rag-llm-provider           = ollama
rag-llm-base-url           = http://HOST:11434/v1
rag-llm-api-key            = ollama
rag-llm-default-chat-model = qwen2.5-coder:32b
```

Una guida completa per montare il server Ollama (Windows/Linux, esposizione in LAN, tuning del context, avvio persistente) è inclusa nel pacchetto.

## ⚙️ Azioni del chatbot affidabili anche con modelli locali

Il motore è stato reso tollerante alle particolarità dei modelli locali, che — a differenza dei modelli commerciali — a volte non rispettano alla lettera il formato delle chiamate strumento. Il chatbot ora recupera correttamente l'azione proposta anche quando il modello la emette come testo o con escape JSON non standard. In pratica, le azioni sul designer e sui metadati — pulsanti di tabella (bulk), pulsanti di riga, stili condizionali, callback, iniezione di componenti nel designer — vengono proposte e applicate in modo affidabile anche con un LLM locale.

## 🧩 Assistente agentico in VS Code — WUIC Assistant

Il pacchetto include ora un plugin per **Visual Studio Code**, **WUIC Assistant** (`llm-workspace/plugin/wuic-assistant.vsix`): un assistente che conosce già le convenzioni del framework e opera direttamente sul progetto aperto. Genera componenti Angular (card, dashboard con tile KPI, list-grid con navigazione al form di modifica), componenti alimentati da un endpoint .NET personalizzato, e propone le modifiche ai metadati (stili condizionali, azioni di tabella e di riga, lookup). Ogni scrittura passa da un'anteprima prima della conferma.

Usa lo stesso RAG locale WUIC tramite il server MCP `wuic-rag` (avviato automaticamente) e il grounding già presente nel progetto: non richiede configurazione manuale del server MCP. Il modello LLM è a scelta — **locale via Ollama** (Qwen, zero API key) oppure Anthropic.

Installazione dallo ZIP:

```
code --install-extension llm-workspace/plugin/wuic-assistant.vsix
```

In alternativa lo installa `install-llm-workspace.ps1`. Poi `Ctrl+Shift+P` → **WUIC Assistant: Apri Chat**; il provider si sceglie nelle impostazioni (`wuicAssistant.provider` = `ollama` o `anthropic`).

## 🐛 Bug fix degni di nota

- **Designer — layout multi-colonna**: l'iniezione di un layout a più colonne/aree (es. "3 colonne, ognuna con una griglia") proposta dal chatbot ora popola correttamente tutte le aree. In precedenza, dopo la prima cella, le successive non venivano risolte e i componenti restavano vuoti.
- **Chatbot — whitelist delle route**: quando si chiede di bindare un componente a una route con un nome non esatto (es. "provincie" per "stateprovinces"), il chatbot effettua ora il match semantico e propone l'azione, invece di rispondere erroneamente che l'elenco delle route è in caricamento.

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. Per usare un LLM locale gratuito, valorizzare in `appsettings.json` → `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valore segnaposto, es. `ollama`) e `rag-llm-default-chat-model`.
2. Migrare la chiave del chatbot su `rag-llm-api-key`: le precedenti `llm-api-key` e `anthropic-api-key` continuano a funzionare come fallback, ma la configurazione consigliata usa solo `rag-llm-api-key`.
3. Per usare l'Agent SDK via subscription invece dell'API a consumo, impostare `rag-llm-api-key=agent-sdk` (richiede la `claude` CLI installata).
4. Per l'assistente in VS Code, installare il plugin dallo ZIP: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (oppure lasciarlo installare da `install-llm-workspace.ps1`).
