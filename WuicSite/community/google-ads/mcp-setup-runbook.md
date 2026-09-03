# Google Ads MCP — runbook di attivazione

Stato al 03/09/2026. Account: `586-452-3784` sotto MCC `456-644-9596`.
Livello token: **Accesso Explorer** (produzione, 2.880 op/giorno). Basic richiesta.

## Già fatto

- [x] MCC `Lore@78` 456-644-9596 creato
- [x] Account 586-452-3784 collegato all'MCC
- [x] Developer token emesso (Centro API dell'MCC)
- [x] `pipx` 1.17.2 installato (`python -m pipx`)
- [x] Progetto Google Cloud `wuicdev` (number `588327438026`) + Google Ads API **abilitata** (03/09)
- [x] OAuth: client proprio + ADC con scope `adwords` verificato sul token (03/09)
- [x] **Prima chiamata API riuscita** - API v22 - token associato a `wuicdev`
- [x] Dominio `wuic-framework.com` verificato in Search Console (Prefisso URL, file HTML)
- [x] Server MCP installato (pipx), wrapper `.cmd`, collegato e **verificato** (03/09)
- [x] Estensione in scrittura: server proprio + guardrail testati (03/09)

---

## 1. Progetto Google Cloud

FATTO. Valori dell'account:

```
Project ID      wuicdev
Project number  588327438026     <- domanda 2 del form Basic Access
```

Google Ads API abilitata il 03/09 con
`gcloud services enable googleads.googleapis.com --project=wuicdev`.

## 2. Credenziali OAuth

`gcloud` installato il 03/09, inizializzato su progetto `wuicdev`.

### TRAPPOLA VERIFICATA (03/09): "Questa app e' bloccata"

Il comando "ovvio" **NON funziona**: il client OAuth condiviso di gcloud non e'
autorizzato a richiedere lo scope `adwords`, che Google classifica come sensibile.
Il blocco arriva *prima* della schermata di consenso, quindi sembra un problema di
account o di permessi. Non lo e'. Serve un client OAuth **proprio**.

**A - schermata consenso** (`console.cloud.google.com/apis/credentials/consent`)

```
User type        External
App name         WUIC Ads Integration
Support email    castricolorenzo@gmail.com
Utenti di test   castricolorenzo@gmail.com    <- saltarlo = login rifiutato
```

**B - client** (`console.cloud.google.com/apis/credentials`)
Crea credenziali -> ID client OAuth -> Applicazione desktop -> scarica JSON.
Salvarlo FUORI dal repo (contiene `client_secret`).

**C - comando corretto:**

```bash
gcloud auth application-default login \n  --client-id-file="C:/Users/lollo/.config/gcloud-ads-client.json" \n  --scopes=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform
```

L'avviso "Google non ha verificato questa app" e' atteso e si supera da *Avanzate*.
E' diverso dal blocco: la' Google rifiuta, qua avverte.

> Questo stesso client OAuth dovra' passare la **verifica del brand** quando l'app
> verra' pubblicata in produzione per accelerare la revisione Basic. Il nome scelto
> ora e' quello che comparira' li'.

## 3. Variabili d'ambiente — NON nel repository

Il developer token è una credenziale: chi ce l'ha, unito a un OAuth valido,
opera sulle campagne. `.mcp.json` è versionato, quindi il token **non va lì**,
nemmeno come placeholder da sostituire (si finisce per committarlo).

Impostare a livello utente Windows, una volta sola:

```powershell
setx GOOGLE_ADS_DEVELOPER_TOKEN "<token dal Centro API>"
setx GOOGLE_PROJECT_ID "<project-id>"
```

Poi **riavviare il terminale** (`setx` vale dalle sessioni successive).

Il processo del server MCP eredita l'ambiente del padre, quindi non serve
ripetere le variabili nel file di configurazione — ed è proprio questo che
tiene il segreto fuori dal repo.

## 4. Server MCP (lettura)

Da aggiungere a `.mcp.json` **solo quando i punti 1-3 sono completi**: un
server che non riesce a partire produce un errore di connessione a ogni
avvio di sessione.

```json
"google-ads": {
  "command": "python",
  "args": [
    "-m", "pipx", "run",
    "--spec", "git+https://github.com/googleads/google-ads-mcp.git",
    "google-ads-mcp"
  ]
}
```

Nessun blocco `env`: le variabili arrivano dall'ambiente (punto 3).

Tool esposti: `list_accessible_customers`, `search` (GAQL), `get_resource_metadata`.
**Sola lettura.**

## 5. Estensione in scrittura

Il server ufficiale non scrive. Per avere lettura+scrittura in un unico
componente si forka il repo e si aggiungono tool di mutate sopra il client
library Python già presente:

| Servizio | Uso |
|---|---|
| `CampaignBudgetService` | budget giornalieri |
| `CampaignService` | stato, limiti di offerta |
| `CampaignCriterionService` | negative a livello campagna |
| `AdGroupService` | gruppi di annunci |
| `AdGroupCriterionService` | keyword, negative, offerte |
| `AdGroupAdService` | annunci RSA |
| `AssetService` / `CampaignAssetService` | sitelink, callout |
| `KeywordPlanIdeaService` | volumi di ricerca (dichiarato nel form Basic) |

Poi si punta `--spec` al fork invece che al repo di Google.

### Guardrail da progettare prima di abilitare la scrittura

Un LLM con accesso in mutate a un account che spende denaro reale richiede
limiti espliciti nel codice, non solo buone intenzioni:

- tetto massimo sul budget giornaliero modificabile
- tetto massimo sul cap CPC
- rifiuto delle operazioni su campagne diverse da `586-452-3784`
- nessuna operazione su fatturazione, accessi utente, struttura account
- log di ogni mutate su file locale

## Riferimenti

- Server ufficiale: https://github.com/googleads/google-ads-mcp
- Livelli di accesso: https://developers.google.com/google-ads/api/docs/access-levels
- Verifica del brand: https://developers.google.com/google-ads/api/docs/api-policy/brand-verification


---

## Verifica del brand - stato 03/09

- [x] Blocco 0: dominio verificato in Search Console (proprieta' *Prefisso URL*)
- [x] Blocco 1: developer token associato a `wuicdev` (fatto dalla prima chiamata API)
- [x] Blocco 2: branding **verificato e pubblicato** (03/09)

### File di verifica - NON RIMUOVERE

`googleee63ad8aeab9ac6c.html` esiste in **due** posti, entrambi necessari:

| Posizione | Perche' |
|---|---|
| `WuicSite/public/` | entra nel build, i deploy futuri lo riportano su |
| `C:\inetpub\wwwroot\WuicSite\` sul server | effetto immediato senza deploy |

Se restasse solo sul server, il primo `ng build` che rigenera `dist/` lo
lascerebbe fuori e la proprieta' decadrebbe. Google avverte di non rimuoverlo
neanche dopo la verifica riuscita.

Nota: la proprieta' e' di tipo *Prefisso URL*, quindi **non copre i
sottodomini** (`demo.`, `analytics.`). Per quelli servirebbe una proprieta'
*Dominio* via record DNS TXT.

### Blocco 2 - FATTO

`console.cloud.google.com/apis/credentials/consent` (progetto `wuicdev`):

```
Pubblico    "Pubblica app"   Test -> In produzione
            tipo utente      Esterno
Branding    App name         WUIC Ads Integration
            Home page        https://wuic-framework.com
            Privacy          https://wuic-framework.com/privacy
            Termini          https://wuic-framework.com/terms
            Dominio autoriz. wuic-framework.com
"Verifica branding" -> attendi -> "Pubblica branding"
```

> Serve tipo utente **Esterno** e stato **In produzione** anche per un'app a
> uso interno: la documentazione lo dice esplicitamente perche' contraddice la
> guida generale sulle app interne.
>
> Tutto questo **accelera** la revisione Basic, non sblocca nulla: con Explorer
> l'account e' gia' interrogabile in produzione.


### TRAPPOLA VERIFICATA (03/09): nome app e verifica del brand

Primo tentativo di verifica **fallito** con:

> Il nome dell'app "WUIC Ads Integration" configurato per la schermata per il
> consenso OAuth non corrisponde al nome dell'app indicato nella tua home page.

La verifica del brand **confronta il nome OAuth con quello esposto dal sito**.
La home di `wuic-framework.com` dichiara `og:site_name = "WUIC Framework"`, quindi
un nome inventato per distinguere l'integrazione dal prodotto viene rifiutato.

**Regola**: il nome dell'app OAuth deve essere quello del sito, non un nome
descrittivo dell'integrazione. Verificare prima con:

```bash
curl -s https://<dominio>/ | grep -oE '<meta property="og:site_name" content="[^"]*"'
```

Alla ricomparsa dei problemi scegliere **"Ho risolto i problemi"** (nuova verifica
automatica), NON "Credo che i problemi rilevati non siano corretti", che apre una
revisione manuale con tempi lunghi.


---

## SETUP COMPLETO - 03/09/2026

Verificato end-to-end: query GAQL via MCP sull'account reale, risultati
identici alla stessa query via curl.

```
API version          v25 (usata dalla libreria; v22 risponde ancora)
customer_id          5864523784   (senza trattini)
login-customer-id    4566449596   (solo per chiamate REST diirette)
```

### Come e' cablato

```
.mcp.json  ->  cmd /c scripts\mcp\google-ads-mcp.cmd
                  |
                  +-- legge GOOGLE_ADS_DEVELOPER_TOKEN dal profilo utente
                  |   (setx vale solo per processi avviati DOPO: senza questo
                  |    passaggio il server non vede il token e serve riavviare)
                  |
                  +-- %USERPROFILE%\.localin\google-ads-mcp.exe
                      (pipx installa li', NON e' nel PATH)
```

Nessun segreto in `.mcp.json`. Il file resta pubblicabile.

### Tool disponibili (sola lettura)

- `search_search` - query GAQL: customer_id, fields, resource, conditions, orderings, limit
- `customers_list_accessible_customers`
- `metadata_get_resource_metadata` - da usare PRIMA di comporre una query, per
  scoprire i campi validi di una risorsa invece di indovinarli

### Trappola: le date

Il tool vuole intervalli **finiti ed espliciti**:
`segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`, non `DURING LAST_7_DAYS`.


---

## Estensione in scrittura - 03/09/2026

**Niente fork.** Il server ufficiale ha `ALL_CATEGORIES = ["customers",
"search", "metadata"]` **hardcoded** in `config.py`: il `tools_config.yaml`
accende e spegne quei tre namespace ma non permette di aggiungerne. Forkare
significherebbe modificare il sorgente di Google e rifare il merge a ogni
aggiornamento, con i nostri guardrail sepolti nella loro codebase.

Scelta: **server separato**, un file solo, che riusa lo stesso venv e le stesse
credenziali.

```
scripts/mcp/google_ads_write.py          il server (guardrail in cima)
scripts/mcp/google-ads-write-mcp.cmd     launcher, stessa logica del read-only
.mcp.json -> "google-ads-write"
```

La lettura resta quella ufficiale, aggiornabile con `pipx upgrade` senza conflitti.

### Guardrail (testati)

| Guardrail | Valore |
|---|---|
| Account consentiti | `5864523784` soltanto |
| Budget giornaliero max | 15,00 EUR |
| Cap CPC max | 4,00 EUR |
| Keyword per chiamata | 50 |
| Audit log | `~/.google-ads-write-audit.jsonl` |

La validazione avviene **prima** di costruire il client: un errore non arriva
nemmeno a Google. Verificato che vengono bloccati: account estraneo, budget di
85 EUR (il tipico typo di 8,5), cap CPC di 40 EUR, status inventato.

### Tool

`set_campaign_budget` · `set_campaign_cpc_ceiling` · `set_campaign_status` ·
`add_keywords` · `add_campaign_negative_keywords` · `set_keyword_status` ·
`keyword_ideas`

### TRAPPOLA VERIFICATA (03/09): cosa NON fa l'accesso Explorer

```
Reporting / GAQL         OK con Explorer
Mutate (scritture)       OK con Explorer   (verificato con validate_only)
KeywordPlanIdeaService   RIFIUTATO         authorization_error:
                                           DEVELOPER_TOKEN_NOT_APPROVED
                         "This method is not allowed for use with explorer
                          access. Please apply for basic or standard access."
```

Quindi il tool `keyword_ideas` esiste ma resta inerte finche' non arriva
l'**accesso Basic**. E' l'unica cosa per cui i 5 giorni di attesa contano
davvero: tutto il resto funziona gia'.

### Nota su validate_only

Per provare una scrittura senza applicarla, mettere `validate_only = True`
sulla request. Google valida permessi e payload e non tocca nulla: e' il modo
corretto di testare il percorso di scrittura su un account di produzione.

---

## Search Console via MCP (aggiunto 03/09/2026)

Server `KonvergenceCore/scripts/mcp/google_search_console.py`, launcher
`google-search-console-mcp.cmd`, voce `google-search-console` in `.mcp.json`.
Riusa venv e ADC di Google Ads; dipendenza aggiuntiva installata nel venv:
`google-api-python-client`. API `searchconsole.googleapis.com` abilitata su
`wuicdev`.

**Prerequisito una tantum**: il token ADC deve avere anche lo scope
`webmasters`. Rifare il login sommando gli scope (Google Ads continua a
funzionare):

```powershell
gcloud auth application-default login --client-id-file="C:\Users\lollo\.config\gcloud-ads-client.json" --scopes=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters
gcloud auth application-default set-quota-project wuicdev
```

Tool: `sc_sites`, `sc_sitemaps`, `sc_submit_sitemap`, `sc_delete_sitemap`,
`sc_search_analytics` (page|query|country|device|date, filtri "contiene"),
`sc_inspect_url`. Non disponibili via API: richiesta di indicizzazione,
verifica proprieta'. CLI senza riavvio:

```powershell
C:\src\Wuic\KonvergenceCore\scripts\mcp\google-search-console-mcp.cmd call sc_search_analytics @args.json
# args.json: {"start_date":"2026-09-03","end_date":"2026-09-10","dimensions":["page"],"page_contains":"/docs/"}
```
