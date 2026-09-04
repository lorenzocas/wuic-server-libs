# Campagne — keyword, annunci, struttura

Limiti Google: **headline 30 char**, **description 90 char**, **path 15 char**.
Tutti i testi qui sotto rispettano i limiti (verificati con `check-lengths.mjs`).

URL finale di TUTTI gli annunci: `https://wuic-framework.com/start`
(campagna A usa `?m=competitor` per il message match dell'hero).

---

## Campagna A — Competitor EN · 8,50 €/giorno · **LIVE dal 31/08/2026**

> **Stato: pubblicata e attiva** (campaign id `24190867872`). Budget alzato da
> 6,60 a **8,50 €/giorno** e cap CPC da 1,50 a **2,00 €** per centrare i ~500 €
> di spesa entro il **29/10/2026**, scadenza del credito promozionale da 400 €
> (che si sblocca solo dopo 400 € di spesa effettiva, non è uno sconto).
> Search partners e Rete Display restano **OFF**: rivalutare i partner dopo
> 7-10 giorni solo se il budget non si satura.

Intercetta chi cerca **alternative self-hosted** ai tool cloud. È il pubblico
più caldo: sa già cosa vuole, e il nostro differenziatore (installi e possiedi,
niente per-seat) risponde esattamente all'obiezione che lo sta muovendo.

URL: `https://wuic-framework.com/start?m=competitor`

### Ad group A1 — Retool alternative *(9 keyword, live)*
```
"retool alternative"          "retool pricing"
"retool self hosted"          "retool on premise"
"retool replacement"          "retool license cost"
"alternative to retool"       "retool per seat pricing"
"retool pricing alternative"  <- NON IDONEA: basso volume
```
### ~~Ad group A2 — Budibase / Appsmith / Tooljet~~ — **rimosso 01/09**
> Creato e poi eliminato lo stesso giorno. Tre motivi, in ordine di peso:
> 1. **Il nostro pitch non si applica.** Budibase/Appsmith/Tooljet sono *già*
>    self-hosted, *già* senza costo per utente, *già* "il software resta tuo".
>    I titoli di A (`Self-Hosted, Not A SaaS`, `No Per-Seat Pricing`) contro
>    Retool colpiscono; contro questi rivendicano un vantaggio che loro hanno già.
> 2. **Disponibilità a pagare strutturalmente bassa**: chi li usa ha scelto
>    gratis e open source.
> 3. `"open source retool alternative"` è una **falsa promessa**: WUIC non è
>    open source (stesso problema del callout "Source Code Included").
>
> Bonus: i tre nomi nei titoli hanno fatto scattare il flag Google
> **"Software per computer gratuiti"** (certificazione richiesta), sparito con
> la rimozione del gruppo.

### Ad group A3 — Per-seat pricing pain *(9 keyword, live)*
```
"internal tool builder"                "internal tool no per user pricing"    <- basso volume
"internal tools platform"              "low code without per seat pricing"    <- basso volume
"self hosted low code"                 "on premise internal tool builder"     <- basso volume
"low code on premise"                  "self hosted internal tools platform"
"on premise low code platform"
```
> ⚠️ **Lezione**: le 4 keyword originali del piano erano tutte da **32-35
> caratteri**. Coda troppo lunga → 3 su 4 marcate *Basso volume di ricerca* da
> Google, cioè inerti. La colonna di sinistra (19-28 char) è stata aggiunta per
> questo. Regola: sopra i ~30 caratteri una phrase match in genere non ha volume.

### Ad group A4 — Generic framework (test) *(2 keyword, live)*
```
"web framework"
"angular framework"
```
> Richiesto esplicitamente, con l'intesa di toglierlo se il traffico
> navigazionale diventa troppo alto. **Isolato in un gruppo apposta** così si
> mette in pausa con un click senza toccare A1/A3, e la sua bassa pertinenza non
> trascina giù il Quality Score degli altri. `.net framework` **escluso**: è il
> termine con cui si cerca il runtime Microsoft da scaricare, avrebbe prosciugato
> il budget in ore.
>
> Negative **a livello di gruppo** (non di campagna, per non bloccare A1/A3):
> `tutorial` `tutorials` `course` `courses` `learn` `learning` `beginners`
> `examples` `documentation` `docs` `github` `w3schools` `free` `download`
> `jobs` `salary` `interview` `cheat sheet` `what is` `vs react` `vs vue`
> `vs blazor` `best framework` `list of` `open source` `php` `python` `laravel`
> `django` `nodejs`
>
> Annuncio dedicato che **qualifica in negativo** (`Not A Free Open Source Tool`,
> `Commercial License, Paid`) per scoraggiare il click di chi cerca gratis.

### RSA — headline (max 30 char)
```
Self-Hosted Retool Alternative (30)
Install Once. Own It Forever   (28)
No Per-Seat Pricing, Ever      (25)
Your Servers, Your Data        (22)
€600/Year Flat, Not Per User   (28)
Alternative To Retool          (21)
.NET + Angular, Not a SaaS     (26)
No Cloud Lock-In               (15)
Runs On Windows Or Linux       (23)
From SQL Table To Full App     (26)
Try The Live Sandbox Free      (24)
Built For Back-Office Apps     (26)
Retool Self Hosted Option      (25)
Deploy On Your Own Server      (25)
No Signup For The Demo         (22)
```
### RSA — description (max 90 char)
```
Self-hosted alternative to cloud internal-tool builders. Flat yearly price, no per-seat.   (89)
Point it at your SQL Server: lists, forms, dashboards and reports are generated for you.   (88)
Runs on your Windows or Linux servers. The installed version stays yours, no lock-in.      (86)
Try the live sandbox in your browser — no signup, no credit card, resets every night.      (86)
```
Path: `/self-hosted` · `/alternative`

### Asset a livello campagna (creati 31/08)
**Sitelink** (6) — priorità ai blogpost su AI/chatbot, come da scelta editoriale:
```
AI Chatbot In Your App   -> /blog/rag-chatbot-with-claude-and-bge-m3
What The Chatbot Can Do  -> /blog/rag-chatbot-tool-use-framework-integration
Run It On A Local LLM    -> /blog/local-llm-ollama-mcp-agentic-vscode
See The UI Gallery       -> /gallery
Download Free Apps       -> /downloads
Read The Docs            -> /docs
```
> I sitelink devono puntare allo **stesso dominio** dell'URL finale: dev.to e
> LinkedIn non sono ammessi (rischio *destination mismatch*) — gli stessi
> articoli sono su `/blog`. Per la campagna C usare le varianti `/it/...`.

**Callout** (6): `Self-Hosted, Not A SaaS` · `No Per-Seat Pricing` ·
`MySQL & Oracle` · `Free Demo, No Signup` · `Windows Or Linux` ·
`SQL Server & PostgreSQL`

> Corretti il 01/09: `4 Databases Supported` era generico e frainteso, ora i DB
> sono nominati; `Source Code Included` è stato rimosso perché **falso** in un
> annuncio che porta a `/start` — le free app sono gratis così come distribuite,
> ma il sorgente del framework richiede licenza Developer/Professional.

**Nome attività**: `WUIC Framework` · efficacia annuncio **Eccellente**,
punteggio ottimizzazione campagna **96,7%**.

---

## Campagna B — Categoria EN · 150 €/mese

Chi cerca la **categoria** senza avere in mente un competitor. Intento più
freddo di A ma volume maggiore: qui il messaggio è il "cosa fa", non il "vs chi".

URL: `https://wuic-framework.com/start`

### Ad group B1 — Internal tools builder
```
"internal tools builder"
"internal admin panel builder"
"back office application framework"
"business application framework"
```
### Ad group B2 — CRUD / scaffolding
```
"crud generator sql server"
"generate crud from database"
"database to web app"
"sql table to web form"
"admin panel generator"
```
### Ad group B3 — .NET / Angular low-code
```
"low code .net framework"
"angular admin framework"
"metadata driven framework"
".net internal tools framework"
```

### RSA — headline (max 30 char)
```
SQL Table To Working App       (24)
Generate CRUD From Your DB     (26)
Admin Panels Without Code      (25)
.NET 10 + Angular 21           (21)
Metadata-Driven Framework      (25)
Lists, Forms, Reports: Free    (28)
Back-Office Apps, Faster       (23)
No Boilerplate To Write        (23)
Self-Hosted, Not A SaaS        (23)
Works With 4 Databases         (22)
Try It In Your Browser         (22)
Dashboards And Workflows       (23)
Built-In Report Designer       (23)
Windows And Linux Ready        (23)
Free Apps Included             (18)
```
### RSA — description (max 90 char)
```
Define a SQL table, get lists, edit forms, dashboards, workflows and reports generated.    (88)
Metadata-driven .NET 10 + Angular 21 framework for business apps. Self-hosted, yours.      (85)
SQL Server, PostgreSQL, MySQL or Oracle. Install on Windows or Linux in minutes.           (82)
Live sandbox, no signup. Or download the free CRM, e-invoicing and fleet apps.             (80)
```
Path: `/framework` · `/crud-app`

---

## Campagna C — Italia · 4,50 €/giorno · **LIVE dal 01/09/2026**

> **Stato: pubblicata e attiva** (campaign id `24206487253`). Budget **4,50 €/g**,
> cap CPC **1,80 €** (alzato da 1,00 € il 02/09).
>
> ⚠️ **Le stime CPC di Google erano ottimistiche del ~35%**: per la campagna EN
> stimava 1,45 € e il CPC reale è **1,96 €**. Il cap italiano a 1,00 €, tarato
> sulla stima di 0,77 €, teneva C fuori da ogni asta: a 2 giorni dal lancio
> **0 impressioni** con *QI persa per ranking > 90%* e *QI persa per budget 0%* —
> cioè le aste c'erano e le perdevamo tutte per Ad Rank, non per budget.
> Regola: non tarare il cap sulla stima di Google, tararlo sul CPC reale
> osservato su una campagna analoga.
>
> **Completa (01/09)**: 15 titoli, 4 descrizioni, nome attività `WUIC Framework`,
> **6 sitelink** (`/it/sandbox`, `/it/gallery`, `/it/downloads`, `/it/docs`,
> `/it/pricing`, `/it/comparison` — tutti verificati HTTP 200 con contenuto
> italiano) e **6 callout** italiani, entrambi a livello campagna.
>
> ⚠️ **Trappola verificata**: il wizard rifiuta con *"Valore duplicato"* (errore a
> livello annuncio, non di campo) quando si aggiungono troppi asset in una sola
> volta. Rimedio: salvare **un blocco alla volta**, uscire e rientrare
> nell'editor fra un blocco e l'altro.

Software house e PMI italiane. Tono più concreto sul "quanto tempo risparmi" e
sul fatto che il software resta loro (obiezione ricorrente sul cloud).

URL: `https://wuic-framework.com/it/start` — **landing in italiano, già online**

### Ad group C1 — Gestionale / applicazioni aziendali *(8 keyword, live)*
```
"software gestionale personalizzato"   "gestionale su misura"
"sviluppo gestionale aziendale"        "programma gestionale personalizzato"
"framework applicazioni gestionali"    "sviluppo software gestionale"
  <- NON IDONEA: basso volume          "creare software gestionale"
"applicazioni aziendali su misura"
  <- NON IDONEA: basso volume
```
### Ad group C2 — Low-code IT *(6 keyword, live 01/09)*
```
"piattaforma low code"            "low code italiano"
"low code aziendale"              "piattaforma low code on premise"
"software low code"               "low code senza costo per utente"
```
> `"alternativa a retool italiana"` del piano **non inserita**: formulazione
> innaturale, volume praticamente nullo.

### Ad group C3 — Software house *(5 keyword, live 01/09)*
```
"generatore crud"                 "generatore crud sql server"
"framework crud"                  "framework per software house"
                                  "strumenti sviluppo gestionali"
```

### RSA — headline (max 30 char)
```
Dal DB All'App, Senza Codice   (28)
Framework Gestionali .NET      (25)
Il Software Resta Tuo          (21)
Nessun Costo Per Utente        (22)
€600 L'Anno, Non Per Utente    (27)
Installi Sui Tuoi Server       (23)
Liste, Form, Report Generati   (28)
Provalo Nel Browser            (18)
.NET 10 e Angular 21           (20)
Per Software House e PMI       (23)
Niente Lock-In Cloud           (19)
Windows o Linux                (15)
CRM e Fatturazione Inclusi     (26)
Dashboard e Workflow           (20)
Demo Live Senza Registrarsi    (27)
```
### RSA — description (max 90 char)
```
Definisci una tabella SQL: liste, form, dashboard, report e workflow sono già pronti.      (86)
Framework .NET 10 + Angular 21 per gestionali. Lo installi sui tuoi server ed è tuo.       (85)
Prezzo fisso annuo, nessun costo per utente. SQL Server, PostgreSQL, MySQL, Oracle.        (85)
Prova la demo live senza registrazione, o scarica CRM e fatturazione elettronica free.     (88)
```
Path: `/gestionali` · `/framework`

### Asset a livello campagna (letti dall'account il 01/09)
```
Sitelink              Descrizioni                                          URL
Demo Live Gratuita    Provala nel browser, subito. / Nessuna registrazione. /it/sandbox
App Gratuite Incluse  CRM e fatturazione elettronica. / Installi sui tuoi server. /it/downloads
Galleria Schermate    Schermate di app reali. / Liste, dashboard, report.  /it/gallery
Confronto Alternative WUIC e le altre piattaforme. / Cosa cambia davvero.  /it/comparison
Prezzi e Licenze      Prezzo fisso annuo. / Nessun costo per utente.       /it/pricing
Documentazione        Installazione, DBMS, deploy. / Scritta per sviluppatori. /it/docs
```
**Callout** (6): `Windows o Linux` · `MySQL e Oracle` · `SQL Server e PostgreSQL` ·
`Nessun Costo Per Utente` · `Il Software Resta Tuo` · `Demo Senza Registrazione`

> A differenza di A, i sitelink di C **non includono i blog post AI/chatbot**:
> qui i 6 slot vanno su prodotto e prezzo. E per ora è corretto così: le rotte
> `/it/blog/<slug>` rispondono 200 ma **servono l'articolo in inglese**
> (verificato 01/09: `<title>`, `<h1>` e meta description sono EN). Metterle come
> sitelink di C darebbe annuncio IT → landing EN, la stessa trappola di
> `/start` vs `/it/start`. Riconsiderare **dopo** aver tradotto i post.

> ✅ **Message match verificato (29/08)**: la landing italiana `/it/start`
> esiste ed è online (HTTP 200), con l'hero tradotto — *"Definisci una tabella
> SQL. Ottieni il gestionale."* — e tutte le 16 chiavi `start.*` presenti in
> `it-IT.json`. Quindi la campagna C punta a `/it/start`: annuncio IT → landing IT.
> **Non usare `/start`** per gli annunci italiani (atterrerebbero sull'inglese).

---

## Struttura riassunta

```
Account (stato reale al 01/09/2026)
├── Campagna A — Competitor EN  8,50 €/g → /start?m=competitor      [LIVE]
│   ├── A1 Retool alternative            9 keyword, RSA 15/4
│   ├── A3 Per-seat pricing pain         9 keyword, RSA 15/4
│   └── A4 Generic framework (test)      2 keyword, RSA 15/4, 30 negative
│       (A2 Budibase/Appsmith/Tooljet — creato e rimosso, vedi sopra)
├── Campagna B — Categoria EN (150 €/m) → /start        [NON ANCORA CREATA]
│   ├── B1 Internal tools builder
│   ├── B2 CRUD / scaffolding
│   └── B3 .NET / Angular low-code
└── Campagna C — Italia  4,50 €/g → /it/start                       [LIVE]
    ├── C1 Gestionale / applicazioni aziendali   8 keyword, RSA 15/4
    ├── C2 Low-code IT                           6 keyword, RSA 15/4
    └── C3 Software house                        5 keyword, RSA 15/4
```

> **Perché questa espansione (01/09)**: a 24-48h dal lancio entrambe le campagne
> avevano **0 impressioni** e quota impressioni `—` su tutte e tre le metriche
> (persa per ranking, persa per budget, quota assoluta). Nessuna asta *entrata*,
> quindi né un problema di offerta né di budget: semplicemente troppe poche
> keyword idonee (A: 4 attive, C: 2 attive). Da qui i gruppi nuovi e le varianti
> più corte.

Match type: le keyword sono scritte in **"phrase"** e `[exact]` di proposito.
**Non usare broad match all'inizio**: con 5 €/giorno il broad brucia il budget su
query irrilevanti prima che tu possa costruire la lista negative.

---

## Ricerca keyword — Keyword Planner, 03/09/2026

Fonte: Google Ads Keyword Planner via browser (l'API `KeywordPlanIdeaService` e'
bloccata dal livello Explorer del developer token). Targeting: **Italia, italiano**,
media ricerche mensili ultimi 12 mesi. CPC = offerta parte alta pagina (bassa-alta).

### Cluster 1 — le keyword attualmente in campagna C: confermate inerti

| Keyword | Ricerche/mese | Concorrenza | CPC |
|---|---:|---|---|
| software gestionale personalizzato | 70 | Media | 5,96–14,36 € |
| sviluppo software gestionale | 70 | Bassa | 3,10–13,70 € |
| gestionale su misura | 30 | Media | 7,85–14,03 € |
| piattaforma low code | 20 | Bassa | — |

Le 38 idee generate da questi seed stanno **tutte tra 10 e 70 ricerche/mese**.
Le migliori: `software gestionale su misura` 40, `sviluppo software gestionale
personalizzato` 40, `gestionale personalizzato` 30, `realizzazione software
gestionale` 30. Tutto il resto e' a 10.

**Conclusione**: le 7 impression di C non sono un problema di offerta o budget.
Il cluster semplicemente non ha volume. Con un CPC atteso di 6–14 € su termini da
30/mese, il costo per lead qui e' strutturalmente insostenibile.

### Cluster 2 — head term "gestionale": volume vero, ma intent sbagliato

| Keyword | Ricerche/mese | Concorrenza | CPC |
|---|---:|---|---|
| gestionale / gestionali | 3.600 | Media | 1,96–7,39 € |
| software gestionale (+6 varianti stesso volume) | 1.600 | Alta | 1,97–9,40 € |
| gestionale aziendale | 1.000 | Media | 1,88–8,19 € |
| sistema gestionale | 590 | Media | 1,49–8,17 € |
| software gestionale aziendale | 390 | Alta | 2,22–10,67 € |
| sviluppo applicazioni web | 140 | Media | 3,49–7,93 € |

Volume 20–50x rispetto al cluster 1 e CPC **piu' basso**. Ma su 2.630 idee generate
la coda e' dominata da due tipi di query che per WUIC sono click bruciati:

- **verticali pronti all'uso**: `gestionale magazzino` 1.000, `gestionale
  ristorante` 720, `gestionale parrucchieri` 480, `gestionale palestra` 390,
  `gestionale condominio` 590, `gestionale b&b` 480, `gestionale prenotazioni`
  1.000. Chi cerca questi vuole un prodotto finito, non un framework.
- **brand concorrenti**: zucchetti 1.000, danea/easyfatt 2.900+880+480, mexal/
  passepartout 2.400+590+480, sap 2.400, giobby 3.600, as400 880, smarty 590.
- **contabilita'/fatturazione**: `programma fatturazione elettronica` 1.300,
  `programma contabilita` 720. Stesso problema: cercano un prodotto.

Se si entra su questo cluster servono negative aggressive su verticali, brand e
contabilita', altrimenti il 90% del traffico e' fuori target.

### Cluster 3 — AI per lo sviluppatore: il volume e' qui

| Keyword | Ricerche/mese | Concorrenza | CPC |
|---|---:|---|---|
| claude code | 49.500 | Bassa | 0,61–3,23 € |
| github copilot | 9.900 | Bassa | 0,90–3,89 € |
| vibe coding | 8.100 | Bassa | 0,93–3,91 € |
| cursor ai | 6.600 | Media | 1,01–6,09 € |
| **mcp server** | **3.600** | **Bassa** | **0,96–2,14 €** |
| copilot git | 1.600 | Bassa | 1,15–9,43 € |
| ai coding assistant | 50 | Media | 1,92–6,70 € |
| ai per sviluppatori | 30 | Alta | 1,35–5,74 € |
| low code ai | 10 | Media | 1,39–6,72 € |

Volumi 1–2 ordini di grandezza sopra il cluster 1, con CPC **2–7x piu' bassi**.
`mcp server` e' il match piu' onesto: WUIC un server MCP ce l'ha davvero, l'intent
e' "sviluppatore che sta configurando MCP", 3.600/mese, concorrenza Bassa, CPC max
2,14 €.

Cautela su `claude code` / `github copilot` / `cursor ai`: sono query **brand e
navigazionali**. Volume ed economicita' sono reali, ma chi le cerca vuole quello
specifico prodotto e per giunta un assistente di coding, non un framework per app
gestionali. Senza un annuncio dichiaratamente comparativo e una landing dedicata,
a 4,50 €/giorno il budget si esaurisce in poche ore senza conversioni.

### Cluster 4 — AI generica per l'azienda: da scartare

`intelligenza artificiale per aziende` 140 (Alta, 3,24–22,72 €),
`aziende intelligenza artificiale` 110, `chatbot aziendale` 10,
`chatbot per sito web` 10. Volume basso e CPC alto: il peggior rapporto dei quattro
cluster. `chatbot documenti aziendali`, `assistente ai aziendale` e
`ai gestionale aziendale` non hanno abbastanza dati per essere misurati.

### Lezione

Il set di campagna C era stato scelto a intuito e piu' della meta' era inerte in
partenza. Il volume italiano non sta su "gestionale personalizzato" ma su
**AI/tooling per sviluppatori** — dove peraltro il CPC e' piu' basso. Prima di
aprire un ad group, misurare il seed nel Keyword Planner.

### Cluster 5 — "costruiscilo da solo senza programmare" (zero-code)

Seed: `creare gestionale senza programmare`, `creare software senza programmare`,
`creare app senza programmare`, `come creare un gestionale`, `software per creare
gestionali`, `creare database senza programmare`. Solo **30 idee** generate.

Sottoinsieme on-target (chi vuole costruirsi un gestionale):

| Keyword | Ricerche/mese | Concorrenza | CPC |
|---|---:|---|---|
| come creare un gestionale | 20 | Alta | 1,24–4,13 € |
| come creare un programma gestionale | 20 | Alta | 1,03–3,43 € |
| come creare un software gestionale | 20 | Alta | 1,38–3,51 € |
| come creare un gestionale con excel | 20 | Alta | 1,14–3,96 € |
| come creare un programma gestionale con excel | 20 | Alta | 0,89–2,62 € |
| creare app senza codice | 20 | Alta | 1,45–5,62 € |

~120 ricerche/mese, ma **persona esatta** e CPC 1/4 di quello che C paga oggi.
Le due varianti "con excel" sono il segnale piu' pulito del set: e' qualcuno che
un gestionale se lo sta gia' costruendo a mano e ha sbattuto contro il limite.

Il resto del cluster e' intent sbagliato e va a **negative**: `app android`,
`app ios`, `iphone`, `giochi`, `gratis` (`creare app gratis senza programmare`
110/mese e' il termine piu' grosso del cluster ma sono app mobile gratuite).

### Conclusione sul mercato italiano

Messi in fila i cinque cluster, il quadro e' che **in Italia non esiste domanda di
ricerca ampia e qualificata per quello che WUIC e'**:

- "costruiscilo da solo" (cluster 5): ~120/mese on-target.
- "gestionale personalizzato" (cluster 1): ~200/mese, ma CPC 6–14 €.
- head term "gestionale" (cluster 2): volume vero (3.600 + 1.600 + 1.000) ma e'
  gente che vuole **comprare** un gestionale, non costruirlo. Intent sbagliato.
- AI-developer (cluster 3): i volumi grossi sono brand altrui (claude code 49.500,
  github copilot 9.900, cursor ai 6.600) e `mcp server` 3.600 — quest'ultimo
  **scartato**: il framework non espone un server MCP, i tool AI sono interni.
  Bidderlo sarebbe una promessa falsa.
- AI generica aziendale (cluster 4): volume basso e CPC alto. Scartato.

L'unico termine con volume alto, costo basso e significato allineato e'
**`vibe coding`** (8.100/mese, Bassa, 0,93–3,91 €): letteralmente "costruire
software senza scriverlo". E' pero' un termine largamente informazionale.

Il totale dell'intent italiano davvero indirizzabile e' nell'ordine delle
**200–400 ricerche/mese**. Campagna C puo' essere resa efficiente, non grande.
Il volume sta in inglese — dove campagna A gia' lo dimostra (`web framework`
84 impression / 8 click).

### Posizionamento verificato (03/09/2026)

Correzioni dell'utente su cosa il prodotto e' davvero — da usare per copy e keyword:

- **Non e' un gestionale: e' cio' con cui si fa il gestionale.** Chi cerca
  "software gestionale" vuole comprare un prodotto finito → intent sbagliato.
- **Due pubblici, entrambi validi**: (a) sviluppatori anche non senior e senza
  competenze web specifiche; (b) chi vuole costruirsi il gestionale in autonomia
  senza conoscere ambienti di sviluppo e linguaggi.
- **Zero codice e' vero**, ma e' uno spettro, non un vincolo: i development
  pattern vanno da *Full autogeneration* a *Full custom* sullo stesso progetto.
  Differenziatore contro i no-code: **non c'e' il tetto**.
- **AI shipped al cliente**: chatbot per l'amministratore che crea e personalizza
  le pagine, designer pagine, designer viste DB (vedi /docs), estensione VS Code
  WUIC Assistant, modello di coding locale via Ollama.
- **Non shipped**: un server MCP esposto. I tool AI sono interni.

---

## Ristrutturazione campagna C — 03/09/2026

Applicata via API (server MCP di scrittura, non dalla UI web: in ambiente
automatizzato la pagina resta coperta da un progress indicator e i click
finiscono altrove).

### Nuovo ad group C4 — `206615020064`

**C4 - Costruiscilo da solo (zero codice)** · landing `https://wuic-framework.com/it/`
· display path `/gestionale/zero-codice` · annuncio `823241545879`

Keyword PHRASE (6 su 7 ELIGIBLE, `creare gestionale senza programmare` e'
RARELY_SERVED — 10 ricerche/mese, atteso):

`come creare un gestionale` · `come creare un programma gestionale` ·
`come creare un software gestionale` · `come creare un gestionale con excel` ·
`come creare un programma gestionale con excel` ·
`creare gestionale senza programmare` · `creare app senza codice`

Titoli: Crea Il Tuo Gestionale · Zero Codice, Nessun Tetto · Definisci Tabella,
Hai La UI · Quando Excel Non Basta Piu' · Liste, Report, Workflow · Il Chatbot
Crea Le Pagine · Da Zero Codice A Full Custom · Demo Live Senza Registrarsi ·
Sui Tuoi Server, Dati Tuoi · Gestionale Su Misura Da Te

Il messaggio ruota sul differenziatore verificato: i no-code hanno un **tetto**,
WUIC va da *Full autogeneration* a *Full custom* sullo stesso progetto.

### Landing: perche' `/it/` e non una pagina nuova

Il sito **e' tradotto** (ngx-translate, `it-IT.json` 72 KB): `/it/`,
`/it/features`, `/it/start`, `/it/comparison` servono italiano e sono
prerenderizzate. `/model` e' l'unica pagina senza chiavi i18n — da li' era nata
la diagnosi sbagliata "il sito e' tutto inglese". Una landing dedicata non si
ripaga su ~120 ricerche/mese; `/it/` promette gia' "Definisci una tabella,
ottieni la UI" e ha le CTA.

Nota per dopo: l'hero italiano e' da sviluppatore ("metadata-driven",
"boilerplate"). Chi cerca "come creare un gestionale" non ci si riconosce.
Una riga di copy diversa servirebbe meglio questo pubblico.

### Keyword messe in pausa (intent "voglio che me lo facciate")

`gestionale su misura` · `software gestionale personalizzato` ·
`programma gestionale personalizzato` · `sviluppo gestionale aziendale` ·
`applicazioni aziendali su misura`

Restano attive in "Gruppo di annunci 1" le tre a intent costruttore:
`creare software gestionale`, `sviluppo software gestionale`,
`framework applicazioni gestionali`.

### Negative di campagna (15, BROAD)

`android` · `ios` · `iphone` · `app store` · `google play` · `giochi` · `gioco` ·
`gratis` · `gratuito` · `crack` · `corso` · `tutorial` · `excel gratis` ·
`access` · `wordpress`

Il cluster "senza programmare" e' dominato da chi cerca app mobile gratuite;
`corso`/`tutorial` escludono chi vuole imparare invece che costruire.

### `vibe coding` NON inserito — e perche'

8.100 ricerche/mese contro le 20 delle keyword di C4. Budget e strategia di
offerta sono a livello **campagna** (TARGET_SPEND, 4,50 €/giorno): messo in C si
mangerebbe l'intero budget giornaliero e le keyword da 20/mese non servirebbero
mai. Va in una campagna propria con budget proprio — e' una decisione di spesa
nuova, non una modifica a C.

---

## Interventi post-audit — 03/09/2026 pomeriggio

Audit completo in [audit-2026-09-03.md](audit-2026-09-03.md). Tutto applicato
via API (server MCP di scrittura + CLI `call`) e **riletto via GAQL** dopo:
quanto segue e' lo stato salvato nell'account, non quello tentato.

### Campagna A

- **A4 "Generic framework (test)" in PAUSA** (gruppo `199970372819`). Era il
  100 % della spesa (145 impression, 14 clic, 25,46 €) su termini come `rust web
  frameworks`, `top css frameworks`, `angular material table drag and drop`,
  `codeigniter angular`: nessuna `start_cta` su 14 clic. Tutti i clic venivano
  dalla Germania; Stati Uniti 1 impression in 4 giorni.
- **Nuovo gruppo A5 "CRUD / .NET Angular framework"** (`199930321396`,
  annuncio `823271060287`, landing `/start`, path `/framework/crud`), 13 keyword
  PHRASE prese dal piano B2/B3: `crud generator sql server`, `generate crud from
  database`, `database to web app`, `sql table to web form`, `admin panel
  generator`, `low code .net framework`, `angular admin framework`, `metadata
  driven framework`, `.net internal tools framework`, `business application
  framework`, `angular business application framework`, `internal admin panel
  builder`, `back office application framework`. Alla creazione: 6 ELIGIBLE,
  7 RARELY_SERVED (le piu' lunghe, come previsto), tutte UNDER_REVIEW.
  Titoli nuovi rispetto ad A4: `Admin Panels From Your Schema`,
  `Mobile-Ready Out Of The Box`, `Workflows And Reports Built In`,
  `Commercial License, Not OSS`. Descrizione 1 nomina i 4 DBMS.
- **50 negative BROAD a livello campagna** dai termini di ricerca visti: linguaggi
  e framework di programmazione (`css`, `rust`, `golang`, `python`, `java`,
  `spring`, `flask`, `django`, `react`, `vue`, `svelte`, `ionic`, `bootstrap`,
  `tailwind`, `material`, `jquery`, `javascript`, `typescript`, `swift`, `html`,
  `html5`, `php`, `nodejs`, `laravel`, `codeigniter`, `zuul`, `spfx`, `vite`,
  `mjs`), intent informativo (`what is`, `tutorial(s)`, `example(s)`, `course(s)`,
  `learn`, `cheat sheet`, `benchmark`, `features`, `ide`, `w3schools`, `github`,
  `2022`-`2025`), gratis/OSS (`free`, `open source`), `native`.
  **Non** messe: `best`, `top`, `comparison`, `list`, `mobile` — avrebbero
  bloccato `best retool alternative` e simili.
- Gruppo Retool rinominato **"A1 - Retool alternative"**.

### Campagna C

- Gruppo 1 rinominato **"C1 - Gestionale (intent costruttore)"**.
- **C4** portato da 10 a 15 titoli: `Il Chatbot Crea Le Pagine` → `Il Chatbot
  Configura L'App` (aderente al tool catalog dei docs); aggiunti `Import Da
  Excel In Un Clic`, `Funziona Anche Da Smartphone`, `Report PDF Ed Excel
  Inclusi`, `Workflow Approvativi Pronti`, `Permessi Per Ruolo E Utente` (tutti
  con riscontro nei docs: import, layout mobile, report designer, workflow,
  autorizzazioni).
- **C1**: `Software Gestionale Su Misura` → `Costruisci Il Tuo Gestionale`,
  `Gestionale Personalizzato` → `Crea Il Gestionale Da Te`. I due titoli vecchi
  parlavano a chi vuole *comprare* un gestionale, lo stesso intent delle 5
  keyword messe in pausa stamattina.
- Cap CPC **non toccato** (1,80 €): si alza a 2,50 € solo quando C4 mostra le
  prime impression, come da audit.

### Prezzo e "free" in tutti gli annunci attivi (A1, A3, C1, C2, C3)

- `600 EUR/Year, Not Per User` → **`From 600 EUR/Year, Flat`**;
  `€600 L'Anno, Non Per Utente` / `600 EUR L'Anno, Non Per Utente` → **`Da 600
  EUR L'Anno, Flat`**. Motivo: a 600 € (Developer) non ci sono designer,
  workflow, report e chatbot, che sono Professional a 1.200 €; l'RSA poteva
  accoppiare "600 EUR/Year" con "Built-In Report Designer".
- `Try The Live Sandbox Free` → **`Try The Live Sandbox`**: e' il titolo che
  aveva preso il flag `FREE_DESKTOP_SOFTWARE` nell'annuncio A2.
- Gli annunci restano APPROVED; i soli titoli nuovi sono in revisione
  (`ad_strength` = PENDING finche' Google non ricalcola).
- L'annuncio di A4 (in pausa) conserva i testi vecchi: non serve, il gruppo e'
  fermo.

### Conversioni

`sandbox_open` (5 €) e `start_cta` (2 €) portate a **secondarie**
(`primary_for_goal = false`): restano osservate ma non guidano le offerte ne'
entrano in "Conversioni". `buy_click` e `download_click` restano primarie.

Trappola verificata sul tool: la prima chiamata "riusciva" senza cambiare
nulla perche' `False` e' il default proto3 e il field mask automatico lo
scartava. Il tool ora imposta il mask esplicito.

### Serata 03/09 — asset e landing C4 (via API, tool nuovi)

- **Callout A**: creato `Live Demo, No Signup` (asset `417011201295`) e
  scollegato `Free Demo, No Signup` (`415337226154`). I testi degli asset
  sono immutabili lato API: si crea il nuovo e si scollega il vecchio.
- **Sitelink A** "Run It On A Local LLM": nuovo asset `416831316377` con
  descrizioni `Ollama + VS Code assistant.` / `No cloud, no API bills.`
  (senza "MCP": il framework non espone un server MCP); scollegato il vecchio
  `415227322241`. Riletto via GAQL: 5 sitelink + 6 callout, i due nuovi in
  revisione.
- **Landing C4**: nuova variante hero `/it/start?m=zero-codice` ("Costruisci
  il tuo gestionale, senza scrivere codice" + sottotitolo su tabella → liste,
  form, report, workflow; chatbot che configura le pagine; zero codice senza
  tetto), chiave `start.hero.zeroCodice` in 5 lingue, mapping in `start.ts`.
  L'annuncio C4 (`823241545879`) punta li' invece che a `/it/` (hero
  developer-oriented "metadata-driven").
- **Card RAG Chatbot** (home + Features, 5 lingue): da "interroga il codebase"
  a "configura l'app dalla chat: pagine, voci di menu, colonne, azioni, stili,
  nodi workflow, dopo conferma" — allineata al tool catalog dei docs che gli
  annunci e i sitelink gia' spingevano.

### Non fatto (richiede decisione o strumenti che l'API custom non ha)
- ~~DBMS sul sito~~ **fatto la sera stessa**: home (card Multi-DBMS e Linux
  nativo), pagina Features e docs `getting-started` ora nominano SQL Server,
  MySQL, PostgreSQL e Oracle in tutte e 5 le lingue; `docs:build` rieseguito e
  sito rideployato (verificato live su `/`, `/it/`, `/fr|es|de/features`,
  `/docs/getting-started`, `/it/docs/getting-started`). Gli annunci e i callout
  sono ora coerenti con la landing.
- Test Retool su US/UK con cap 4 € in campagna separata; geografia di A
  (esclusione o gruppo in tedesco); hero `/it/` per il pubblico C4; gruppo AI
  in EN dopo aver misurato i volumi dal browser.

---

## Check 04/09/2026 (manuale: il job schedulato si e' bloccato)

Letto via CLI `gaql` alle ore di pranzo del 4/9.

| | 3/9 | 4/9 (parziale) |
|---|---|---|
| A - Competitor EN | 43 impr, 4 clic, 6,24 EUR (tutto A4 prima della pausa) | 0 impr |
| C - Italia | 0 | 1 impr (C3), 0 clic |

- Approvazioni: tutti gli 8 annunci APPROVED, revisione conclusa; asset nuovi
  `Live Demo, No Signup` e sitelink `Run It On A Local LLM` APPROVED.
  Forza annunci dopo la modifica dei titoli: C1 EXCELLENT, C2/C3/A4 GOOD,
  A1/A3/A5/C4 AVERAGE.
- Dopo la pausa di A4 la campagna A ha fatto 3 impression in totale: 1 su A1,
  2 su A3 con `gitlab self hosted` e `self hosted jira` -> aggiunte le negative
  BROAD `gitlab` e `jira` (52 negative in A). A5: 0 impression dopo ~20 ore.
- C4: 0 impression -> cap di C lasciato a 1,80 EUR come da regola.
- Search Console: sitemap letta il 3/9 18:31, 238 URL inviati, 0 indicizzati
  dalla sitemap; `/it/start` indicizzata via richiesta manuale.

**Job schedulato `ads-check-2026-09-04`**: partito alle 9:30, si e' fermato
dopo Read/ToolSearch/Grep su `C:\src\Wuic\WuicSite` senza mai produrre output:
prompt di permesso per lettura fuori dalla directory del progetto, che in una
sessione senza utente non viene mai risolto. Fix: `additionalDirectories`
(WuicSite, my-workspace) e allow-rule per le CLI dei server MCP in
`KonvergenceCore/.claude/settings.local.json`; i prompt dei job del 6/9 e 10/9
hanno il fallback CLI `gaql` e scrivono i file argomenti in
`scripts/mcp/tmp/` (ignorata da git). Sessione bloccata archiviata.
