# Release Notes — WUIC Framework v1.0.19

**Data**: 2 maggio 2026
**Versione precedente pubblicata**: 1.0.7 (26 aprile 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

In sei giorni di sviluppo intenso, WUIC compie un salto significativo: dal singolo deploy IIS Windows a una **piattaforma multi-runtime** (Windows + Linux nativo), con un sistema unificato di **gestione errori tipizzati**, **crash reporting** centralizzato, **autenticazione LDAP**, e un giro di **hardening best-effort** sulla superficie applicativa.

---

## 🛡️ Sicurezza

Best-effort hardening su tutta la superficie applicativa: throttling autenticazione, rinforzo headers HTTP standard (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), gestione environment-aware di CORS e Swagger, riduzione info disclosure nelle response di errore, gating granulare degli endpoint amministrativi, controlli aggiuntivi sul path SQL runtime. Le configurazioni di default sono ora più conservative anche per deploy demo/staging, con override esplicito disponibile via `AppSettings`.

---

## 🚨 Crash Reporting (end-to-end)

Nuovo sistema di crash reporting auto-installato che invia stack trace .NET + JavaScript a un receiver self-hosted.

- **Cattura passiva**: le eccezioni unhandled vengono raccolte automaticamente, deduplicate via stack canonicalization e accodate async — nessun impatto sulla latency delle request.
- **Receiver privato**: `errors.wuic-framework.com` accetta upload firmati con RSA license signature (zero API keys da gestire).
- **GDPR consent**: opt-in esplicito gestito in `AppSettings`, configurabile dall'editor settings.
- **Attivazione**: `CrashReporting:Enabled=true` in `appsettings.json` + consent GDPR via UI.

---

## 🐧 Linux deployment (nuovo)

WUIC è ora installabile su **Ubuntu/Debian** completamente automatizzato, con stack supportato:

- .NET runtime + MSSQL Server o MySQL/MariaDB.
- Python 3.12 + RAG environment.
- Segreti via systemd credentials.
- nginx reverse proxy con TLS Let's Encrypt.
- Smoke test post-install che valida backend, RAG e proxy.

Il tarball Linux include `appsettings.linux.mssql.json` e `appsettings.linux.mysql.json` preconfigurati per i due stack supportati, più un README con la procedura passo-passo.

---

## 🔐 LDAP Authentication

Login WUIC ora supporta **bind LDAP** in alternativa al DB:

- Configurazione tramite la sezione `Authentication:Ldap:*` in `appsettings.json` (server, base DN, bind template).
- Auto-provisioning utenti: la riga locale viene creata/aggiornata al primo login con dati da LDAP.
- Fallback DB: se LDAP è unreachable e `Authentication:Ldap:FallbackToDbOnFailure=true`, il login ricade sul DB tradizionale (admin/admin resta sempre raggiungibile per recovery).

Compatibile con Active Directory, OpenLDAP e directory Novell.

---

## 🗄️ Provider MySQL (Wuic.MySqlProvider 0.8.3)

Esteso supporto MySQL/MariaDB a paritá col primary MSSQL:

- Coverage completo dei test funzionali (audit, CRUD client-side, concurrency, conditional styling, import-export, OData, retry, stored procedures, translations, validations).
- Fix bug specifici Linux: collation default, `JSON_TYPE` quirks, paging hints.

---

## 🚦 Sistema unificato di errori (typed exceptions)

Refactor completo della gestione errori applicativi:

- **`WuicException`** come base type per tutte le eccezioni applicative tipizzate (parte della public API del framework).
- **`WuicErrorCodes`**: catalogo di 27 codici stabili (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, ecc.).
- **JSON envelope stabile** per tutte le risposte di errore: `{ ok, errorCode, args, traceId, fallbackMessage }`. Permette al client di mostrare messaggi localizzati invece di stack trace tecnici.
- **Traduzioni built-in** IT/EN/DE/ES/FR/JA per tutti i codici noti.
- **Mapping automatico** delle eccezioni runtime conosciute (`SqlException`, `AuthenticationException`, `JsonException`, ecc.) ai codici tipizzati.

---

## 🐛 Bug fix degni di nota

- **`isSuperAdmin` gating**: corretta verifica permessi in più endpoint che precedentemente confondevano `isAdmin` (ruolo per-user) con `isSuperAdmin` (ruolo source of truth).
- **OData CRUD**: corrette serializzazioni edge case (Decimal→string, DateTime UTC roundtrip, navigation properties).
- **First-run wizard**: bootstrap iniziale ora consume correttamente `IConfiguration` (non più dipendenza da `app.config` legacy).
- **Crash reporting forwarding**: bug 2026-04-28 risolto — le eccezioni MVC handled non bypassano più il middleware crash reporter.

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.0.13 | 1.0.19 |
| Wuic.Webcore | 1.0.13 | 1.0.19 |
| WuicOData | 1.0.13 | 1.0.19 |
| RuntimeEfCore | 1.0.13 | 1.0.19 |
| Wuic.MySqlProvider | 0.7.x | 0.8.3 |
| wuic-framework-lib (NPM) | 1.0.11 | 1.0.19 |

---

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. Eseguire `dotnet ef database update` se si è su EF migrations.
2. Verificare `appsettings.json`: il sistema legge ora anche `AppSettings:AllowedOrigins` (array string) e `AppSettings:registrationEnabled` (boolean kill-switch). Default sicuri se non specificati.
3. Se si usa LDAP, configurare la sezione `Authentication:Ldap:*` in `appsettings.json`.
4. Per deploy Linux: usare il tarball dedicato e seguire il README incluso.
5. Per attivare crash reporting outgoing: settare `CrashReporting:Enabled=true` in `appsettings.json` + accettare consent GDPR via UI.
