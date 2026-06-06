# Release Notes — WUIC Framework v1.3.0

**Data**: 3 giugno 2026
**Versione precedente pubblicata**: 1.2.1 (31 maggio 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Release minor focalizzata sull'integrazione del **chatbot RAG** lato framework: cronologia conversazionale persistita, context management automatico, configurazione hot-reload da `appsettings.json` e schema cross-DBMS auto-applicato al primo avvio. Accanto alla feature principale, alcuni fix di scaffolding metadata e robustezza del repository chat su MySQL/Oracle che si manifestavano in scenari di provisioning DB freschi.

Il chatbot è il primo componente WUIC con stato lato server (`_rag_chat_sessions` + `_rag_chat_messages`) che si estende su tutti e quattro i provider supportati senza configurazione manuale dello schema. Il primo `Ask` rileva il provider, applica in ordine le patch SQL incrementali e parte. Con questa release lo stack di serving può inoltre girare **nativamente su .NET** (motore ONNX in-process), rendendo il deploy al cliente indipendente da Python.

---

## 🤖 RAG Chatbot — gestione contesto end-to-end

Il componente `<wuic-rag-chatbot>` ora persiste sessioni multiple per utente, con storia conversazionale completa, context summarization automatica e configurazione via `appsettings.json`. La feature è opt-in: senza `anthropic-api-key` configurata il chatbot resta inattivo.

**Sessioni**

- Storia conversazionale persistita per utente. La sessione rimane attiva tra reload del browser e cambi di route.
- Popup di selezione sessioni ordinate per `updated_at` decrescente, con titolo derivato dal primo prompt (troncato a 100 char + tooltip full).
- Rinomina inline con persistenza immediata.

**Context management automatico**

- **Visual cue % nel header del chatbot**: cerchio colorato che indica il consumo della finestra di contesto del modello (verde <60% / giallo 60-80% / arancio 80-90% / rosso >90%). Il valore è calcolato dai token effettivamente consumati dall'API Anthropic ed è persistito per turno, così sopravvive al reload.
- **Auto-compact pre-Ask**: quando la cronologia supera la soglia configurabile (default 30 turn) e ci sono almeno 10 turn non ancora riassunti, il backend lancia un compact best-effort in background prima dell'Ask successivo. Il summary aggiornato viene iniettato nel system prompt dei turn futuri.
- **Compact on-demand**: l'utente può forzare un compact via slash command `/compact` o cliccando il cerchio cue.
- **Memory facts**: il modello stesso può "pinnare" fatti high-priority via tool-use (`remember_fact`/`forget_fact`). I fatti restano nel system prompt anche dopo compact (max 20, eviction FIFO).
- **Follow-up questions**: il modello suggerisce fino a 3 domande di approfondimento, renderizzate come chip cliccabili sotto la risposta. Click = popola l'input box (non invia automaticamente).

**Configurazione `appsettings.json`**

- `anthropic-api-key` — chiave API Anthropic, **hot-reload**. Non hard-coded, non committare in repo.
- `anthropic-default-chat-model` — `claude-haiku-4-5-20251001` (200k, default) / `claude-sonnet-4-5-20250929` / `claude-opus-4-5`. Determina la finestra di contesto e il driver del visual cue.
- `anthropic-auto-compact-threshold` — intero >=0, default `30`. Settando `0` si disabilita l'auto-compact (resta disponibile `/compact` manuale).

**Cross-DBMS auto-migration**

Lo schema chat history (5 patch incrementali) viene applicato in modo idempotente al primo `Ask`, sul provider configurato (MSSQL / MySQL / PostgreSQL / Oracle). Nessuno step DBA richiesto sull'installazione esistente.

---

## 🛠️ Azioni che il chatbot può applicare al progetto

Oltre a rispondere in linguaggio naturale, il chatbot può **proporre modifiche concrete** al progetto come chip d'azione con bottone "Applica". Ogni chip mostra cosa farà (route target, codice generato, motivazione) e l'utente decide se applicare. Niente azione viene eseguita senza il click esplicito.

Le tipologie di azione supportate:

- **Azioni toolbar e row** — aggiunge bottoni custom alla toolbar di una `<wuic-list-grid>` o all'azione di singola riga, con callback JavaScript generato. Pattern: "aggiungi un'azione che esporta le righe selezionate in CSV", "metti un bottone Approva sulla riga".
- **Stili condizionali tabella e colonna** — applica classi CSS alla riga o alla singola cella in base a una condizione JS. Pattern: "evidenzia in rosso le righe con scadenza superata", "metti sfondo verde alla cella `stato` quando vale 'OK'".
- **Formula display di colonna** — sostituisce la rappresentazione di una colonna in lista con un template HTML/Angular custom (badge, icona, link, percentuale colorata). Pattern: "mostra `priorità` come badge colorato verde/giallo/rosso".
- **Formula titolo del form** — calcola dinamicamente il titolo dell'edit-form di un record dal contenuto del record stesso. Pattern: "il titolo deve essere `Cliente {ragione_sociale}`".
- **Default value e validazione custom** — genera callback per default value all'apertura del form (precompilazione campi) o per validazione complessa (cross-field, regex personalizzati). Pattern: "default `data_creazione` = oggi", "valida che `email` finisca per @azienda.it".
- **Selection-changed e lifecycle callback** — hook su eventi del form (cambio selezione record, before-save, after-save, after-delete) per side-effect personalizzati: refresh datasource collegati, notifiche, audit log applicativo.
- **Modifiche metadata** — applica modifiche dirette ai metadata di tabella/colonna (caption, ordinamento, nascondi in list/edit, validazioni di base) senza passare per il metadata editor manuale.
- **Snippet SQL nei metadata (super-admin)** — scrive frammenti SQL diretti nei campi metadata che vengono concatenati a runtime nelle query autogenerate: custom JOIN sulla route, custom SELECT clause su colonna, formula colonna calcolata, espressione display di lookup. Pattern: "sulla colonna `total` di `orders` calcola somma `price` × `quantity`", "aggiungi join a `payments` su `invoice_id`". Il chatbot conosce il dialetto del provider attivo (mssql/mysql/postgres/oracle) e genera SQL nel quoting/syntax corretto. Operazione gated D3: richiede privilegi super-admin lato backend, con audit log automatico su `_error__logs` per ogni applicazione.

### 🎨 Azione nuova: layout designer da linguaggio naturale

Quando l'utente si trova sulla pagina **Designer** di una dashboard, il chatbot espone una nuova famiglia di azioni che agisce direttamente sul canvas del designer (non sui metadata persistiti).

Esempi di prompt supportati:

- "aggiungi una grid bindata alla route `cities`" → inietta `DATASOURCE` + `DATAREPEATER` configurati e bindati;
- "crea un layout tabellare 2×2" → inietta una `<table>` 2×2 con celle pronte a ricevere altri componenti;
- "metti uno splitter verticale con 3 aree" → inietta `SPLITTER` configurato;
- "cambia il colore del riquadro in alto a destra in rosso" → modifica la property `backgroundColor` del componente individuato;
- "aggiungi una colonna alla tabella" / "rimuovi la riga 2" → modifica `cols`/`rows` del componente `TABLE` selezionato;
- "rimuovi il KPI Fatturato" → elimina un componente dal canvas tramite il suo nome.

Il chatbot conosce il catalogo completo dei 31 tool del designer (gruppo HTML, DATA, CONTAINER) e le loro proprietà editabili. Quando l'utente menziona una route metadata con nome approssimato ("provincie" invece di "stateprovinces"), il chatbot fa fuzzy-match sulla lista di route disponibili nel progetto e mostra il nome reale risolto nel rationale dell'azione.

Le modifiche restano sul canvas del designer fino al click su "Salva dashboard" — nessuna scrittura DB automatica, l'utente vede sempre l'esito visuale prima di commit. L'undo/redo del designer copre anche le azioni iniettate dal chatbot.

---

## ⚙️ Motore RAG nativo .NET (deploy senza Python)

Lo stack di serving del chatbot RAG può ora girare **interamente su .NET**, senza un server Python separato né virtual environment sulla macchina di destinazione. I modelli di retrieval (embeddings + reranker) sono caricati in-process tramite ONNX Runtime, con accelerazione GPU (CUDA) rilevata automaticamente e fallback trasparente su CPU.

- Attivazione via `appsettings.json`: `rag-use-dotnet-engine=true` seleziona il motore .NET; il default `false` mantiene il comportamento precedente.
- `rag-engine-device` (`auto` / `cpu` / `cuda`) sceglie il device di inferenza; `rag-engine-profile` controlla il livello di redazione delle fonti citate nelle risposte.
- Al primo avvio gli artefatti necessari (modelli ONNX + indice) vengono scaricati on-demand, così il pacchetto base resta leggero.

Risultato pratico: il deploy al cliente è **solo .NET** — nessuna installazione Python né dipendenze native aggiuntive oltre al runtime .NET. La chiamata al modello conversazionale e la pipeline di retrieval e azioni restano identiche tra i due motori.

---

## 🐛 Bug fix degni di nota

- **Documentazione callback allineata al runtime**: il ricettario dei callback descriveva firme non corrispondenti al comportamento effettivo per due casi. Il default value callback scrive il valore nel record (`record[field.mc_nome_colonna] = ...`) e il `return` viene ignorato; la validazione custom riceve `(record, field, vr, wtoolbox)` e comunica l'esito con un `return` boolean (`false` blocca il salvataggio) più `vr.message` per il testo mostrato. Gli esempi precedenti, basati su `validateResult(...)` e su un `return` per il default value, producevano callback che non si applicavano. Documentazione corretta in tutte e cinque le lingue.

- **Affidabilità delle azioni proposte dal chatbot**: per le richieste d'azione il chatbot ora emette in modo deterministico la chip d'azione corrispondente, e ritenta automaticamente in caso di rate-limit transitorio del modello conversazionale invece di degradare silenziosamente a sola risposta testuale.

- **Scaffolder metadata — distinzione `date` vs `datetime` consolidata**: completato il follow-up del fix introdotto in 1.2.1 sui tipi temporali generati. Il parser dei tipi sorgente ora copre anche varianti DDL atipiche (MySQL `DATETIME(0)` senza precision, PostgreSQL `timestamp` bare senza time-zone qualifier, Oracle `TIMESTAMP(n)` con precision esplicita) — tutte continuano a mappare correttamente sull'UI type `datetime` mantenendo il componente time al salvataggio.

- **Suggest sui campi metadata — `mc_suggest_value_callback` ora normalizza il return value**: il callback configurabile lato DB poteva ritornare una promise o un valore sincrono, ma il parser runtime accettava solo il sincrono. Risultato: il suggest non scattava silenziosamente nei callback async. Ora la normalizzazione attende `Promise.resolve(callback(...))` in modo uniforme.

- **Repository chat — `Guid` cross-driver**: il driver MySQL.Data materializza una colonna `CHAR(36)` come `Guid` quando il flag `OldGuids` è `false` (default a partire dalla versione 6.6 del connettore), causando `InvalidCastException` su `GetString`. Stesso rischio su Oracle con storage `RAW(16)`. La lettura del correlation id ora ha una cascata di fallback (`GetGuid` → `GetString` → `GetValue` con switch sul runtime type) — robusta su tutti e quattro i provider indipendentemente dalla configurazione del driver.

- **Repository chat — connessione MySQL non aperta**: il gateway MySQL ritornava una connessione `new MySqlConnection(cs)` senza chiamare `Open()`, in modo asimmetrico rispetto ai gateway PostgreSQL e Oracle. Il primo `ExecuteNonQueryAsync` dello schema auto-apply falliva con "Connection must be valid and open". Aggiunto `OpenConnectionToConnectionString` simmetrico, allineato agli altri provider.

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.2.1 | 1.3.0 |
| Wuic.Webcore | 1.2.1 | 1.3.0 |
| WuicOData | 1.2.1 | 1.3.0 |
| RuntimeEfCore | 1.2.1 | 1.3.0 |
| Wuic.MySqlProvider | 1.2.1 | 1.3.0 |
| Wuic.PostgresProvider | 1.2.1 | 1.3.0 |
| Wuic.OracleProvider | 1.2.1 | 1.3.0 |
| wuic-framework-lib (NPM) | 1.2.1 | 1.3.0 |

---

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. Per **abilitare il chatbot RAG**, aggiungere ad `appsettings.json` la chiave `anthropic-api-key` (e opzionalmente `anthropic-default-chat-model` e `anthropic-auto-compact-threshold`). Il backend rilegge le chiavi in hot-reload — non serve restart.
2. **Nessuno step DBA richiesto** sull'installazione esistente: al primo `Ask` del chatbot, lo schema chat history (`_rag_chat_sessions` + `_rag_chat_messages` con tutte le colonne) viene applicato in modo idempotente sul provider configurato in `MetaDataSQLConnection`. L'auto-migration copre installazioni nuove e parzialmente migrate.
3. Se l'installazione è su **MySQL / PostgreSQL / Oracle**, verificare che la connection string punti al provider corretto e che l'utente abbia i privilegi `ALTER TABLE` sullo schema metadati (necessari una volta sola, al primo avvio).
4. Per **monitorare il consumo del context window**, il cerchio cue % nel header del chatbot è il driver visivo immediato. Sopra 80% conviene un compact manuale (`/compact` o click sul cue) per ridurre la latenza dei turn successivi.
5. Per far girare il chatbot RAG **senza Python** sulla macchina di destinazione, impostare `rag-use-dotnet-engine=true` in `appsettings.json` (opzionalmente `rag-engine-device` e `rag-engine-profile`). Al primo avvio gli artefatti di inferenza vengono scaricati automaticamente.
