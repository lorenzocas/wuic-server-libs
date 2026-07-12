# Release Notes — WUIC Framework v1.5.0

**Data**: 11 luglio 2026
**Versione precedente pubblicata**: 1.3.2 (18 giugno 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Release ampia, che raccoglie il lavoro su più fronti. Il **chatbot RAG** ha una configurazione del modello LLM semplificata e unificata, con l'uso di un modello locale gratuito (Qwen via Ollama) ora di prima classe e un motore robusto verso le particolarità dei modelli locali; è incluso un nuovo plugin per **Visual Studio Code**, **WUIC Assistant**, che porta lo stesso approccio agentico dentro l'editor. Arriva il nuovo **Scene3D Designer** per l'authoring di scene 3D dentro l'app — con materiali PBR, effetti shader, luci con bake, fisica e un viewer che lega gli oggetti ai dati — e il rendering è ora selezionabile tra WebGL e **WebGPU**. Il **Workflow Designer** riceve un pacchetto di authoring assistito (template, validazione del grafo, dialog guidati, guida in linea), e il **Dashboard Designer** un pacchetto di miglioramenti all'editing.

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

## 🧊 Scene3D Designer (novità)

Nuovo designer 3D visuale su route `#/scene3d_designer`, con pubblicazione read-only tramite lo Scene3D Viewer (`#/scene3d_viewer/:scene_key`). Consente di comporre una scena tridimensionale e di legarne gli oggetti ai dati dell'app.

- **Palette e import**: primitive (cubo, sfera, piano, cilindro, cono, toro), gruppi, luci, camera, testo 3D e Mesh Repeater (istanze generate dai dati). Import di modelli esterni in glTF/GLB, OBJ, FBX, STL e DAE. La palette è estendibile da metadata con tipi custom.
- **Materiali PBR**: metalness, roughness, emissivo, opacità, wireframe, flat shading e facce; per il materiale fisico anche transmission, IOR, spessore e assorbimento volumetrico (vetro colorato).
- **Effetti shader**: un effetto descritto in JSON (con schema, autocompletamento e vista "a struttura") viene compilato per il renderer attivo; in alternativa, shader GLSL scritti a mano sul renderer WebGL.
- **Illuminazione**: luci di scena con ombre morbide, bake dell'illuminazione statica nei vertex color (unlit) e — sul renderer WebGL — un path tracing di anteprima fotorealistica.
- **Animazioni e fisica**: transport per le clip degli asset importati; fisica per-oggetto opzionale con simulazione Play/Stop nel designer e autoplay nel viewer.
- **Binding ai dati**: ogni oggetto si lega a una route WUIC (con record opzionale) e mappa proprietà visive (etichetta, colore, visibilità) sulle colonne; doppio click su un oggetto bindato nel viewer apre la CRUD del record.
- **Anteprime automatiche**: al salvataggio la scena viene fotografata dal canvas e mostrata come anteprima nell'elenco "Carica scena", senza configurazione né processi esterni.

Le route del designer e del viewer richiedono la feature `scene3d-designer`. Le tabelle di supporto vengono create e aggiornate automaticamente al primo utilizzo, su tutti i database supportati.

## 🖥️ Renderer WebGPU (opt-in)

Il rendering di scene e viewer è ora selezionabile tra **WebGL** (default) e **WebGPU** (attivabile dalla toolbar). Quando WebGPU non è disponibile nel browser, il designer resta automaticamente su WebGL senza alcun intervento. La modalità scelta viene salvata con la scena e ripristinata all'apertura. Con il renderer WebGPU attivo, il bake delle luci gira su GPU (ombre incluse), molto più rapido sulle scene dense; gli shader GLSL scritti a mano e il path tracing restano disponibili sul renderer WebGL.

## 🔀 Workflow Designer — authoring assistito

Il designer di workflow (`#/workflow-designer`) accompagna ora la costruzione di un processo da zero.

- **Template di partenza**: "Nuovo da template" genera un grafo pronto per i pattern comuni (approvazione semplice, coda claim/release, catena a soglie, task paralleli): si scelgono la route principale e — dove serve — il campo di stato, e grafo, azioni e transizioni nascono già collegati.
- **Validazione del grafo**: "Valida grafo" segnala i problemi prima del salvataggio (start senza sbocchi, nodi irraggiungibili, azione senza target, condition vuota, ramo morto, timer o split incompleti, permesso con ruolo inesistente). Cliccando un rilievo il canvas inquadra il nodo. Il salvataggio non è mai bloccato: con problemi aperti compare un riepilogo con "Salva comunque".
- **Configurazioni guidate**: i dialog di timer e task paralleli usano dropdown e un autocompletamento delle route, invece di campi liberi da digitare a memoria.
- **Onboarding e guida**: checklist dei primi passi su un canvas nuovo, tooltip descrittivi sulla palette e una "Guida rapida" con la legenda delle forme e un glossario dei concetti (transizione, guardia, permesso, azione interna).

## 🎨 Dashboard Designer — editing più rapido

- **Snap alla griglia**: attivabile dal menu azioni del designer, mostra la griglia sul canvas e allinea automaticamente trascinamento, ridimensionamento e drop dalla palette. All'attivazione anche gli elementi già presenti nel canvas vengono allineati alla griglia.
- **Flusso normale / assoluto**: nuovo flag nel menu azioni (default: flusso normale, nessun cambiamento per le dashboard esistenti). In modalità assoluta gli elementi droppati si posizionano alle coordinate del drop, fuori dal flusso: ridimensionarne uno non sposta gli altri. Il drop dentro un contenitore usa il contenitore come riferimento di posizione, e il runtime riconosce automaticamente le dashboard salvate in questa modalità.
- **Scorciatoie da tastiera**: `Canc`/`Backspace` elimina l'elemento selezionato, le frecce lo spostano, `Ctrl+Z`/`Ctrl+Y` annulla/ripete. Trascinando un rettangolo di selezione da un'area vuota del canvas si selezionano più elementi: frecce e `Canc` agiscono sull'intera selezione.
- **Import/Export JSON e preset**: la dashboard corrente si esporta come file JSON re-importabile (identico al contenuto persistito), utile per portare layout tra ambienti. I preset salvano layout riusabili con un nome e si riapplicano in un click.
- **Sposta nei tab**: dal menu contestuale di un elemento dentro un tab, *Sposta in nuovo Tab* crea un nuovo tab e ci migra l'elemento (binding e stato preservati); *Sposta in altro tab* — disponibile quando il tabview ha più tab — lo sposta in un tab esistente a scelta. Il tab di destinazione viene attivato automaticamente, così come un tab appena droppato.
- **Importa dashboard/preset in un elemento**: dal menu contestuale di un contenitore si importa una dashboard salvata o un preset direttamente dentro l'elemento; gli identificativi degli elementi importati vengono rigenerati e i riferimenti interni (datasource inclusi) rimappati, senza collisioni con il contenuto esistente.

## 🐛 Bug fix degni di nota

- **Designer — layout multi-colonna**: l'iniezione di un layout a più colonne/aree (es. "3 colonne, ognuna con una griglia") proposta dal chatbot ora popola correttamente tutte le aree. In precedenza, dopo la prima cella, le successive non venivano risolte e i componenti restavano vuoti.
- **Chatbot — whitelist delle route**: quando si chiede di bindare un componente a una route con un nome non esatto (es. "provincie" per "stateprovinces"), il chatbot effettua ora il match semantico e propone l'azione, invece di rispondere erroneamente che l'elenco delle route è in caricamento.
- **Viewer 3D — navigazione tra scene**: aprendo in sequenza scene diverse dallo stesso viewer, ora ciascuna carica la propria scena. In precedenza il viewer poteva continuare a mostrare la prima scena aperta.
- **Editor JSON con schema**: l'editor di codice in modalità JSON offre ora una vista "a struttura" (attivabile con un interruttore) per aggiungere e rimuovere proprietà tipizzate guidate dallo schema, senza scrivere JSON a mano.

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. Per usare un LLM locale gratuito, valorizzare in `appsettings.json` → `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valore segnaposto, es. `ollama`) e `rag-llm-default-chat-model`.
2. Migrare la chiave del chatbot su `rag-llm-api-key`: le precedenti `llm-api-key` e `anthropic-api-key` continuano a funzionare come fallback, ma la configurazione consigliata usa solo `rag-llm-api-key`.
3. Per l'assistente in VS Code, installare il plugin dallo ZIP: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (oppure lasciarlo installare da `install-llm-workspace.ps1`).
4. Per usare lo Scene3D Designer, abilitare la feature `scene3d-designer` nella licenza attiva. Le tabelle di supporto vengono create e migrate automaticamente al primo utilizzo; il renderer WebGPU è opt-in dalla toolbar, con fallback automatico a WebGL.
