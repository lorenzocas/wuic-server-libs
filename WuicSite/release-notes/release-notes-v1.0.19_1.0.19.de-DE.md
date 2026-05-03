# Release Notes — WUIC Framework v1.0.19

**Datum**: 2. Mai 2026
**Vorherige veröffentlichte Version**: 1.0.7 (26. April 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

In sechs Tagen intensiver Entwicklung macht WUIC einen bedeutenden Schritt nach vorn: vom einzelnen Windows-IIS-Deployment zu einer **Multi-Runtime-Plattform** (Windows + natives Linux), mit einem einheitlichen System für **typisierte Fehlerbehandlung**, zentralisiertem **Crash Reporting**, **LDAP-Authentifizierung** und einer Runde **Best-Effort-Hardening** an der Anwendungsoberfläche.

---

## 🛡️ Sicherheit

Best-Effort-Hardening über die gesamte Anwendungsoberfläche: Authentifizierungs-Throttling, Verstärkung der Standard-HTTP-Header (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), umgebungsbewusste Verwaltung von CORS und Swagger, reduzierte Info-Disclosure in Fehlerantworten, granulare Absicherung administrativer Endpunkte, zusätzliche Prüfungen im Runtime-SQL-Pfad. Standard-Konfigurationen sind nun auch für Demo-/Staging-Deployments restriktiver, mit explizitem Override über `AppSettings`.

---

## 🚨 Crash Reporting (End-to-End)

Neues automatisch installiertes Crash-Reporting-System, das .NET- und JavaScript-Stacktraces an einen selbst gehosteten Receiver sendet.

- **Passive Erfassung**: Unbehandelte Exceptions werden automatisch erfasst, per Stack-Canonicalization dedupliziert und asynchron in die Queue gestellt — keine Auswirkung auf die Request-Latency.
- **Privater Receiver**: `errors.wuic-framework.com` akzeptiert mit RSA-Lizenzsignatur signierte Uploads (keine API-Keys zu verwalten).
- **DSGVO-Einwilligung**: Explizites Opt-in in `AppSettings`, konfigurierbar über den Settings-Editor.
- **Aktivierung**: `CrashReporting:Enabled=true` in `appsettings.json` + DSGVO-Einwilligung über die UI.

---

## 🐧 Linux-Deployment (neu)

WUIC ist jetzt vollständig automatisiert auf **Ubuntu/Debian** installierbar, mit dem unterstützten Stack:

- .NET-Runtime + MSSQL Server oder MySQL/MariaDB.
- Python 3.12 + RAG-Umgebung.
- Secrets über systemd credentials.
- nginx Reverse Proxy mit Let's Encrypt TLS.
- Smoke-Test nach der Installation, der Backend, RAG und Proxy validiert.

Das Linux-Tarball enthält `appsettings.linux.mssql.json` und `appsettings.linux.mysql.json` vorkonfiguriert für die zwei unterstützten Stacks, plus eine README mit der Schritt-für-Schritt-Anleitung.

---

## 🔐 LDAP-Authentifizierung

Der WUIC-Login unterstützt jetzt **LDAP-Bind** als Alternative zur Datenbank:

- Konfiguration über die Sektion `Authentication:Ldap:*` in `appsettings.json` (Server, Base DN, Bind Template).
- Benutzer-Auto-Provisioning: Die lokale Zeile wird beim ersten Login mit Daten aus LDAP erstellt/aktualisiert.
- DB-Fallback: Wenn LDAP nicht erreichbar ist und `Authentication:Ldap:FallbackToDbOnFailure=true`, fällt der Login auf die traditionelle DB zurück (admin/admin bleibt für Recovery immer erreichbar).

Kompatibel mit Active Directory, OpenLDAP und Novell-Verzeichnissen.

---

## 🗄️ MySQL-Provider (Wuic.MySqlProvider 0.8.3)

Erweiterte MySQL/MariaDB-Unterstützung auf Augenhöhe mit dem primären MSSQL:

- Vollständige funktionale Test-Coverage (Audit, Client-Side-CRUD, Concurrency, Conditional Styling, Import-Export, OData, Retry, Stored Procedures, Übersetzungen, Validierungen).
- Linux-spezifische Bug-Fixes: Default-Collation, `JSON_TYPE`-Quirks, Paging Hints.

---

## 🚦 Einheitliches Fehlersystem (typisierte Exceptions)

Vollständiges Refactoring der Anwendungsfehlerbehandlung:

- **`WuicException`** als Basistyp für alle typisierten Anwendungs-Exceptions (Teil der öffentlichen API des Frameworks).
- **`WuicErrorCodes`**: Katalog mit 27 stabilen Codes (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, usw.).
- **Stabiler JSON-Envelope** für alle Fehlerantworten: `{ ok, errorCode, args, traceId, fallbackMessage }`. Erlaubt dem Client, lokalisierte Nachrichten anstelle technischer Stacktraces anzuzeigen.
- **Eingebaute Übersetzungen** in IT/EN/DE/ES/FR/JA für alle bekannten Codes.
- **Automatisches Mapping** bekannter Runtime-Exceptions (`SqlException`, `AuthenticationException`, `JsonException`, usw.) auf typisierte Codes.

---

## 📊 Excel-Export

Bulk-Export im `.xlsx`-Format wurde auf eine Producer/Consumer-Pipeline und `OpenXmlWriter` Streaming umgeschrieben. Die Auswirkungen betreffen vor allem große Datasets (ab Zehntausenden Zeilen).

- Streaming OpenXML statt inkrementellem DOM-Build: typischerweise 50× schneller bei Bulk-Exporten, Memory-Footprint bleibt auch jenseits einer Million Zeilen begrenzt.
- Pipelined DB-Read / xlsx-Write über einen bounded Buffer: DB-Reads blockieren nicht mehr auf der Sheet-Kompressionszeit.
- Aggregierte Progress-Notifications über einen dedizierten Channel: keine Task pro Update mehr, kein WebSocket-Storm während langer Exporte.
- Automatischer Multi-Sheet-Split, wenn das Excel-Limit von 1.048.576 Zeilen pro Sheet überschritten wird. Die Abschluss-Meldung enthält die Anzahl der erzeugten Sheets.

Keine Aktion erforderlich: der Pfad ist standardmäßig aktiv für alle `.xlsx`-Exporte aus der List-Grid-Toolbar (Export XLS) und aus Server-side APIs.

---

## 🐛 Erwähnenswerte Bug-Fixes

- **`isSuperAdmin`-Gating**: Korrigierte Berechtigungsprüfung an mehreren Endpunkten, die zuvor `isAdmin` (per-User-Rolle) mit `isSuperAdmin` (Source-of-Truth-Rolle) verwechselten.
- **OData CRUD**: Korrigierte Edge-Case-Serialisierungen (Decimal→string, DateTime UTC Roundtrip, Navigation Properties).
- **First-Run-Wizard**: Initial-Bootstrap konsumiert jetzt korrekt `IConfiguration` (keine Abhängigkeit mehr von Legacy-`app.config`).
- **Crash Reporting Forwarding**: Bug vom 28.04.2026 behoben — behandelte MVC-Exceptions umgehen die Crash-Reporter-Middleware nicht mehr.

---

## 📦 Aktualisierte Pakete

| Paket | Von | Auf |
|---|---|---|
| WuicCore | 1.0.13 | 1.0.19 |
| Wuic.Webcore | 1.0.13 | 1.0.19 |
| WuicOData | 1.0.13 | 1.0.19 |
| RuntimeEfCore | 1.0.13 | 1.0.19 |
| Wuic.MySqlProvider | 0.7.x | 0.8.3 |
| wuic-framework-lib (NPM) | 1.0.11 | 1.0.19 |

---

## 🔧 Empfohlene operative Schritte für Upgrader

1. `dotnet ef database update` ausführen, falls EF Migrations verwendet werden.
2. `appsettings.json` prüfen: Das System liest jetzt zusätzlich `AppSettings:AllowedOrigins` (String-Array) und `AppSettings:registrationEnabled` (boolescher Kill-Switch). Sichere Defaults, falls nicht angegeben.
3. Bei LDAP-Nutzung die Sektion `Authentication:Ldap:*` in `appsettings.json` konfigurieren.
4. Für Linux-Deployment: Das dedizierte Tarball verwenden und die enthaltene README befolgen.
5. Zur Aktivierung des ausgehenden Crash Reporting: `CrashReporting:Enabled=true` in `appsettings.json` setzen + DSGVO-Einwilligung über die UI akzeptieren.
