# FatturazioneElettronica — Stato bootstrap & passi successivi

> Generato dalla skill
> [skills/app-creation](../../KonvergenceCore/skills/app-creation/SKILL.md)
> il 2026-05-05.

## Cosa e' gia' fatto

- Codice clonato da `C:\src\Wuic\WuicTest` -> `C:\src\Wuic\FatturazioneElettronica`
  via `rename-project.ps1` (assembly/namespace/Angular/launcher rinominati,
  namespace logico `WEB_UI_CRAFTER` preservato come da convenzione).
- `appsettings.json` patchato con `Initial Catalog=FatturazioneElettronica_Metadata`
  e `=FatturazioneElettronica_Data`.
- DB metadati `FatturazioneElettronica_Metadata` clonato da
  `metadataEmpty` con `cleanMetadata` eseguita.
- DB dati `FatturazioneElettronica_Data` creato vuoto.
- Schema applicato (vedi `dbms/schema/`):
  - `01_anagrafiche.sql` — 7 tabelle (clienti, fornitori, prodotti,
    banche, pagamenti, codici_iva, unita_misura).
  - `02_documenti.sql` — 16 tabelle (testate + righe per fatture
    inviate/ricevute, preventivi, ordini, ordini_elettronici, ddt,
    proforma, ordini_acquisto).
  - `03_movimenti.sql` — 3 tabelle (scadenze, prima_nota, corrispettivi)
    + view `v_scadenzario`.
  - `04_triggers.sql` — trigger `INSTEAD OF INSERT` per numerazione
    progressiva (transaction-safe) e trigger `AFTER` per ricalcolo
    totali su tabelle righe.
- Seed lookup applicati (`dbms/seed/01_anagrafiche_lookup.sql`):
  12 codici IVA, 14 unita' di misura, 13 modalita' di pagamento.
- 4 ruoli + 4 utenti di prova seedati su DB metadati:
  - `admin_test` / `Test123!` (superadmin)
  - `commercialista_test` / `Test123!`
  - `imprenditore_test` / `Test123!`
  - `readonly_test` / `Test123!`
- 8 hook `ICrudRouteHandler` in `ProjectData/Crud/`:
  - `FattureInviate.cs` (audit + default anno + stato BOZZA)
  - `FattureRicevute.cs`, `Preventivi.cs`, `Ordini.cs`,
    `OrdiniElettronici.cs`, `Ddt.cs`, `Proforma.cs`,
    `OrdiniAcquisto.cs` (audit + default anno)
  - Discovery automatica via `UtilityHost`.

## Cosa NON e' ancora fatto (TODO operatore)

### 1) `dotnet build` + `npm install` (necessario)

```powershell
cd C:\src\Wuic\FatturazioneElettronica
dotnet restore
dotnet build FatturazioneElettronica.csproj

cd wwwroot
npm install
```

### 2) Avvio backend + frontend

```powershell
# Terminale 1: backend
cd C:\src\Wuic\FatturazioneElettronica
dotnet run

# Terminale 2: frontend
cd C:\src\Wuic\FatturazioneElettronica\wwwroot
npm run serve:npm   # default :4200
```

### 3) Scaffolding metadata via UI (per ogni tabella)

Lo scaffolding metadata WUIC va eseguito via service AsmxProxy
`scaffolding.scaffoldTable`, che richiede il backend in esecuzione
e un cookie `k-user` di un utente loggato (es. `admin_test`).

Workflow consigliato (per ogni route da esporre):

1. Login via `MetaService.login` → ottieni cookie `k-user`.
2. Per ogni tabella in `dbms/schema/`, chiamare:
   ```
   POST /api/Meta/AsmxProxy/scaffolding.scaffoldTable
   {
     "connection": "<DataSQLConnection>",
     "connName":   "DataSQLConnection",
     "db":         "FatturazioneElettronica_Data",
     "table":      "<tabella>",
     "createMenu": false,
     "parentMenuId": 0,
     "schema":     "dbo"
   }
   ```
3. Dopo scaffold, aggiornare descrizioni "parlanti" su
   `_metadati__tabelle.md_display_string` e
   `_metadati__colonne.mc_display_string_in_view/in_edit` (vedi
   skill [`db-schema-scaffolding`](../../KonvergenceCore/skills/db-schema-scaffolding/SKILL.md) Step 5).
4. `MetaService.invalidateMetadataRuntime` finale.

Ordine consigliato (rispetta dipendenze FK):

```
unita_misura, codici_iva, pagamenti, banche
clienti, fornitori, prodotti
fatture_inviate, fatture_inviate_righe
fatture_ricevute, fatture_ricevute_righe
preventivi, preventivi_righe
ordini, ordini_righe
ordini_elettronici, ordini_elettronici_righe
ddt, ddt_righe
proforma, proforma_righe
ordini_acquisto, ordini_acquisto_righe
scadenze, prima_nota, corrispettivi
v_scadenzario  (usare scaffoldView)
```

### 4) Voci menu raggruppate

Seguire skill
[`menu-entry-addition`](../../KonvergenceCore/skills/menu-entry-addition/SKILL.md).
Struttura suggerita basata sugli screenshot Aruba:

```
- Home (route home, archetype custom dashboard)
- Bozze            -> fatture_inviate/list?filterInfo={"stato":"BOZZA"}
- Fatture inviate  -> fatture_inviate/list
- Fatture ricevute -> fatture_ricevute/list
- Vendite/
   - Preventivi          -> preventivi/list
   - Ordini              -> ordini/list
   - Ordini elettronici  -> ordini_elettronici/list
   - DDT                 -> ddt/list
   - Proforma            -> proforma/list
- Acquisti/
   - Ordini              -> ordini_acquisto/list
- Email inviate          -> (livello 5, vedi knowledge-gap)
- Incassi e pagamenti/
   - Scadenzario         -> v_scadenzario/list
   - Prima nota          -> prima_nota/list
   - Corrispettivi       -> corrispettivi/list
   - Riconciliazione     -> (livello 5, vedi knowledge-gap)
- Com. finanziarie/      -> (livello 5, vedi knowledge-gap)
- Anagrafiche/
   - Clienti             -> clienti/list
   - Fornitori           -> fornitori/list
   - Prodotti            -> prodotti/list
   - Banche              -> banche/list
   - Pagamenti           -> pagamenti/list
   - Codici iva          -> codici_iva/list
   - Unita di misura     -> unita_misura/list
- Agenda                 -> (livello 1+3, vedi knowledge-gap)
```

### 5) Dashboard Home (livello 3)

Vedi skill [`dashboard-boardcontent`](../../KonvergenceCore/skills/dashboard-boardcontent/SKILL.md).
4 widget consigliati (riproduzione layout Aruba):

- **Fatturato annuo** — chart bar mensile su `fatture_inviate`
  raggruppato per `MONTH(data_documento)`, anno corrente.
- **Imposte stimate** — datasource su `fatture_inviate`, somma `iva`
  per anno corrente.
- **Stato fatture** — list compact su `fatture_inviate` con
  raggruppamento `stato`, mostra ultime 5 fatture per stato.
- **Notifiche fatture ricevute non lette** — list su
  `fatture_ricevute` filtrato `stato='NON_LETTA'`, ordinato per
  `data_ricezione DESC`.

Validare con
[`scripts/validate-dashboard-boardcontent.ps1`](../../KonvergenceCore/scripts/validate-dashboard-boardcontent.ps1).

### 6) Permessi per ruolo (livello 2)

Tabella `_metadati__tabelle` (DB metadati) — flag per ruolo:

| Ruolo            | md_editable | md_insertable | md_deletable | Note |
|---|---|---|---|---|
| admin            | 1 | 1 | 1 | tutto |
| commercialista   | 1 | 1 | 0 | no delete documenti emessi |
| imprenditore     | 1 | 1 | 1 | full sui propri |
| readonly         | 0 | 0 | 0 | solo lettura |

(Implementazione tramite patch metadata in
`scripts/metadata-patches/`, vedi skill
[`metadata-tables-columns`](../../KonvergenceCore/skills/metadata-tables-columns/SKILL.md).)

## Controller livello 5 implementati

4 controller .NET custom + 5 stored procedure scaffoldate (DB Dati):

### `SdiController` — `/api/sdi/*`
Export XML FatturaPA v1.2.x per Sistema di Interscambio.

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/sdi/generateXml` | POST `{FatturaId}` | genera XML, salva in `wwwroot/Upload/sdi-out/`, aggiorna `fatture_inviate.file_xml` |
| `/api/sdi/markAsSent` | POST `{FatturaId, SdiId, SdiMessaggio}` | aggiorna `stato_sdi='INVIATA'` + sposta `BOZZA → EMESSA` |
| `/api/sdi/download/{fatturaId}` | GET | scarica file XML generato |

Stored: `dbo.sp_sdi_get_fattura_payload(@fattura_id)` — 3 result set (testata, righe, riepilogo IVA).

### `EmailController` — `/api/email/*`
Invio email + log persistente.

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/email/sendInvoice` | POST `{FatturaId, RecipientOverride?, Subject?, Body?, AttachXml=true}` | send via SMTP + log |
| `/api/email/log/{fatturaId}` | GET | storico email per fattura |

Stored: `dbo.sp_email_log_register(@fattura_id, @recipient_to, ...)`.

Config SMTP attesa (in `appsettings.json` AppSettings):
```json
"Smtp:Host": "smtp.example.it",
"Smtp:Port": "587",
"Smtp:User": "user@example.it",
"Smtp:Password": "...",
"Smtp:From": "fatture@example.it",
"Smtp:EnableSsl": "true"
```
Se mancante: graceful degradation, email loggata come `PENDING`.

### `RiconciliazioneController` — `/api/riconciliazione/*`
Import estratto conto + match automatico vs scadenze.

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/riconciliazione/importCsv` | POST `{BancaId, CsvContent, BatchId?}` | parse CSV + insert `movimenti_bancari` |
| `/api/riconciliazione/matchAuto` | POST `{GiorniTolleranza=7, TolleranzaImporto=0.01}` | match auto + crea `prima_nota` |
| `/api/riconciliazione/confirmMatch` | POST `{MovimentoId, ScadenzaId}` | conferma match manuale |
| `/api/riconciliazione/unmatched` | GET | top 200 movimenti non riconciliati |

Stored: `dbo.sp_match_movimenti_scadenze(@giorni_tolleranza, @tolleranza_importo)`.

Formato CSV atteso (header obbligatorio):
```
data_operazione,data_valuta,importo,causale,descrizione,iban_controparte,nome_controparte,riferimento
2026-05-05,2026-05-06,122.00,BONIFICO,Incasso fattura 1/2026,IT60X0542811101,Cliente Test SRL,F1/2026
```

### `ComunicazioniController` — `/api/comunicazioni/*`
LIPE (Liquidazione IVA Periodica) + esterometro.

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/comunicazioni/lipe?anno=2026&trimestre=1` | GET | dati aggregati IVA debito/credito + saldo |
| `/api/comunicazioni/lipeXml?anno=2026&trimestre=1` | GET | XML LIPE (struttura minimale, no firma) |
| `/api/comunicazioni/esterometro?anno=2026&mese=3` | GET | operazioni con controparti estere |

Stored: `dbo.sp_lipe_aggregate_quarter(@anno, @trimestre)`, `dbo.sp_esterometro_period(@anno, @mese)`.

### Limiti scaffolding livello 5 (per produzione)

Questi controller sono **scaffold funzionali** ma NON production-ready
per uso fiscale reale. Da integrare:

- **SDI**: firma CADES-BES (SmartCard/HSM), validazione XSD
  pre-invio, integrazione provider PEC/SDI (Aruba, FatturePEC),
  campi opzionali XSD (`DatiCassaPrevidenziale`,
  `DatiOrdineAcquisto`, `AltriDatiGestionali`), CedentePrestatore
  reale da config azienda.
- **LIPE**: validazione XSD `Trasmissione_Liquidazioni_Periodiche.xsd`,
  firma CADES/XADES, invio via Desktop Telematico AdE / Entratel.
- **Email**: rate limit / retry policy / bounce handling, attach PDF
  rendering della fattura (oltre all'XML).
- **Riconciliazione**: parser MT940 (oltre CSV), fuzzy match su IBAN
  + descrizione (oltre a importo+data), gestione conciliazioni
  multiple (1 movimento → N scadenze).

## Feature ancora rinviate

Vedi `wwwroot/my-workspace/projects/wuic-framework-lib/docs/pages/rag-knowledge-gaps.md`
del repo `KonvergenceCore`:

- **Agenda** — scaffolding scheduler list (livello 1, tabella + scaffold)
- **Servizi aggiuntivi toggle** — UI feature flag
