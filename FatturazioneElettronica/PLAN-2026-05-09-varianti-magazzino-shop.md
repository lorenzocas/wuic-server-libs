# Plan — 3 moduli in `FatturazioneElettronica`: Varianti, Magazzino, E-commerce

## Context

L'app `FatturazioneElettronica` (`C:\src\Wuic\FatturazioneElettronica`) deve
essere estesa con tre moduli inter-dipendenti:

1. **Gestione taglie/colori** — varianti prodotto (matrice configurabile).
2. **Magazzino / giacenze / disponibilita'** — event-sourced movimenti +
   snapshot running-balance, alimentati da trigger sui documenti
   esistenti (DDT, fatture, ordini).
3. **E-commerce dinamico collegato** — frontend pubblico che consuma
   varianti + giacenze e produce `ordini` nella pipeline FE esistente,
   con pagamenti PayPal.

La skill applicata e' [`app-creation`](../../KonvergenceCore/skills/app-creation/SKILL.md)
**per estensione** (non si tratta di bootstrap di una nuova app, ma di
aggiunta di feature a un'app gia' attiva — stesso decision-ladder a 7
livelli).

Decisioni chiave fatte con l'utente:
- Variant model: **generico configurabile** (`prodotto_attributi` +
  valori + varianti M:N) — supporta TAGLIA/COLORE/MODELLO/MATERIALE/...
- Audience shop: **B2B + B2C** — guest checkout email + B2B login bcrypt
  linked a `clienti.id`.
- Shop host: **Angular app standalone** in `C:\src\Wuic\FatturazioneShop`
  (separata da WuicSite e da FE admin) — build/deploy isolato.
- Payment: **PayPal pattern di WuicSite** (`WuicSite/src/app/pages/pricing/paypal-*`
  + `WuicSite/api/Program.cs`) replicato/portato — server-side capture,
  runtime config via `GET /api/paypal/config`, sandbox/live switch via
  `appsettings.json`, cookie consent gate.

Risultati esplorazione preliminare (workspace exploration come da skill
Step 0b):
- **Nessun pattern variante** preesistente — design from scratch.
- **WideWorldImporters Warehouse** = riferimento per pattern event-sourced
  (`StockItemTransactions` + `StockItemHoldings`).
- **`conservazione_index`** in FE = analog immutable+sealed del pattern
  `magazzino_movimenti` proposto.
- **22 trigger esistenti** computano totali documenti — ZERO movimentano
  stock. I doc-row triggers vanno aggiunti, isolati in nuovo file SQL
  per non interferire con quelli totali.
- **Framework auth** e' cookie-only (`k-user`). Nessun `[AllowAnonymous]`,
  nessun JWT, nessun api-key. Auth shop e' nuovo layer separato.
- **PayPal pattern WuicSite** e' production-grade (server-side capture,
  config runtime-loaded, consent gate) — ottimo da copiare.

---

## Modulo 1 — Varianti Prodotto

### Schema DDL — `dbms/schema/45_varianti.sql`

```
prodotto_attributi          (id PK, codice UQ, descrizione, ordine, attivo, 7-audit)
prodotto_attributi_valori   (id PK, attributo_id FK, codice, descrizione,
                             ordine, hex_color?, attivo, 7-audit; UQ(attributo_id, codice))
prodotti                    ALTER ADD has_varianti BIT NOT NULL DEFAULT 0
prodotto_varianti           (id PK, prodotto_id FK, sku UQ, barcode?, descrizione_estesa,
                             prezzo_vendita_override?, prezzo_acquisto_override?,
                             peso_grammi?, immagine_url?, attivo, 7-audit)
prodotto_varianti_attributi (variante_id FK, attributo_id FK, valore_id FK,
                             PK composite (variante_id, attributo_id))
fatture_inviate_righe       ALTER ADD variante_id INT NULL FK prodotto_varianti(id)
fatture_ricevute_righe      ALTER ADD variante_id INT NULL FK
ddt_righe                   ALTER ADD variante_id INT NULL FK
ordini_righe                ALTER ADD variante_id INT NULL FK
ordini_acquisto_righe       ALTER ADD variante_id INT NULL FK
preventivi_righe            ALTER ADD variante_id INT NULL FK
proforma_righe              ALTER ADD variante_id INT NULL FK
```

`variante_id` e' **NULLABLE** ovunque → retro-compatibile (i prodotti
senza varianti continuano ad usare solo `prodotto_id`).

### Liv 1 archetypes
- `prodotto_attributi` → list+edit standard
- `prodotto_attributi_valori` → list+edit con master-detail su attributo_id
- `prodotto_varianti` → list con default sort `prodotto_id, sku`; edit con
  sub-grid editabile per `prodotto_varianti_attributi`
- 7 colonne audit + soft-delete su tutte (regola db-schema-scaffolding 5-quater)

### Liv 4 ICrudRouteHandler — `ProjectData/Crud/ProdottoVarianti.cs`
- `beforeInsert`: auto-genera SKU `<codice_prodotto>-<TAGLIA>-<COLORE>` se vuoto
- `afterInsert`: aggiorna `descrizione_estesa`, set `prodotti.has_varianti=1`
  se prima riga
- `beforeDelete`: blocca se `fatture_inviate_righe.variante_id=this.id` esiste

### Liv 5 controller — `Controllers/VariantiController.cs`

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/varianti/generate-matrix` | RequireAdmin | Genera cartesiano taglia×colore×... in batch |
| `GET /api/varianti/by-sku/{sku}` | RequireAuth | Lookup SKU (per scanner barcode) |
| `POST /api/varianti/bulk-prezzi` | RequireAdmin | Bulk update override prezzi |

**Stored**:
- `sp_genera_matrice_varianti(@prodotto_id, @attributi_json)` — idempotente
- `sp_aggiorna_descrizione_variante(@variante_id)` — riusato anche da trigger

### Menu (esteso "Anagrafiche")
| Label | URL | Icon |
|---|---|---|
| Attributi varianti | `#/prodotto_attributi/list` | `pi pi-tags` |
| Valori attributi | `#/prodotto_attributi_valori/list` | `pi pi-list` |
| Varianti prodotto | `#/prodotto_varianti/list` | `pi pi-th-large` |

### Integrazione listini (verificato schema esistente 2026-05-09)

Schema attuale `listini_prezzi`:
```
id, listino_id (FK), prodotto_id (FK), prezzo_vendita, prezzo_acquisto,
sconto_default, valid_from, valid_to, attivo, 7-audit
```
**Nessun riferimento a varianti** — il pricing oggi e' al livello
prodotto-padre.

**Strategia adottata = "variante override su prezzo prodotto in listino"**
(retro-compatibile, normalizzata, NULL-safe):

```sql
-- ALTER nel file 45_varianti.sql
ALTER TABLE dbo.listini_prezzi
  ADD variante_id INT NULL CONSTRAINT FK_lp_variante
      REFERENCES dbo.prodotto_varianti(id);
-- UNIQUE NULL-safe (filtered index): una sola riga per (listino, prodotto, variante)
DROP INDEX IF EXISTS UX_listini_prezzi_chiave ON dbo.listini_prezzi;
CREATE UNIQUE INDEX UX_listini_prezzi_chiave
  ON dbo.listini_prezzi(listino_id, prodotto_id, variante_id)
  WHERE cancellato=0 AND attivo=1;
```

**Cascata di risoluzione prezzo** (eseguita da nuova stored
`sp_risolvi_prezzo_variante` + replicata nei controller catalog/checkout):

```
1) listini_prezzi[listino_cliente, prodotto, variante_id]     -- piu' specifico
2) listini_prezzi[listino_cliente, prodotto, variante_id IS NULL]   -- default in listino, valid per tutte le varianti
3) prodotto_varianti.prezzo_vendita_override                  -- master override variante (solo se has_varianti=1)
4) prodotti.prezzo_vendita                                    -- master fallback
```

Stesso pattern per `prezzo_acquisto` e `sconto_default` (3 cascate parallele).

**Esempio** — Listino "Cliente Premium" su prodotto "T-shirt" con varianti S/M/L/XL/XXL:
- INSERT `listini_prezzi(Premium, T-shirt, NULL, 19.90)` → tutte le varianti vendute a 19.90
- INSERT `listini_prezzi(Premium, T-shirt, XXL, 22.90)` → override solo XXL a 22.90
- Quando il cliente Premium aggiunge XXL al carrello → prezzo 22.90
- Quando aggiunge M → prezzo 19.90 (fallback su variante NULL)
- Cliente senza listino assegnato → fallback su prodotti.prezzo_vendita
  (eventualmente con override variante master se presente)

**Stored** (in Modulo 1):
```sql
CREATE PROCEDURE dbo.sp_risolvi_prezzo_variante
  @prodotto_id INT,
  @variante_id INT = NULL,
  @cliente_id INT = NULL,        -- NULL = ospite/no listino → solo master cascade
  @data_riferimento DATE = NULL  -- default GETDATE() per valid_from/valid_to
AS
-- Ritorna 1 row: (prezzo_vendita, prezzo_acquisto, sconto_default, fonte)
-- 'fonte' = 'LISTINO_VARIANTE' | 'LISTINO_PRODOTTO' | 'MASTER_VARIANTE' | 'MASTER_PRODOTTO'
-- per debug/audit pricing
```

Il `cliente.listino_id` (campo gia' esistente o da aggiungere — verificare
schema clienti) determina quale listino applicare. Se cliente senza
listino o ordine guest, salta direttamente alle cascate 3-4 (master only).

### Liv 2 — metadata listini varianti
- Sull'edit di `listini_prezzi`: lookup `prodotto_id` con filtro
  `attivo=1 AND cancellato=0`. Quando seleziono prodotto con
  `has_varianti=1`, **show** colonna `variante_id` con lookup filtrato a
  `prodotto_varianti.prodotto_id=<selected>`. Quando `has_varianti=0`,
  hide colonna variante_id (`mc_hide_in_edit` condizionale o sempre
  nullable senza UI).
- Custom action toolbar `listini_prezzi`: "Importa matrice varianti" →
  per il listino corrente + prodotto, INSERT 1 row per ogni variante con
  `variante_id` valorizzato (parte da prezzo prodotto-padre, l'admin
  poi rifina i singoli).

### E2E test
- `60-varianti-attributi-crud.mjs` — CRUD attributo + 3 valori
- `61-varianti-prodotto-matrix.mjs` — Genera matrice 3×4=12 SKU univoci
- `62-varianti-fattura-binding.mjs` — Riga fattura con variante_id, join descrizione
- `62b-varianti-listino-cascade.mjs` — Verifica cascata pricing:
  setup listino con (1) override variante XXL, (2) default prodotto,
  cliente assegnato; aggiunge varie varianti al cart, asserisce prezzi
  per ogni livello cascada e che `fonte` ritornato e' coerente.

---

## Modulo 2 — Magazzino / Giacenze / Disponibilita'

### Schema DDL — `dbms/schema/46_magazzino.sql`

```
magazzini             (id, codice UQ, descrizione, tipo (FISICO|VIRTUALE|TRANSITO),
                       indirizzo/cap/citta/provincia/responsabile, predefinito BIT,
                       attivo, 7-audit)

magazzino_movimenti   IMMUTABLE EVENT LOG
                      (id BIGINT PK, magazzino_id, prodotto_id, variante_id?,
                       tipo_movimento (CARICO|SCARICO|RETTIFICA|TRASFERIMENTO_OUT|
                                       TRASFERIMENTO_IN|RISERVA|RILASCIO_RISERVA),
                       quantita DECIMAL(19,4) signed, prezzo_unitario?,
                       valore_movimento?, causale,
                       documento_tipo? + documento_id? + documento_riga_id? (soft FK),
                       lotto?, data_movimento, utente_id?, note?)
                      -- NO cancellato/data_modifica — append-only, correzione=nuovo
                         movimento RETTIFICA. Pattern analogo conservazione_index.
                      -- IX su (documento_tipo, documento_id, documento_riga_id)
                      -- IX su (magazzino_id, prodotto_id, variante_id, data_movimento)
                      -- CHECK quantita <> 0
                      -- CHECK tipo_movimento IN (...)

magazzino_giacenze    SNAPSHOT RUNNING BALANCE (upsert via trigger sul movimento)
                      (id, magazzino_id, prodotto_id, variante_id?,
                       quantita_disponibile, quantita_riservata, quantita_ordinata,
                       costo_medio (WAC), ultimo_costo,
                       livello_riordino, livello_target, bin_location?,
                       data_ultimo_movimento, 7-audit)
                      -- UQ(magazzino_id, prodotto_id, variante_id) WHERE cancellato=0

tr_magazzino_movimenti_giacenza  AFTER INSERT su magazzino_movimenti:
                                 MERGE su magazzino_giacenze (somma quantita
                                 per tipo, ricalcola WAC per CARICO).
```

### Magazzino + varianti — semantica esplicita

Domanda chiave: "il magazzino gestisce varianti multiple?". **Si.**
Lo schema delle 3 tabelle (`magazzini`, `magazzino_movimenti`,
`magazzino_giacenze`) ha `variante_id INT NULL` su movimenti e giacenze,
e la chiave naturale e' la **terna** `(magazzino_id, prodotto_id, variante_id)`.

**Casi d'uso supportati**:

1. **Prodotto senza varianti** (`prodotti.has_varianti=0`)
   - Tutte le giacenze hanno `variante_id IS NULL`
   - 1 sola row per `(magazzino, prodotto)` per magazzino
   - Movimenti con `variante_id NULL`

2. **Prodotto con varianti** (`prodotti.has_varianti=1`)
   - **Stock per-variante**: una giacenza distinta per ogni
     `(magazzino, prodotto, variante)` reale. Esempio T-shirt
     3 taglie × 4 colori in 1 magazzino = 12 giacenze.
   - I trigger doc→magazzino richiedono `variante_id NOT NULL` quando
     il prodotto e' `has_varianti=1` — fail-fast con messaggio
     esplicito se la riga del documento omette la variante.
   - Add-to-cart shop, riga fattura, riga DDT: validation lato
     `ICrudRouteHandler` che rifiuta `prodotto_id` con `has_varianti=1`
     ma `variante_id NULL`.

3. **Disponibilita' aggregata cross-varianti** (catalog card):
   - "Quanti T-shirt in totale ho?" =
     `SUM(quantita_disponibile - quantita_riservata) WHERE prodotto_id=@p`
     (somma TUTTE le varianti).
   - Usata in `vw_shop_catalog.quantita_disponibile_aggregata` per
     mostrare badge "In stock" / "Esaurito" sulla card prodotto.
   - Sulla product-detail invece: lista varianti con dispo specifica
     per variante (`SELECT ... WHERE prodotto_id=@p AND variante_id=@v`).

4. **Migration di prodotti pre-esistenti che diventano varianti**
   - Se un prodotto inizialmente `has_varianti=0` con stock=N e
     l'admin attiva `has_varianti=1`, lo stock NULL "generico" resta
     in giacenza (`variante_id IS NULL`) ma diventa **non vendibile**
     da carrello/righe documento (fail validation: prodotto richiede
     variante).
   - Procedura admin: utility `sp_redistribuisci_stock_varianti` 
     (out-of-scope iter1; accetta JSON map `{variante_id: quota}` per
     spostare lo stock NULL a varianti specifiche).

5. **Movimenti senza variante su prodotto variante-aware**
   - Caso edge: utente fa CARICO con `variante_id NULL` su prodotto
     `has_varianti=1`. **Rifiutato dal trigger** con errore esplicito
     "Prodotto X richiede variante: passare variante_id valorizzato".

6. **Trasferimento fra magazzini variant-aware**
   - `POST /api/magazzino/trasferimento` accetta `(from_id, to_id,
     prodotto_id, variante_id?, quantita)` — la coppia `OUT+IN`
     viaggia con la stessa `variante_id` (NULL se prodotto generico).

**Indice critico** (gia' nel DDL):
```sql
CREATE UNIQUE INDEX UX_giacenza_chiave
  ON dbo.magazzino_giacenze(magazzino_id, prodotto_id, variante_id)
  WHERE cancellato=0;
```
NB SQL Server: in un UNIQUE INDEX FILTERED, NULL viene trattato come
valore distinto da altri NULL solo nel filtro; per la chiave UQ se
nessuna riga ha `variante_id IS NOT NULL` con stessi `magazzino+prodotto`,
puoi avere **al massimo 1 row** con `variante_id IS NULL` per quella
coppia (collision desired = "stock generico unico per prodotto-senza-varianti").
Per prodotti con varianti `variante_id` sempre NOT NULL → no collision.

**Stored** specifiche:
- `sp_calcola_disponibilita_per_variante(@prodotto_id, @variante_id)`
  — cross-magazzino lookup specifico (per detail page shop e RISERVA
  al checkout)
- `sp_calcola_disponibilita_aggregata(@prodotto_id)` — cross-magazzino
  + cross-variante (per catalog card)
- Entrambe filtro `cancellato=0` e calcolo
  `(quantita_disponibile - quantita_riservata)` per "vero free stock".

### Trigger doc → magazzino — `dbms/schema/47_doc_to_magazzino_triggers.sql`

File **separato** per non interferire coi 22 trigger totali esistenti
(`04_triggers.sql`):

- `tr_fatture_inviate_righe_to_mag` AFTER INSERT: SCARICO se prodotto BENE
  e `prodotti.has_varianti=1 → richiede variante_id`. **Skip** se la fattura
  ha `ddt_id` collegato (DDT precedente ha gia' scaricato).
- `tr_ddt_righe_to_mag` AFTER INSERT: SCARICO vendita.
- `tr_fatture_ricevute_righe_to_mag` AFTER INSERT: CARICO con WAC
  (idempotenza opt-in via marker `note='AUTO_MAG'` iter1).
- Idempotenza globale: causale `'AUTO_DOC:<doc_tipo>:<doc_id>:<riga_id>'`,
  skip se gia' presente in `magazzino_movimenti`.

### Liv 3 dashboard — `dom_board.boardroute='magazzino_kpi'`

**NON usare il template 2x2 generico**. Riusare come esempi le board
gia' presenti in FatturazioneElettronica (esplorare schema + boardcontent
via SQL su `FatturazioneElettronica_Metadata.dbo.dom_board`):

- `aging_crediti` — 4 KPI tile + chart stacked bar (distribuzione fasce eta')
- `aging_debiti` — analogo a aging_crediti, KPI rischio fornitori
- `cashflow_forecast` — proiezione 90gg con KPI incassi/pagamenti attesi
- `top_clienti` — KPI + bar chart top 10 fatturato anno corrente
- `home` — landing page con tile multipli (riferimento per chrome generale)

Cosa estrarre da questi esempi:
- pattern KPI tile (SPAN bindato via `bindingFunction` con
  `inputs.innerText` + `inputs.color` + `inputs.backgroundColor`)
- pattern chart stacked / pie / bar con `dataOptions` framework-pure
- pattern table list lateral
- chart-list `stacked`/`indexAxis`/`backgroundColor` da
  `dataOptions` (vedi skill `dashboard-replicate-custom-ui` Trappola #19)

Layout proposto magazzino_kpi (libero, NON 2x2):
- riga 1: 3 KPI tile (valore stock totale | n. prodotti sotto-scorta | n. movimenti settimana)
- riga 2: chart bar stacked valore stock per categoria × magazzino
- riga 3: due colonne — list top 10 sotto-scorta | list ultimi 20 movimenti

Build script: `scripts/build-board-magazzino-kpi.mjs` con pattern
**clone-and-adapt** dalla board esistente piu' vicina al layout target
(probabilmente `aging_crediti` per via dei KPI tile + chart stacked).
Vedi skill `dashboard-replicate-custom-ui` per il workflow:
1. SELECT boardcontent dalla board source
2. Sostituisci `boardroute` + `uniqueName` riferimenti datasource
3. Rebind ai datasource del nuovo dominio (`magazzino_giacenze`,
   `magazzino_movimenti`, viste aggregate)
4. Test rendering 1920×1080 (no overflow, KPI leggibili)

### Liv 4 ICrudRouteHandler — `ProjectData/Crud/MagazzinoMovimenti.cs`
- Hard gate: rifiuta UPDATE/DELETE (immutable)
- Validazione segno: CARICO>0, SCARICO<0
- `afterInsert` → bell notification se sotto-scorta (vedi Notifications)

### Liv 5 controller — `Controllers/MagazzinoController.cs`

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/magazzino/movimento-manuale` | RequireAdmin | Carico/scarico/rettifica manuale |
| `POST /api/magazzino/trasferimento` | RequireAdmin | Coppia OUT+IN atomica |
| `GET /api/magazzino/disponibilita?prodotto_id=&variante_id=` | RequireAuth | Aggregato cross-magazzini (consumato dal Modulo 3) |
| `POST /api/magazzino/inventario-fisico` | RequireAdmin | Conteggio differenza → movimenti RETTIFICA |
| `GET /api/magazzino/storico?prodotto_id=&from=&to=` | RequireAuth | Time-series chart |
| `POST /api/magazzino/alert-sotto-scorta` | loopback (scheduler) | Re-check + bell |
| `POST /api/magazzino/riconcilia-snapshot` | loopback (scheduler) | Rebuild giacenze da movimenti |

**Stored**:
- `sp_genera_movimento_da_documento(@doc_tipo, @doc_id, @riga_id)` — usata dai trigger
- `sp_calcola_disponibilita_aggregata(@prodotto_id, @variante_id)` — somma cross-mag
- `sp_inventario_fisico_apply(@magazzino_id, @conteggio_json, @utente_id)` — atomica
- `sp_warmup_giacenze_da_movimenti(@magazzino_id?)` — utility rebuild idempotente

### Liv 7 scheduler — `scripts/2026-05-09-scheduler-magazzino.sql`

Tabella `scheduler` (DB metadati):
| event_name | freq | action |
|---|---|---|
| `fe_magazzino_alert_sotto_scorta` | daily 08:00 | `POST /api/magazzino/alert-sotto-scorta` |
| `fe_magazzino_riconcilia_giacenze` | weekly Sun 03:00 | `POST /api/magazzino/riconcilia-snapshot` |

### Notification-bell
Riusa `INotificationRepository.EnqueueAsync` → `sp_enqueue_notification`:
- type: `magazzino.sotto_scorta`
- target: `/magazzino_giacenze/edit/<id>`
- payload: `{prodotto, quantita, livello_riordino, magazzino_codice}`
- destinatario: `prodotto.utente_creazione` (skip se NULL — no spam)

### Menu — nuovo gruppo top-level "Magazzino" (top-level: 7 → 8 OK)
| Label | URL | Icon |
|---|---|---|
| Magazzino (gruppo) | — | `pi pi-box` |
| ↳ Dashboard | `#/magazzino_kpi/dashboard` | `pi pi-chart-bar` |
| ↳ Magazzini | `#/magazzini/list` | `pi pi-warehouse` |
| ↳ Giacenze | `#/magazzino_giacenze/list` | `pi pi-list` |
| ↳ Movimenti | `#/magazzino_movimenti/list` | `pi pi-history` |

### E2E test
- `63-magazzino-crud.mjs` — anagrafica magazzini
- `64-magazzino-movimento-manuale.mjs` — CARICO + immutability
- `65-magazzino-fattura-decremento.mjs` — trigger doc→mag + bell sotto-scorta
- `66-magazzino-trasferimento.mjs` — atomicita' OUT+IN
- `67-magazzino-inventario-fisico.mjs` — RETTIFICA differenza
- `68-magazzino-dashboard.mjs` — KPI tiles render

---

## Modulo 3 — E-commerce Dinamico (App Standalone + PayPal)

### Schema DDL — `dbms/schema/48_shop.sql`

```
shop_sessions             (id, session_token UQ 64bytes, email?, cliente_id? FK,
                           ip_address, user_agent, cart_json,
                           data_creazione, data_scadenza (default +24h), cancellato)
                          -- IX su token (cancellato=0), IX su scadenza (cleanup)

shop_categorie            (id, parent_id?, codice UQ, descrizione, ordine,
                           immagine_url?, visibile, 7-audit)

shop_prodotti_categorie   (prodotto_id, categoria_id) PK composite

shop_rate_limit           (ip_address, endpoint, contatore, finestra_inizio
                           PK composite — sliding window)

shop_paypal_transactions  AUDIT IMMUTABLE
                          (id, ordine_id FK, paypal_order_id UQ, paypal_capture_id?,
                           amount, currency, status (CREATED|APPROVED|CAPTURED|FAILED|REFUNDED),
                           paypal_response NVARCHAR(MAX), data_creazione, data_capture?)

clienti                   ALTER ADD shop_password_hash VARCHAR(200) NULL  -- bcrypt
                          ALTER ADD shop_attivo BIT NOT NULL DEFAULT 0

ordini                    ALTER ADD origine VARCHAR(20) NOT NULL DEFAULT 'ADMIN'
                                                         (ADMIN|SHOP_GUEST|SHOP_B2B)
                          ALTER ADD shop_session_id INT NULL FK shop_sessions(id)
                          ALTER ADD shop_email VARCHAR(200) NULL
                          ALTER ADD paypal_order_id VARCHAR(50) NULL
                          ALTER ADD pagamento_stato VARCHAR(20)
                                  NOT NULL DEFAULT 'NON_PAGATO'
                                  (NON_PAGATO|IN_ATTESA_PAYPAL|PAGATO|RIMBORSATO)

vw_shop_catalog           VIEW: prodotti.attivo=1 + dispo aggregata cross-mag
                          (consumata da GET /api/shop/catalog)
```

Stato `'BOZZA_SHOP'` aggiunto al CHECK `ordini.stato`.

### Auth pattern shop — `Helpers/ShopAuthGate.cs` (NUOVO, ISOLATO da `k-user`)

```
ShopAuthGate.RequireSession(ctx, out token, out clienteId?)
  -> 401 se header X-Shop-Session manca/scaduta
  -> ritorna (clienteId nullable; NULL=guest)

ShopAuthGate.RequireB2B(ctx, out clienteId)
  -> RequireSession + clienteId NOT NULL

ShopAuthGate.RateLimit(ctx, endpoint, maxPerMin)
  -> sliding window su shop_rate_limit, throw 429 se exceeded
```

### Liv 3 dashboard — `dom_board.boardroute='shop_kpi'`

**NON usare template 2x2** — clone-and-adapt dalle board esistenti
piu' affini al layout shop:
- per chart time-series ordini giornalieri ultimi 30gg → base
  `cashflow_forecast` (gia' fa proiezione temporale, pattern `chart-list`
  con asse data e KPI tile bindati);
- per split origine `ADMIN/SHOP_GUEST/SHOP_B2B` (pie/bar) → pattern
  KPI tile da `top_clienti` (SPAN bindato via `bindingFunction`);
- per list ordini in attesa conferma (`stato='BOZZA_SHOP'`) → pattern
  list/datarepeater dalla board `home`.

Layout proposto shop_kpi (libero):
- riga 1: KPI tile (totale ordini mese | totale fatturato shop | conversione
  carrelli | ordini in attesa conferma)
- riga 2: chart line ordini giornalieri ultimi 30gg
- riga 3: due colonne — chart pie split origine | list "BOZZA_SHOP"

Build script `scripts/build-board-shop-kpi.mjs` con pattern clone-and-adapt:
1. SELECT boardcontent dalla board source (`cashflow_forecast` come base)
2. Sostituisci `boardroute` + tutti i `uniqueName` riferimenti datasource
3. Rebind a `vw_shop_ordini_giornalieri`, `vw_shop_kpi_origine`, `ordini`
   filtrato `origine LIKE 'SHOP_%'`
4. Test rendering + verify `wuic-list-grid` chrome (no overflow)

### Liv 5 controller — `Controllers/ShopController.cs`

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/shop/catalog?categoria=&search=&page=` | anonymous + rate-limit 60/min | Browse pubblico |
| `GET /api/shop/product/{id}` | anonymous + rate-limit | Detail + varianti + dispo |
| `GET /api/shop/categorie` | anonymous + cache 5min | Tree |
| `POST /api/shop/session/start` | anonymous | Crea session_token |
| `GET /api/shop/cart` | session-token | Get cart |
| `POST /api/shop/cart/add` | session-token | Add con stock check |
| `POST /api/shop/cart/remove` | session-token | Rm |
| `POST /api/shop/checkout/init` | session-token | Stock check + RISERVA + crea ordine BOZZA_SHOP + crea PayPal order server-side, ritorna paypal_order_id |
| `POST /api/shop/checkout/capture` | session-token | Capture PayPal server-side, marca pagamento_stato=PAGATO, transitiona ordine a APERTO, bell admin |
| `POST /api/shop/b2b/login` | anonymous | Bcrypt verify, link sessione a cliente_id |
| `GET /api/shop/orders` | B2B | Storico ordini cliente |
| `GET /api/shop/paypal/config` | anonymous | Ritorna `{mode, clientId, currency, configured}` per loader frontend |
| `POST /api/shop/webhooks/paypal` | signature verify | Ricezione eventi PayPal (CAPTURE.COMPLETED, REFUND, ecc.) |
| `POST /api/shop/admin/cleanup-sessions` | loopback (scheduler) | Soft-delete scadute + RILASCIO_RISERVA carrelli |
| `POST /api/shop/admin/alert-abandoned-carts` | loopback | Bell admin aggregato |
| `POST /api/shop/admin/purge-rate-limit` | loopback | DELETE righe vecchie |

**Stored**:
- `sp_shop_checkout_init(@session_token, @email, @shipping_json, @b2b_cliente_id?)` — atomica:
  1. lock cart
  2. valida stock per ogni riga (`disponibile - riservato >= qty`)
  3. genera movimenti `RISERVA` (Modulo 2)
  4. crea/match cliente (B2C: per email; B2B: linked)
  5. INSERT `ordini` (BOZZA_SHOP, pagamento_stato=IN_ATTESA_PAYPAL) + righe
  6. ritorna `{ordine_id, totale, currency}`
- `sp_shop_checkout_capture(@ordine_id, @paypal_capture_id, @paypal_response_json)` — atomica:
  1. UPDATE pagamento_stato=PAGATO, paypal_capture_id
  2. INSERT shop_paypal_transactions audit
  3. transitiona ordine BOZZA_SHOP→APERTO (rilascia RISERVA, crea SCARICO definitivo)
  4. trigger scadenze auto (riusa esistente)
  5. emit bell admin
- `sp_shop_catalog_search(@categoria_id?, @search, @page, @page_size)`
- `sp_shop_cleanup_expired_sessions()`

### Pattern PayPal (replicato da WuicSite)

**Backend** (in FE app, NUOVO — pattern da `WuicSite/api/Program.cs`):
- Sezione `PayPal` in `appsettings.json`: `Mode (sandbox|live)`, `ClientId`,
  `ClientSecret`, `Currency`, `WebhookId`
- Service `Services/Shop/PayPalService.cs`:
  - `CreateOrderAsync(amount, currency, ordine_id)` → POST PayPal `/v2/checkout/orders`
  - `CaptureOrderAsync(paypal_order_id)` → POST PayPal `/v2/checkout/orders/{id}/capture`
  - `VerifyWebhookSignatureAsync(headers, body)` → PayPal webhook verify
- HTTP client + token caching (PayPal access_token short-lived)

**Frontend** (in nuova Angular app `FatturazioneShop`, NUOVO — pattern
copiato da `WuicSite/src/app/pages/pricing/`):
- `services/paypal-loader.ts` (mirror di `WuicSite/.../paypal-loader.ts`)
- `services/paypal.config.ts` (mirror, ma `API_BASE_URL` punta a backend FE)
- Componente `pages/checkout/paypal-button.component.ts` (riusa
  pattern `purchase-dialog.ts`)
- Cookie consent gate (`PaypalConsentRequiredError`) — riusa il pattern.

### Workflow — `_wuic_workflow_graph` "shop_ordine_lifecycle"

Stati: `BOZZA_SHOP` → `IN_REVIEW` → `CONFERMATO` (`stato=APERTO`) →
`EVASIONE` → `EVASO`. Transizioni con stock check, action
`RILASCIA_RISERVA`, action `CREA_DDT`. Riusa
[`workflow-creation/SKILL.md`](../../KonvergenceCore/skills/workflow-creation/SKILL.md).

### Frontend Angular standalone — `C:\src\Wuic\FatturazioneShop`

Nuova Angular app **separata** (utente ha scelto questa opzione):
- Bootstrap come WuicTest tramite `rename-project.ps1` style, ma
  semplificato (no .NET backend — solo Angular SPA che chiama backend FE).
- Pages: `catalog`, `product-detail`, `cart`, `checkout`, `b2b-login`,
  `b2b-orders`, `success`, `cancel`.
- Services: `shop-api.service`, `shop-session.service` (gestisce
  `X-Shop-Session` localStorage), `paypal-loader.service`,
  `cookie-consent.service`.
- Routes: `/`, `/category/:codice`, `/product/:id`, `/cart`, `/checkout`,
  `/checkout/success`, `/checkout/cancel`, `/b2b/login`, `/b2b/orders`.
- Build/deploy isolato, pubblicato a `shop.<dominio>` o `<dominio>/shop`
  (deciso a deploy time, non ai vincoli di iter1).

CORS in `FE/Program.cs`: aggiungere origin `FatturazioneShop`
(dev: `http://localhost:4202`; prod: configurabile in `AppSettings:AllowedOrigins`).

### Liv 7 scheduler — `scripts/2026-05-09-scheduler-shop.sql`

| event_name | freq | action |
|---|---|---|
| `fe_shop_cleanup_sessions` | daily 04:00 | `POST /api/shop/admin/cleanup-sessions` |
| `fe_shop_alert_carrelli_abbandonati` | daily 19:00 | `POST /api/shop/admin/alert-abandoned-carts` |
| `fe_shop_rate_limit_purge` | hourly | `POST /api/shop/admin/purge-rate-limit` |

### Menu — merge "Vendite + Shop" (resta a 8 top-level)
- Vendite (gruppo, esistente)
  - Ordini (admin, esistente)
  - Preventivi (esistente)
  - DDT (esistente)
  - **Shop dashboard** (`#/shop_kpi/dashboard`) ← NUOVO
  - **Shop categorie** (`#/shop_categorie/list`) ← NUOVO
  - **Shop sessioni** (`#/shop_sessions/list`) ← NUOVO

### E2E test
- `70-shop-catalog-anonymous.mjs` — GET catalog + rate-limit 429
- `71-shop-cart-flow.mjs` — start session, add+remove, get cart
- `72-shop-checkout-guest-paypal.mjs` — checkout init + capture (sandbox PayPal mock)
- `73-shop-b2b-login.mjs` — bcrypt + cliente_id linked
- `74-shop-stock-mismatch.mjs` — qty > dispo → 409, no riserva
- `75-shop-admin-confirm.mjs` — admin BOZZA_SHOP→APERTO → riserve→scarico, scadenze
- `76-shop-cleanup-scheduler.mjs` — sessions scadute soft-deleted
- `77-shop-paypal-webhook.mjs` — webhook signature verify + idempotency

---

## Inter-module Integration

### Modulo 1 → Modulo 2
- `magazzino_movimenti.variante_id NULLABLE`. Index UQ NULL-safe.
- Stored `sp_calcola_disponibilita_aggregata`: filtro
  `((@variante_id IS NULL AND variante_id IS NULL) OR variante_id=@variante_id)`.

### Modulo 1+2 → fatture pipeline esistente
- File **separato** `47_doc_to_magazzino_triggers.sql` (no merge con 04 totali).
- Idempotenza via `causale='AUTO_DOC:<doc>:<id>:<riga>'` + skip se gia' presente.
- Skip cascata DDT→fattura: se `fattura.ddt_id` valorizzato, fatture trigger
  skippa (DDT ha gia' scaricato).

### Modulo 2 → Modulo 3
- `sp_shop_checkout_init` chiama `sp_calcola_disponibilita_aggregata` per
  ogni cart line; se insuff → `STOCK_INSUFF` 409.
- Riserva = INSERT movimento `RISERVA` (qty negativa su disponibile,
  positiva su riservata via trigger snapshot).

### Modulo 3 → notifications-bell
| Evento | type | destinatario | target |
|---|---|---|---|
| Nuovo ordine SHOP (post-PayPal capture) | `shop.ordine_pagato` | tutti gli admin | `/ordini/edit/<id>` |
| Carrello abbandonato +24h | `shop.cart_abbandonato` | admin marketing | dashboard |
| Stock alert da checkout | `shop.stock_warning` | utente_creazione prodotto | `/magazzino_giacenze/edit/<id>` |
| Sotto-scorta da movimento doc | `magazzino.sotto_scorta` | utente_creazione prodotto | `/magazzino_giacenze/edit/<id>` |
| Refund PayPal | `shop.rimborso` | admin | `/ordini/edit/<id>` |

### Modulo 3 → ordini/clienti esistenti
- Match cliente in `sp_shop_checkout_init`:
  - B2B: `clienti.id` gia' linked via `shop_sessions.cliente_id`.
  - Guest: cerca per `clienti.email` (CI); se nuovo, INSERT
    `tipo_soggetto='PRIVATO', codice='SHOP-{NEXTVAL}'`.
- `ordini.origine`:
  - `ADMIN`: standard (auto-scadenze a `stato=APERTO`).
  - `SHOP_*`: BOZZA_SHOP → scadenze rinviate al capture+admin confirm.

---

## File da creare / modificare

### Creare

**Modulo 1**:
- `dbms/schema/45_varianti.sql`
- `scripts/2026-05-09-varianti-metadata.sql`
- `Controllers/VariantiController.cs`
- `ProjectData/Crud/ProdottoVarianti.cs`
- `playwright/tests/{60,61,62}-varianti-*.mjs`

**Modulo 2**:
- `dbms/schema/{46_magazzino,47_doc_to_magazzino_triggers}.sql`
- `scripts/{2026-05-09-magazzino-metadata,2026-05-09-scheduler-magazzino}.sql`
- `scripts/build-board-magazzino-kpi.mjs`
- `Controllers/MagazzinoController.cs`
- `Services/Magazzino/{IMagazzinoService,MagazzinoService,StockAlertNotifier}.cs`
- `ProjectData/Crud/MagazzinoMovimenti.cs`
- `playwright/tests/{63..68}-magazzino-*.mjs`

**Modulo 3**:
- `dbms/schema/48_shop.sql`
- `scripts/{2026-05-09-shop-metadata,2026-05-09-shop-workflow,2026-05-09-scheduler-shop}.sql`
- `scripts/build-board-shop-kpi.mjs`
- `Controllers/ShopController.cs`
- `Helpers/{ShopAuthGate,RoleGate}.cs`
- `Services/Shop/{IShopCartService,ShopCartService,ShopCheckoutService,
   ShopRateLimiter,PayPalService}.cs`
- `playwright/tests/{70..77}-shop-*.mjs`
- **Nuova Angular app `C:\src\Wuic\FatturazioneShop`** (intera struttura
  scaffolded con `ng new`, no .NET backend), in particolare:
  - `src/app/pages/{catalog,product-detail,cart,checkout,b2b-login,b2b-orders,success,cancel}/`
  - `src/app/services/{shop-api,shop-session,paypal-loader,cookie-consent}.service.ts`
  - `src/app/services/paypal.config.ts` (mirror WuicSite, API_BASE_URL → FE backend)
  - `angular.json` con configurations dev/npm/production

### Modificare

| File | Modifica |
|---|---|
| `FatturazioneElettronica/dbms/schema/01_anagrafiche.sql` | ALTER prodotti has_varianti, ALTER clienti shop_password_hash + shop_attivo |
| `FatturazioneElettronica/dbms/schema/02_documenti.sql` | ALTER 7 righe-tabelle ADD variante_id, ALTER ordini ADD origine + shop_session_id + shop_email + paypal_order_id + pagamento_stato |
| `FatturazioneElettronica/Program.cs` | CORS aggiungere origin FatturazioneShop dev/prod |
| `FatturazioneElettronica/appsettings.json` | Sezione `PayPal` (Mode, ClientId, ClientSecret, Currency, WebhookId) |
| `FatturazioneElettronica/ProjectData/Crud/Ordini.cs` | `customizeUpdate` BOZZA_SHOP→APERTO: rilascia riserve, scarica magazzino |
| `Wuic/package.json` | Aggiungere `"FatturazioneShop"` a `workspaces` (rispetta skill app-creation Phase 1 Step 5) |
| `KonvergenceCore/skills/app-creation/SKILL.md` | **Aggiornare la sezione Liv 3 dashboard**: NON cablare il template 2x2 come unica via. Documentare che le board reali nelle app del workspace (`aging_crediti`, `aging_debiti`, `cashflow_forecast`, `top_clienti`, `home` di FatturazioneElettronica + le board di CrmApp) sono la sorgente di esempi piu' rappresentativa per layout/KPI tile/chart pattern. Pattern raccomandato: SELECT `boardcontent` dalle board piu' affini al target, clone-and-adapt (skill `dashboard-replicate-custom-ui`). Aggiungere una entry "Trappole verificate" che spiega il caso 2026-05-09: pianificare con template 2x2 generico era piu' povero che riusare board reali gia' esistenti |

---

## Riferimenti riusati

- Skill: [`app-creation`](../../KonvergenceCore/skills/app-creation/SKILL.md) — decision-ladder Liv 1-7 + workspace exploration + provider symmetry + bell pattern + scheduler integration
- Skill: [`db-schema-scaffolding`](../../KonvergenceCore/skills/db-schema-scaffolding/SKILL.md) — DDL audit-aware + soft-delete
- Skill: [`dashboard-boardcontent`](../../KonvergenceCore/skills/dashboard-boardcontent/SKILL.md) + [`dashboard-replicate-custom-ui`](../../KonvergenceCore/skills/dashboard-replicate-custom-ui/SKILL.md)
- Skill: [`workflow-creation`](../../KonvergenceCore/skills/workflow-creation/SKILL.md)
- Skill: [`menu-entry-addition`](../../KonvergenceCore/skills/menu-entry-addition/SKILL.md)
- Skill: [`docs-driven-mjs-tests`](../../KonvergenceCore/skills/docs-driven-mjs-tests/SKILL.md)
- Pattern: `WideWorldImporters.Warehouse.{StockItems,StockItemHoldings,StockItemTransactions}` (event-sourced + snapshot)
- Pattern: `FatturazioneElettronica.dbo.conservazione_index` (immutable + sealed audit, analog magazzino_movimenti)
- Pattern: `INotificationRepository.EnqueueAsync` → `sp_enqueue_notification` (DB metadati) → bell + WebSocket push (gia' integrato 2026-05-09 SDI applier)
- Pattern: `WuicSite/src/app/pages/pricing/{paypal-loader,paypal.config,purchase-dialog}.ts` + `WuicSite/api/Program.cs` (PayPal server-side capture, runtime config, consent gate, webhook verify)
- Stored: `sp_aggregato_lipe`, `sp_calcola_scadenze_fattura` (riferimento pattern)
- Trigger: `tr_fatture_inviate_scadenze_auto`, `tr_fatture_inviate_righe_totali` (riferimento pattern doc-row → effetto laterale)

---

## Verification — End-to-End Scenarios

### Scenario A — Variants attraversano fattura
1. `prodotto_attributi` TAGLIA + valori S/M/L
2. `prodotti` "T-shirt" `has_varianti=1`
3. POST `/api/varianti/generate-matrix` → 3 varianti
4. Riga fattura con `variante_id` → join descrizione "T-shirt M"

### Scenario B — Doc → magazzino auto
1. CARICO 100 unita' su prodotto/variante
2. Fattura con quantita=10 → trigger `tr_fatture_inviate_righe_to_mag` → SCARICO -10 → snapshot=90
3. Fattura ricevuta con marker `note='AUTO_MAG'` qty=50 → CARICO +50, WAC ricalcolato → snapshot=140

### Scenario C — Catalog → checkout PayPal sandbox → fattura
1. 2 varianti S(stock=5), M(stock=0)
2. GET `/api/shop/catalog?search=tshirt` → product card, M out-of-stock badge
3. POST `/api/shop/cart/add` su S qty=3 → OK
4. POST `/api/shop/checkout/init` guest email
   → ordine BOZZA_SHOP, RISERVA, paypal_order_id ritornato
5. Frontend FatturazioneShop avvia PayPal sandbox checkout
6. PayPal webhook → `/api/shop/checkout/capture`
   → pagamento_stato=PAGATO, ordine BOZZA_SHOP→APERTO,
   RILASCIO_RISERVA + SCARICO definitivo, scadenze auto, bell admin
7. Admin: crea DDT da ordine, fattura da DDT → SDI pipeline standard

### Scenario D — Idempotenza scheduler
- `fe_shop_cleanup_sessions` 2× → 2a no-op
- `fe_magazzino_riconcilia_giacenze` → snapshot bit-equal pre-run

### Scenario E — Refund PayPal
- POST PayPal refund → webhook → `pagamento_stato=RIMBORSATO`,
  bell admin, ordine NON cancellato (audit), eventuale RILASCIO da magazzino
  manuale (admin decide)

---

## Iterazioni

**Iter 1 (questo plan)**: tutto sopra.

**Iter 2 (out-of-scope)**:
- Lot tracking / FIFO/LIFO (campo `magazzino_movimenti.lotto` gia' presente)
- Bin location (campo `magazzino_giacenze.bin_location` gia' presente)
- Multi-magazzino selection per cart line al checkout
- Stripe / Nexi / Satispay multi-gateway
- Public REST API esposta a integrazioni terze (OpenAPI swagger)
- Dashboard segmentazione clienti shop
