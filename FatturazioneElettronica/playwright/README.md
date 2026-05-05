# Suite e2e — FatturazioneElettronica

Test end-to-end ad-hoc per l'app, sulla falsariga del pattern
[`docs-driven-mjs-tests`](../../KonvergenceCore/skills/docs-driven-mjs-tests/SKILL.md)
ma **specifico per questo progetto** (no enterprise TestMaster/TestDetail).

## Cosa testa

Approccio **navigazione vera + data-oriented**, niente mock:

### Anagrafiche (1 test per route, helper riusabile)

Pattern centralizzato in [`_shared/anagrafica-crud-flow.mjs`](_shared/anagrafica-crud-flow.mjs).
Ogni test esegue: navigate `<route>/list` → click +Nuovo → fill form
(inclusi dropdown FK) → save → **SELECT UI** (verify riga in grid via
`findRowByText`) → API verify INSERT → dblclick edit → modifica →
save → **SELECT UI post-edit** → API verify UPDATE → DELETE → **SELECT
UI post-delete** (riga rimossa).

| # | Test                                          | Route          | Note                                                          |
|---|-----------------------------------------------|----------------|---------------------------------------------------------------|
| 01 | `01-anagrafica-clienti-crud.mjs`              | `clienti`        | full text fields                                              |
| 02 | `02-anagrafica-fornitori-crud.mjs`            | `fornitori`      | full text fields                                              |
| 03 | `03-anagrafica-prodotti-crud.mjs`             | `prodotti`       | **dropdown FK** unita_misura + codice_iva (selectByText)      |
| 04 | `04-anagrafica-banche-crud.mjs`               | `banche`         | iban + valuta                                                 |
| 05 | `05-anagrafica-pagamenti-crud.mjs`            | `pagamenti`      | codice_sdi MP05 + giorni_scadenza                             |
| 06 | `06-anagrafica-codici-iva-crud.mjs`           | `codici_iva`     | aliquota numerica                                             |
| 07 | `07-anagrafica-unita-misura-crud.mjs`         | `unita_misura`   | minimal (codice + descrizione)                                |

### Documenti / movimenti / report / import-export

| # | Test                                          | Cosa verifica                                                                                                                      |
|---|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| 08 | `08-creazione-fattura.mjs`                    | Insert testata + riga; **trigger DB** `tr_fatture_inviate_righe_totali` (imp/iva/totale) + `tr_fatture_inviate_numerazione` (numero/anno/progressivo); UI verify list-grid |
| 09 | `09-invio-fattura-sdi.mjs`                    | `POST /api/sdi/generateXml` → XML UTF-8 + namespace SDI + FPR12; `markAsSent` → stato=EMESSA, stato_sdi=INVIATA                       |
| 10 | `10-scadenzario-coerenza.mjs`                 | View `v_scadenzario` JOIN clienti+fatture; soggetto/doc_numero/giorni calcolati; UI archetype `scheduler`                              |
| 11 | `11-reports.mjs`                              | 3 .mrt esistono + parse XML + datasource referenzia tabelle reali; UI route `report-viewer`                                            |
| 12 | `12-import-export-anagrafiche.mjs`            | UI bottoni import/export in toolbar (verifica `md_importable=1` + `md_hide_export_*=0`)                                                |
| 13 | `13-import-movimenti-bancari.mjs`             | Flow `md_action_type=10`: temp table NVARCHAR(MAX) → `sp_movimenti_bancari_import` → parsing date IT/ISO + importo virgola/punto + banca predefinita + batch_id |

## Prerequisiti

1. **Backend** FatturazioneElettronica avviato su `:5100`
   ```pwsh
   cd C:\src\Wuic\FatturazioneElettronica
   dotnet run --urls=http://localhost:5100
   ```

2. **Frontend** Angular su `:4200` (solo per test UI; senza, il dispatcher
   skippa elegantemente i test con `needsUi=true`)
   ```pwsh
   cd C:\src\Wuic\FatturazioneElettronica\wwwroot
   npm install
   npm run serve:npm
   ```

3. **Utente** `admin_test / Test123!` seedato (gia' fatto da
   `seed-roles-users.ps1` durante bootstrap app-creation).

4. **Node.js** + Playwright:
   ```pwsh
   cd C:\src\Wuic\FatturazioneElettronica\playwright
   npm install
   npx playwright install chromium
   ```

## Come si lancia

```pwsh
cd C:\src\Wuic\FatturazioneElettronica\playwright

# tutti i test (default headless)
node dispatcher.mjs

# browser visibile (debug)
node dispatcher.mjs --headed

# solo test 01,02,03 (regex su filename)
node dispatcher.mjs --filter "^0[1-3]"

# stop al primo fail
node dispatcher.mjs --bail

# override URL
node dispatcher.mjs --base-url http://localhost:4201 --backend-url http://localhost:5101
```

## Output

- Console: tabella riepilogo con pass/fail/skip + durata + path screenshot
- File: `screenshots/last-run.json` — risultato strutturato
- File: `screenshots/<timestamp>_<name>.png` — screenshot di ogni test che ne produce uno
- File: `screenshots/FAIL_<id>_<ts>.png` — screenshot automatico al fail

Exit code: `0` se tutti pass/skip, `1` se almeno un fail.

## Struttura

```
playwright/
├── dispatcher.mjs                # orchestrator
├── package.json                  # dep playwright
├── README.md                     # questo file
├── _shared/
│   ├── api-client.mjs           # wrapper su KonvergenceCore/.../backend-api-client.mjs (regola 26 AGENTS)
│   ├── ui-helpers.mjs           # login, navigate, clickNew, fillField, selectDropdownByText, snap, ...
│   ├── sql-helpers.mjs          # query/exec via sqlcmd (per data-oriented assertions su DB)
│   └── test-data.mjs            # generatori deterministici con prefisso _e2e_ + RUN_ID
├── tests/
│   ├── 01-anagrafica-clienti-crud.mjs
│   ├── 02-anagrafiche-lookup-crud.mjs
│   ├── 03-creazione-fattura.mjs
│   ├── 04-invio-fattura-sdi.mjs
│   ├── 05-scadenzario-coerenza.mjs
│   ├── 06-reports.mjs
│   ├── 07-import-export-anagrafiche.mjs
│   └── 08-import-movimenti-bancari.mjs
└── screenshots/                  # output (gitignored)
```

## Convenzioni test

Ogni test e' un modulo ESM con due export:

```js
export const meta = {
  id: '01',                       // ordine + identifier
  name: 'Anagrafica Clienti CRUD',
  area: 'anagrafiche',            // categoria
  needsUi: true,                  // se richiede frontend up (default true)
  needsApi: true                  // se richiede backend up (default true)
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;
  // ... test body ...
  return { /* artifacts */ };
}

export async function cleanup(ctx) {  // opzionale
  // pre-test cleanup di residui run precedenti
}
```

`ctx` esposto:
- `api` — `BackendApiClient` istanza loggata (regola 26 AGENTS)
- `page` — Playwright page navigata e con sessione attiva
- `browser` / `context` — Playwright primitives se servono (es. nuovi tab)
- `baseUrl`, `backendBaseUrl`, `config` — parametri del dispatcher
- `assert(cond, msg)` — throwa Error se false
- `log(msg)` — log indentato grigio

## Aggiungere un test nuovo

1. Crea `tests/NN-<area>-<scope>.mjs` (numero progressivo)
2. Definisci `meta` + `run()`
3. Usa `api.crud*()` per setup/teardown data
4. Usa `page.locator()...click()/fill()` per interazioni UI vere
5. Usa `query()/queryOne()` da `sql-helpers` per assertions data-oriented
   che richiedono SQL diretto (trigger DB, view aggregate, ecc.)
6. Pulizia obbligatoria a fine test (DELETE delle entity create)

## Regole obbligatorie

- **Regola 26 AGENTS**: per chiamare il backend usa SOLO `api.*`
  (= `backend-api-client.mjs`). Mai `page.evaluate(fetch(...))`.
  Il cookie `k-user` non si propaga in modo affidabile dal browser.
- Test data deterministici: prefisso `_e2e_` + `RUN_ID` univoco.
  La pulizia automatica del dispatcher rimuove tutto cio' che ha
  prefisso `_e2e_` su tabelle dati lookup.
- Mai marcare `pass` un test che ha errori console/pageerror.
- Screenshot finale per ogni test: `await snap(page, 'nome-test-end')`.
