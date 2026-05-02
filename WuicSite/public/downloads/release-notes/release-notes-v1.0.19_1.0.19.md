# Release Notes — WUIC Framework v1.0.19

**Data**: 2 maggio 2026
**Versione precedente pubblicata**: 1.0.7 (26 aprile 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

In sei giorni di sviluppo intenso, WUIC compie un salto significativo: dal singolo deploy IIS Windows a una **piattaforma multi-runtime** (Windows + Linux nativo), con un sistema unificato di **gestione errori tipizzati**, **crash reporting** centralizzato, **autenticazione LDAP**, e un giro di **hardening best-effort** sulla superficie applicativa.

---

## 🛡️ Sicurezza

Best-effort hardening su tutta la superficie applicativa: throttling autenticazione, rinforzo headers HTTP standard (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), gestione environment-aware di CORS e Swagger, riduzione info disclosure nelle response di errore, gating granulare degli endpoint amministrativi, controlli aggiuntivi sul path SQL runtime (skill `sql-injection-defense` aggiornata di conseguenza). Le configurazioni di default sono ora più conservative anche per deploy demo/staging, con override esplicito disponibile via `AppSettings`.

---

## 🚨 Crash Reporting (end-to-end)

Nuovo sistema di crash reporting auto-installato che invia stack trace .NET + JavaScript a un receiver self-hosted.

- **Server-side**: `CrashReportingService` + `CrashReportingMiddleware` + `JsonExceptionFilter` integration. Cattura le eccezioni unhandled passivamente, dedup via stack canonicalization, queue async, no impact su request latency.
- **Receiver privato**: `errors.wuic-framework.com` accetta upload firmati con RSA license signature (zero API keys da gestire).
- **GDPR consent**: opt-in esplicito gestito in `AppSettings`, configurabile dall'editor settings.
Skill `crash-reporting` documenta il workflow end-to-end (commit-by-commit) e la setup del receiver IIS Windows.

---

## 🐧 Linux deployment (nuovo)

WUIC è ora installabile su **Ubuntu/Debian** completamente automatizzato:

- **Stack scripts** in `scripts/linux/`: prereq detection, .NET runtime install, MSSQL Server o MySQL/MariaDB setup, Python 3.12 + RAG environment, segreti via systemd credentials, nginx reverse proxy con TLS.
- **Smoke test post-install** (`80-smoke-test.sh`): valida che backend, RAG, e proxy rispondano correttamente.
- **`appsettings.linux.mssql.json` + `appsettings.linux.mysql.json`** preconfigurati per i 2 stack supportati.
- **`scripts/install.sh`**: entrypoint singolo che orchestra l'intera setup (dichiarativo).

Il README aggiornato in `scripts/linux/README.md` documenta la procedura passo-passo.

---

## 🔐 LDAP Authentication

Login WUIC ora supporta **bind LDAP** in alternativa al DB:

- **`LdapAuthenticator`**: configurazione via `Authentication:Ldap:*` in appsettings (server, base DN, bind template).
- **Auto-provisioning utenti**: `LdapUserProvisioner` crea/aggiorna la riga locale al primo login con dati da LDAP.
- **Fallback DB**: se LDAP è unreachable e `FallbackToDbOnFailure=true`, il login ricade sul DB tradizionale (admin/admin resta sempre raggiungibile per recovery).

Compatibile con Active Directory, OpenLDAP e directory Novell.

---

## 🗄️ Provider MySQL (Wuic.MySqlProvider 0.8.3)

Esteso supporto MySQL/MariaDB a paritá col primary MSSQL:

- Suite completa di **docs-driven tests MySQL** (`scripts/docs-driven-tests-mysql.ps1`): audit, callbacks-events, client-side-CRUD, concurrency, conditional styling, import-export, OData, retry, stored procedures, translations, validations.
- Fixture SQL MySQL pronte (`scripts/docs-driven-tests/sql/*.mysql.sql`) per riprodurre i test in locale.
- Fix bug specifici Linux (collation default, JSON_TYPE quirks, paging hints).

---

## 🚦 Sistema unificato di errori (typed exceptions)

Refactor completo della gestione errori:

- **`WuicException`** come base type per tutte le eccezioni applicative tipizzate.
- **`WuicErrorCodes`** catalogo di 27 codici stabili (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, ecc.).
- **`MetaExceptionTranslator`**: mappa eccezioni runtime conosciute (SqlException, AuthenticationException, JsonException, OperationDisabledException) ai codici tipizzati.
- **`JsonExceptionFilter`**: pipeline centralizzato che produce JSON envelope stabile `{ ok, errorCode, args, traceId, fallbackMessage }`. Permette al client di mostrare messaggi localizzati invece di stack trace tecnici.
- **`scripts/exception-handling/error-translations.json`**: traduzioni IT/EN/DE/ES/FR/JA per tutti i codici noti.
- **Fuzz testing**: matrice automatica per scoprire nuovi error path non ancora tradotti (`fuzz-all-table-fields.ps1`).

---

## ⚙️ Developer Experience

- **`HotReloadTrigger`**: trigger esplicito per `dotnet watch` quando si modificano metadata (riduce confusion da edit non-source-tracked).
- **`.editorconfig`** standard repo-wide.
- **`scripts/internal/convert-firstrun-sql-to-lf.ps1`**: normalizza CRLF → LF degli script SQL first-run per consistency Linux.
- **5 nuove skills documentate** (`crash-reporting`, `docs-localization-parity`, `documentation-screenshots`, `prod-mode-test-server`, `angular-jit-compiler-migration`).

---

## 🐛 Bug fix degni di nota

- **`isSuperAdmin` gating**: corretta verifica permessi in più endpoint che precedentemente confondevano `isAdmin` (ruolo per-user) con `isSuperAdmin` (ruolo source of truth).
- **OData CRUD**: corrette serializzazioni edge case (Decimal→string, DateTime UTC roundtrip, navigation properties).
- **First-run wizard**: bootstrap iniziale ora consume correttamente `IConfiguration` (non più dipendenza da `KonvergenceCore/app.config` legacy).
- **Crash reporting forwarding**: bug 2026-04-28 risolto — eccezioni MVC handled non bypassano più il middleware crash reporter (cattura via `JsonExceptionFilter` direttamente).

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

1. Eseguire `dotnet ef database update` se si è su EF migrations
2. Verificare `appsettings.json`: il sistema legge ora anche `AppSettings:AllowedOrigins` (array string) e `AppSettings:registrationEnabled` (boolean kill-switch). Default sicuri se non specificati.
3. Se si usa LDAP, configurare la sezione `Authentication:Ldap:*` (vedi `appsettings.linux.mssql.json` per esempio completo).
4. Per deploy Linux: vedere il nuovo `scripts/linux/README.md`.
5. Per attivare crash reporting outgoing: settare `CrashReporting:Enabled=true` in appsettings + accettare consent GDPR via UI.

---

*Tutto il delta dal 2026-04-26 al 2026-05-02 — circa 60 commits cross-branch, ~3500 file modificati (escluso build cache + node_modules + obj/bin), inclusivo del lavoro su Linux deployment, crash reporting infrastructure, typed exceptions sweep, e security hardening.*
