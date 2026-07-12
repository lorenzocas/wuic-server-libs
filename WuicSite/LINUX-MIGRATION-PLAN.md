# Piano migrazione sito pubblico + crash-receiver su Linux

## Context

Dopo l'incidente del 2026-07-12 (abilitare WSL sul VPS Windows di produzione ha
corrotto il boot → restore da backup → ciclo update bloccante), la decisione
strategica: **spostare il sito pubblico e l'architettura di notifica errori dal
VPS Windows/IIS a un VPS Linux**, facendo l'upgrade di quello che oggi ospita
Plausible (169.58.6.218, Ubuntu 24.04). È anche dogfooding: WUIC vende il deploy
Linux nativo (.NET 10 + Kestrel + systemd) — facciamolo per primi.

**Scope di QUESTA migrazione**: `wuic-framework.com` (sito pubblico) +
`errors.wuic-framework.com` (crash receiver). **Fuori scope per ora**: demo,
forum, 3 free app — restano su Windows, si valuteranno dopo.

## Perché è fattibile (e per due pezzi molto diversa)

### WuicSite (sito pubblico) — FACILE

- **Frontend Angular**: file statici prerenderizzati → serviti da Caddy. Banale.
- **Sub-app `/api` (WuicSiteApi)**: minimal API .NET 10, **stateless, nessun DB**
  — solo PayPal (v2 REST) + SMTP (MailKit). Gira nativa su Linux con Kestrel +
  systemd. Zero riscritture: è esattamente lo scenario che il framework promette.
- **Asset statici**: `/downloads` (ZIP grandi) + `/rag-models` (~4.5GB engine RAG).
  Solo file — servono disco. Caddy li serve con i MIME giusti.

### WuicCrashReceiver — PIÙ IMPEGNATIVO (dipende da SQL Server)

- **App .NET 10 + admin SPA**: gira nativa su Linux. Facile.
- **DB `WuicCrashes` (SQL Server)**: usa T-SQL scritto a mano (`_wuic_crash_*`,
  dedup `MERGE`). Due strade — vedi **Decisione 1**.
- **Filesystem `wuic-obfuscar-mappings/<release>/*.symbols.map`**: solo file, si
  spostano con rsync.
- **Auth RSA license-signed + admin IP-whitelist**: logica applicativa, invariata.
- **Dati esistenti**: i crash report già raccolti vanno migrati (volume basso).

## Target Linux (169.58.6.218, da upgradare)

```
                    Caddy (TLS Let's Encrypt automatico, :443)
                    ├── analytics.wuic-framework.com → Plausible (già live)
                    ├── wuic-framework.com + www      → static WuicSite + /api → Kestrel :5080
                    └── errors.wuic-framework.com     → Kestrel :5090 (crash receiver + /admin)

  systemd services:                     Docker (già presente):
    wuic-site-api.service   (:5080)       plausible stack (postgres+clickhouse+caddy)
    wuic-crash.service      (:5090)       [+ eventuale mssql o postgres per i crash]

  Filesystem:
    /var/www/wuic-site/         (Angular statico + downloads + rag-models)
    /opt/wuic-site-api/         (WuicSiteApi pubblicato + appsettings con secret)
    /opt/wuic-crash/            (receiver + symbols.map + appsettings)
```

Nota Caddy: oggi Plausible ha il **suo** Caddy dentro il compose. Per servire
anche il sito conviene **un Caddy unico a livello host** (systemd) che fa reverse
proxy a tutto, e togliere il Caddy dal compose Plausible (Plausible torna a
pubblicare solo su 127.0.0.1:8000). Un solo owner della porta 443.

## Decisioni da prendere

### Decisione 1 — DB del crash receiver

| Opzione | Pro | Contro |
|---|---|---|
| **A) SQL Server su Linux (Docker)** | zero riscritture: il T-SQL resta com'è; migrazione dati mssql→mssql via bacpac | pesante (~2GB RAM baseline), Microsoft image, un altro mostro sul box |
| **B) Migrare a PostgreSQL** (consigliata) | leggero, si sposa con lo stack Plausible (già Postgres), niente licenze | riscrivere il T-SQL (`MERGE` dedup → `INSERT ON CONFLICT`, tipi, `SYSUTCDATETIME`) + migrare i dati mssql→pg. ~1 giorno dev |
| **C) SQLite** | zero servizi, un file | il receiver fa dedup concorrente + rate buckets; SQLite regge il volume basso ma è un downgrade di robustezza |

**Raccomandazione: B (PostgreSQL)** — è il momento giusto per togliere la
dipendenza SQL Server da questo pezzo, e allinea il crash receiver allo stack
Linux. Volume dati basso → migrazione semplice.

### Decisione 2 — Taglio del VPS (upgrade)

Attuale: 4 vCPU / 8 GB / ~72 GB. Aggiungere: WuicSite statico (leggero) + API
.NET (leggero) + crash receiver .NET (leggero) + **4.5GB rag-models + downloads**.
Con Postgres (Dec.1 B) la RAM basta; con SQL Server (A) serve salire.

- Con **Postgres**: **8→16 GB RAM** consigliato (margine per Plausible+ClickHouse
  + 2 app .NET + Postgres condiviso), **disco ≥ 120 GB** (rag-models + downloads +
  ClickHouse che cresce). Contabo permette il resize dal pannello.
- Con **SQL Server**: 16 GB minimo, 200 GB disco.

**Pre-flight**: misurare la size reale di `/downloads` e `/rag-models` su prod per
dimensionare il disco esatto.

### Decisione 3 — .NET nativo+systemd vs Docker per le app WUIC

**Raccomandazione: nativo + systemd** per WuicSiteApi e crash receiver — è più
leggero, è ciò che il framework vende, e il deploy diventa `rsync + systemctl
restart`. Docker resta per Plausible (+ eventuale Postgres crash).

## Piano per fasi

### Fase 0 — Preparazione (nessun impatto su prod)
1. Upgrade VPS (Dec.2) dal pannello Contabo — richiede un reboot del **solo VPS
   analytics** (Plausible), non della produzione. Programmarlo.
2. Misurare `/downloads` + `/rag-models` su prod; confermare il disco.
3. Snapshot del VPS analytics prima di iniziare (1 click).

### Fase 1 — Caddy host unico
1. Installare Caddy come servizio host (systemd).
2. Migrare la config Plausible dal Caddy-in-compose al Caddy host; Plausible
   torna su 127.0.0.1:8000. Verificare che analytics resti up.

### Fase 2 — Sito pubblico su Linux (in parallelo alla prod, testato in privato)
1. `dotnet publish -c Release` di WuicSiteApi (linux-x64) → `/opt/wuic-site-api`,
   systemd unit su :5080. Portare i **secret** (PayPal LIVE, SMTP) nell'appsettings
   server-side sul nuovo box — mai in git.
2. Build Angular (già fatto dal deploy) → `/var/www/wuic-site` + downloads +
   rag-models (rsync, 4.5GB una tantum).
3. Caddyfile: `wuic-framework.com` → static + `handle_path /api/*` reverse_proxy
   :5080. TLS automatico.
4. **Test senza toccare il DNS**: `curl --resolve wuic-framework.com:443:169.58.6.218`
   per validare home, /api/paypal/config, un checkout sandbox, /downloads, /rag-models.

### Fase 3 — Crash receiver su Linux
1. (Se Dec.1 B) Riscrivere lo strato SQL del receiver per Postgres + migrare i
   dati `WuicCrashes` mssql→pg (dump + transform). Test dedup/rate-limit.
2. `dotnet publish` → `/opt/wuic-crash`, systemd unit su :5090. rsync dei
   `symbols.map`. Portare RSA/appsettings.Production.
3. Caddyfile: `errors.wuic-framework.com` → :5090. Admin IP-whitelist ri-config.
4. Test con `--resolve` come sopra: ingest firmato + deobfuscate + admin UI.

### Fase 4 — Cutover DNS (uno alla volta)
1. Abbassare TTL dei record `wuic-framework.com`, `www`, `errors` a 300s (ore prima).
2. Flip A-record `wuic-framework.com` + `www` → 169.58.6.218. Verificare.
3. 24-48h dopo, se tutto ok, flip `errors`.
4. I client crash-reporter puntano a `errors.wuic-framework.com` → seguono il DNS,
   zero modifiche client.

### Fase 5 — Deploy pipeline Linux
1. Riscrivere `deploy-site.ps1` (o affiancare `deploy-site-linux.sh`): build →
   rsync static → `dotnet publish` API → `systemctl restart` → health check.
   Niente più maintenance-page IIS: Caddy + rsync atomico (symlink swap).

### Fase 6 — Decommission (solo dopo giorni di conferma)
1. Fermare WuicSite + WuicCrashReceiver su IIS (lasciarli fermi, non cancellati,
   come rollback per 1-2 settimane).
2. La produzione Windows resta per demo/forum/free-app finché non si migrano anche
   quelli (fase separata futura).

## Cutover & rollback
- Ogni fase è testabile via `--resolve`/hosts **prima** del DNS: nessun downtime.
- Rollback DNS: ri-puntare l'A-record al vecchio IP (con TTL 300 il ritorno è
  rapido). I siti IIS restano intatti finché non si decommissiona.
- Secret PayPal LIVE: gestire con cura (checkout reale). Testare prima in sandbox
  sul nuovo box.

## Rischi principali
- **Secret handling** (PayPal LIVE, SMTP, RSA crash): trasferimento sicuro, mai in
  git, permessi 600. Un errore qui = checkout rotto o mancata notifica licenza.
- **rag-models 4.5GB + downloads**: disco. Misurare prima (Fase 0).
- **Riscrittura SQL crash receiver** (se Dec.1 B): il `MERGE` di dedup e i rate
  buckets vanno ri-testati con cura — è la parte con più codice da toccare.
- **Un solo box per analytics + sito + crash**: se satura, cadono insieme. Con
  16GB e app leggere è ok, ma è il trade-off del consolidamento. In alternativa,
  sito+crash su un secondo VPS Linux separato da Plausible (blast radius minore,
  ~4.50€/m in più). **Da valutare** — vedi Decisione 2.

## Verifica (definition of done per fase)
- Fase 2: `curl --resolve` su home 200, /api/paypal/config `configured:true`,
  checkout sandbox completo, /downloads + /rag-models 200 con MIME giusto.
- Fase 3: ingest crash firmato accettato, deobfuscate ok, admin UI raggiungibile
  solo da IP whitelisted.
- Fase 4: DNS propagato, cert Let's Encrypt emesso per tutti gli host, zero 5xx
  per 24h.
- Fase 5: `deploy-site-linux.sh` end-to-end con health check verde.
