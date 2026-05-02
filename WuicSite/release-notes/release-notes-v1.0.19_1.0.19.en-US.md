# Release Notes — WUIC Framework v1.0.19

**Date**: 2 May 2026
**Previous published version**: 1.0.7 (26 April 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

In six days of intensive development, WUIC takes a significant leap: from a single Windows IIS deployment to a **multi-runtime platform** (Windows + native Linux), with a unified **typed error handling** system, centralized **crash reporting**, **LDAP authentication**, and a round of **best-effort hardening** across the application surface.

---

## 🛡️ Security

Best-effort hardening across the entire application surface: authentication throttling, reinforcement of standard HTTP headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), environment-aware handling of CORS and Swagger, reduced info disclosure in error responses, granular gating of administrative endpoints, additional checks on the runtime SQL path. Default configurations are now more conservative even for demo/staging deployments, with explicit override available via `AppSettings`.

---

## 🚨 Crash Reporting (end-to-end)

New auto-installed crash reporting system that sends .NET + JavaScript stack traces to a self-hosted receiver.

- **Passive capture**: unhandled exceptions are collected automatically, deduplicated via stack canonicalization and queued asynchronously — no impact on request latency.
- **Private receiver**: `errors.wuic-framework.com` accepts uploads signed with RSA license signature (zero API keys to manage).
- **GDPR consent**: explicit opt-in managed in `AppSettings`, configurable from the settings editor.
- **Activation**: `CrashReporting:Enabled=true` in `appsettings.json` + GDPR consent via UI.

---

## 🐧 Linux deployment (new)

WUIC is now installable on **Ubuntu/Debian** in a fully automated way, with the supported stack:

- .NET runtime + MSSQL Server or MySQL/MariaDB.
- Python 3.12 + RAG environment.
- Secrets via systemd credentials.
- nginx reverse proxy with Let's Encrypt TLS.
- Post-install smoke test that validates backend, RAG and proxy.

The Linux tarball includes `appsettings.linux.mssql.json` and `appsettings.linux.mysql.json` preconfigured for the two supported stacks, plus a README with the step-by-step procedure.

---

## 🔐 LDAP Authentication

WUIC login now supports **LDAP bind** as an alternative to the DB:

- Configuration via the `Authentication:Ldap:*` section in `appsettings.json` (server, base DN, bind template).
- User auto-provisioning: the local row is created/updated on first login with data from LDAP.
- DB fallback: if LDAP is unreachable and `Authentication:Ldap:FallbackToDbOnFailure=true`, login falls back to the traditional DB (admin/admin always remains reachable for recovery).

Compatible with Active Directory, OpenLDAP and Novell directories.

---

## 🗄️ MySQL Provider (Wuic.MySqlProvider 0.8.3)

Extended MySQL/MariaDB support to parity with the primary MSSQL:

- Full functional test coverage (audit, client-side CRUD, concurrency, conditional styling, import-export, OData, retry, stored procedures, translations, validations).
- Linux-specific bug fixes: default collation, `JSON_TYPE` quirks, paging hints.

---

## 🚦 Unified error system (typed exceptions)

Complete refactor of application error handling:

- **`WuicException`** as base type for all typed application exceptions (part of the framework's public API).
- **`WuicErrorCodes`**: catalog of 27 stable codes (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, etc.).
- **Stable JSON envelope** for all error responses: `{ ok, errorCode, args, traceId, fallbackMessage }`. Allows the client to display localized messages instead of technical stack traces.
- **Built-in translations** in IT/EN/DE/ES/FR/JA for all known codes.
- **Automatic mapping** of known runtime exceptions (`SqlException`, `AuthenticationException`, `JsonException`, etc.) to typed codes.

---

## 🐛 Notable bug fixes

- **`isSuperAdmin` gating**: corrected permission check on multiple endpoints that previously confused `isAdmin` (per-user role) with `isSuperAdmin` (source-of-truth role).
- **OData CRUD**: fixed edge-case serializations (Decimal→string, DateTime UTC roundtrip, navigation properties).
- **First-run wizard**: initial bootstrap now correctly consumes `IConfiguration` (no longer dependent on legacy `app.config`).
- **Crash reporting forwarding**: bug 2026-04-28 resolved — handled MVC exceptions no longer bypass the crash reporter middleware.

---

## 📦 Updated packages

| Package | From | To |
|---|---|---|
| WuicCore | 1.0.13 | 1.0.19 |
| Wuic.Webcore | 1.0.13 | 1.0.19 |
| WuicOData | 1.0.13 | 1.0.19 |
| RuntimeEfCore | 1.0.13 | 1.0.19 |
| Wuic.MySqlProvider | 0.7.x | 0.8.3 |
| wuic-framework-lib (NPM) | 1.0.11 | 1.0.19 |

---

## 🔧 Recommended operational steps for upgraders

1. Run `dotnet ef database update` if you are on EF migrations.
2. Verify `appsettings.json`: the system now also reads `AppSettings:AllowedOrigins` (string array) and `AppSettings:registrationEnabled` (boolean kill-switch). Safe defaults if not specified.
3. If you use LDAP, configure the `Authentication:Ldap:*` section in `appsettings.json`.
4. For Linux deployment: use the dedicated tarball and follow the included README.
5. To enable outgoing crash reporting: set `CrashReporting:Enabled=true` in `appsettings.json` + accept GDPR consent via UI.
