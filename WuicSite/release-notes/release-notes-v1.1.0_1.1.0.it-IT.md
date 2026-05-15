# Release Notes — WUIC Framework v1.1.0

**Data**: 13 maggio 2026
**Versione precedente pubblicata**: 1.0.20 (12 maggio 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Salto a minor: questa release introduce due capability strutturali che cambiano il modello di deployment del framework.

- **Multi-tenant**: una singola istanza KonvergenceCore instrada dati e metadata di N aziende su N connessioni DB diverse. Configurazione tenant-by-tenant sulle colonne `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta`; routing trasparente a livello applicativo via `TenantContext` (AsyncLocal, sopravvive a Task/scheduler).
- **Menu localizzabile per lingua**: le voci di menu (`mm_display_string_menu`) non contengono più label italiane hard-coded ma chiavi stabili namespaced `menu.<scope>.<slug>`, risolte runtime dalla pipe `translate` di Angular contro `_wuic_translations`. Switch lingua dal selettore utente cambia tutte le voci senza F5.

---

## 🌐 Multi-tenant management

Una singola installazione del framework può ora servire più aziende ("tenant") con dati e metadata fisicamente isolati su DB diversi, senza richiedere repliche dell'applicazione né reverse-proxy partizionati per host.

**Modello dati.** L'instradamento tenant→connessioni è definito su due colonne del DB metadati primario:

- `Aziende.Connessione_DB_Dati` — nome di una entry in `ConnectionStrings` per il DB applicativo del tenant
- `Aziende.CONNESSIONE_DB_Meta` — nome di una entry in `ConnectionStrings` per il DB metadati del tenant

Le colonne contengono il **nome** della entry, non la stringa letterale. Rotazione credenziali via editing `appsettings.<env>.json`, senza toccare il DB.

**Attivazione.** Flag in `appsettings.json` (sezione `AppSettings`):

```json
"multiConnectionEnabled": "true"
```

Con flag `false` (default) il comportamento resta single-tenant, identico alle release precedenti. Con flag `true` ogni richiesta HTTP autenticata risolve l'`AziendaId` dall'utente loggato e instrada `GetOpenConnection` alle connection string del tenant corrispondente.

**Routing transparente.** Tutti i punti di accesso a DB del framework (`MetaService.*`, scheduler, scaffolding, AsmxProxy CRUD, callback custom) consultano `TenantScope.CurrentAziendaId` via `AsyncLocal`, propagato dal middleware HTTP post-authenticate. Job background e callback custom dichiarano il tenant esplicitamente con `using (TenantScope.Push(aziendaId)) { ... }` quando partono fuori dal contesto di request.

**Cache tenant-aware.** Le chiavi `Application[]` server-side e i cache locali metadata vengono automaticamente suffissate per `AziendaId` quando il flag è attivo, evitando bleed di metadata tra tenant.

**Login routing.** Tabella `_login_index(username_hash, id_azienda)` sul DB primario mappa username → tenant per il fallback di `MetaService.login`: dopo autenticazione, il cookie `k-user` porta `azienda_id` come parte del payload e il middleware crea il `TenantScope` corretto a ogni richiesta successiva.

**Scaffold propagation.** L'azione "Scaffold tabella" propaga in modo idempotente le metadata della tabella a tutti i tenant elencati in `Aziende`. La propagazione gira con `TenantScope` esplicito su ogni target ed è idempotente: ri-eseguibile, applica solo le modifiche mancanti.

**File preconfigurati nel pacchetto:**

- `appsettings.multi-tenant.mssql.json` / `appsettings.multi-tenant.mysql.json` — environment self-contained con 6 connection string esempio (1 primary + 5 tenant) e `multiConnectionEnabled=true`. Attivare con `ASPNETCORE_ENVIRONMENT=multi-tenant.mssql`.
- `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` / `_mysql.sql` — DDL per aggiungere le due colonne a `Aziende` su DB esistenti.

---

## 🗺️ Menu localizzabile in base alla lingua

Le voci di menu vengono ora tradotte dinamicamente seguendo la lingua dell'utente, senza bisogno di duplicare i record `_metadati__menu` per locale.

**Architettura.** Il campo `mm_display_string_menu` di `_metadati__menu` contiene una **chiave stabile** namespaced (`menu.admin.roles`, `menu.crm.opportunities`, `menu.fleet.vehicles`, ...). Il template del componente menu Angular applica la pipe `translate` su `item.label` e la chiave viene risolta runtime dal dizionario `_wuic_translations` filtrato per lingua corrente.

**Schema chiave.**

```
menu.<scope>.<slug>
   │       └── slug snake_case (es. column_styles, opportunities)
   └── scope = root | admin | demo | crm | fleet | invoice
```

- `menu.root.*` — parent top-level (Amministrazione, Application, Home, ...)
- `menu.admin.*` — 36 voci di sistema condivise (Ruoli, Designer, Stili colonna, Workflow Designer, ...)
- `menu.demo.*` — demo content WideWorldImporters
- `menu.crm.*` / `menu.fleet.*` / `menu.invoice.*` — voci specifiche del dominio del tenant

**Vantaggio rispetto al modello precedente.**

- Il vecchio modello usava il testo italiano della label come chiave di traduzione (`Aziende`, `Customers`, `Ruoli`). Questo causava case-mismatch silenziosi (`Ruoli` vs `ruoli`, `Stili Tabella` vs `Stili tabella`) perché la pipe `translate` è case-sensitive, mentre `_wuic_translations` ha collation case-insensitive: ogni MERGE che entrava prima fissava la casing per sempre, e le INSERT successive case-divergenti diventavano no-op silenziosi.
- Il nuovo modello con chiavi stabili è case-determinate (tutto lowercase per convenzione), namespacing per scope, e non collide più con altre risorse che potrebbero usare lo stesso testo italiano (es. button label "Ruoli" in un dropdown è una key diversa da `menu.admin.roles`).

**5 lingue supportate.** `it-IT`, `en-US`, `fr-FR`, `es-ES`, `de-DE`. Le traduzioni vivono in `_wuic_translations` (formato standard: `language`, `resource`, `translation`). Switch lingua dal dropdown utente in alto a destra rilegge il dizionario per la nuova lingua e ridipinge il menu senza F5.

**Fallback runtime.** Lingua corrente → en-US → it-IT → chiave raw. Se vedi `menu.admin.roles` letterale a schermo significa che la chiave non è stata seedata in nessuna delle 5 lingue.

**Le vecchie chiavi italiane in `_wuic_translations` non vengono toccate** dall'aggiornamento: possono essere consumate da altri punti dell'app (`instant('Aziende')` in code-behind, list-grid header, page title) e restano valide.

---

## 🐛 Bug fix degni di nota

- **Task kill DLL lockers — `dotnet watch` hot reload**: il task di pulizia processi prima del riavvio backend (`backend: kill dll lockers`) non rilevava `WuicCore.exe` (l'eseguibile nativo emesso da .NET 8+) e perdeva il lock sul DLL al rebuild successivo (`MSB3026: file is being used by another process`). Detection riscritta con Restart Manager API (`rstrtmgr.dll`) come fonte autoritativa, fallback CommandLine esteso a `<Assembly>.exe` oltre a `dotnet.exe`, kill ricorsivo dell'albero processi. Anche i task `backend: stop running` / `backend crmapp: stop running` / `backend wuictest: stop running` ora usano l'helper condiviso `scripts/stop-dotnet-app-processes.ps1` che gestisce sia Debug che Release.

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.0.20 | 1.1.0 |
| Wuic.Webcore | 1.0.20 | 1.1.0 |
| WuicOData | 1.0.20 | 1.1.0 |
| RuntimeEfCore | 1.0.20 | 1.1.0 |
| wuic-framework-lib (NPM) | 1.0.20 | 1.1.0 |

---

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. **Per chi vuole attivare il multi-tenant** (opt-in): applicare lo script DDL `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` (o `_mysql.sql`) per aggiungere le colonne `Connessione_DB_Dati` e `CONNESSIONE_DB_Meta` ad `Aziende`. Popolare le righe `Aziende` con i nomi delle entry ConnectionStrings da `appsettings.json`. Settare `AppSettings.multiConnectionEnabled = "true"`. Riavviare il backend.
2. **Per chi resta single-tenant**: nessuna azione richiesta. Senza `multiConnectionEnabled=true` il routing tenant è disattivo e il comportamento è bit-identico alla 1.0.20.
3. **Menu localization — refresh metadata**: dopo l'aggiornamento, eseguire una volta `POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime` per ricaricare il dizionario menu lato client. In alternativa logout/login dell'utente.
4. **Menu localization — migrazione di un progetto esistente**: per un progetto che parte da una versione precedente con etichette italiane in `_metadati__menu.mm_display_string_menu`, applicare due step SQL idempotenti: (a) `UPDATE _metadati__menu SET mm_display_string_menu = '<menu.scope.slug>' WHERE mm_display_string_menu = '<vecchia etichetta>'` per ogni voce, secondo lo schema `menu.<scope>.<slug>` documentato sopra; (b) `INSERT/MERGE INTO _wuic_translations (language, resource, translation)` 5 righe per ogni nuova chiave (una per lingua). Le vecchie righe in `_wuic_translations` con resource = testo italiano restano in DB e possono essere usate da altri consumer (`instant()`, list-grid headers).
5. **Hot reload backend in dev**: se sviluppi con `dotnet watch` o con il launcher `Backend: KonvergenceCore (Hot Reload Watch)`, il task `backend: kill dll lockers` ora richiede `pwsh` 7+ (non più Windows PowerShell 5.x). Lo script C# inline per Restart Manager usa sintassi `Dictionary<,>` corretta solo in PS 7+.
