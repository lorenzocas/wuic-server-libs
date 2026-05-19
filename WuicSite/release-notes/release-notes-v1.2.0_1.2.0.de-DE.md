# Release Notes — WUIC Framework v1.2.0

**Datum**: 19. Mai 2026
**Vorherige veröffentlichte Version**: 1.1.0 (13. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Dieses Release erweitert das Framework um zwei neue DBMS — PostgreSQL und Oracle — und behebt einen Spreadsheet-Filter-Bug, der bei Routen mit aktivierten server-side operations auftrat, wenn die Spalte eine Lookup-Spalte war.

- **PostgreSQL-Provider** und **Oracle-Provider**: beide als Drop-in installierbar (`postgresql.dll` / `oracle.dll` neben `WuicCore.dll`), nutzbar als Data Store oder Metadata Store, mit Feature-Parität zu MSSQL und MySQL.
- **Spreadsheet-Filter auf Lookup-Spalten** im Server-Side-Modus: das Popup zeigt nun die Lookup-Bezeichner (z. B. `Woodgrove Bank Crandon Lakes`) und wendet den Filter mit der Foreign-Key-ID an, wodurch der SQL-Fehler auf Providern mit strikter Typisierung entfällt.

---

## 🗄️ PostgreSQL-Provider

Drop-in-kompatibel mit PostgreSQL 14+ (getestet auf 16). Installation: `postgresql.dll` neben `WuicCore.dll` im Physical Path der IIS-Site ablegen, oder im Publish-Verzeichnis des Linux-Binärs. Der `firstRun`-Setup-Wizard zeigt automatisch "PostgreSQL" im DBMS-Dropdown an, sobald er die DLL erkennt.

**Funktionale Abdeckung.** Alle Core-Oberflächen des Frameworks laufen nativ auf PG mit derselben Semantik wie die MSSQL/MySQL-Releases: CRUD, server-side paging, sorting, grouping, Aggregationen, Lookup Autocomplete, OData, scheduled Jobs, Audit, Notifications, Retry Policy, optimistische Konkurrenz, Validations, Callbacks/Events, XLS Import/Export, PDF Export, Multi-Tenant.

**PG-spezifische unterstützte Typen.** `boolean` (automatisch von/zu internem `smallint`-Speicher gemappt, der für Parität mit MSSQL/MySQL verwendet wird), `varchar`/`text`, `numeric`, `integer`/`bigint`, `timestamp`, `date`, `bytea` (Binär-Upload), `geometry` (PostGIS — Kartenanzeige via `ST_AsText`).

**Im Paket vorkonfigurierte Dateien.**

- `appsettings.postgres.json` / `appsettings.linux.postgres.json` / `appsettings.multi-tenant.postgres.json` — Self-contained-Environments einsatzbereit, aktivierbar mit `ASPNETCORE_ENVIRONMENT=postgres`.
- `dbms/scripts/first-run/*.postgres.sql` — Metadata-Bootstrap + WideWorldImporters-Tutorial-DDL/DML.

## 🗄️ Oracle-Provider

Drop-in-kompatibel mit Oracle 19c / 21c / Free 23c. Installation `oracle.dll` analog zum PostgreSQL-Provider; "Oracle" erscheint automatisch im firstRun-Dropdown.

**Funktionale Abdeckung.** Identisch zu PostgreSQL — alle Core-Oberflächen mit derselben Semantik wie die MSSQL/MySQL-Releases.

**Bezeichner-Länge.** Oracle 11g/12.1 (max 30 Zeichen) wird noch nicht unterstützt — die vom Framework generierten Lookup-Aliase überschreiten das Limit. Oracle 12.2+ (128 Zeichen) ist die Support-Untergrenze.

**Im Paket vorkonfigurierte Dateien.**

- `appsettings.oracle.json` / `appsettings.linux.oracle.json` / `appsettings.multi-tenant.oracle.json`.
- `dbms/scripts/first-run/*.oracle.sql` — Metadata-Bootstrap + Tutorial.

---

## 🐛 Bemerkenswerte Bugfixes

- **Spreadsheet-Popup-Filter auf Lookup-Spalten bei `md_server_side_operations=true`**: das Spalten-Funnel-Popup von `<wuic-list-spreadsheet>` auf einer `lookupByID`-Spalte zeigte nackte numerische IDs (z. B. `1, 4, 5`) statt der Bezeichner (z. B. `Woodgrove Bank Crandon Lakes`). Auf PG/Oracle erzeugte die Filteranwendung einen SQL-Fehler (`42601 ilike %%` auf PostgreSQL, `ORA-00904` auf Oracle), weil der Client den Bezeichner-String gegen die numerische FK-Spalte übertrug. Der Server liefert nun den gejointen Bezeichner (`<entity>___<dataTextField>__<colName>`) neben der FK-ID, und der Client zeigt den Bezeichner im Popup, überträgt aber die rohe ID als Filter-Value: das `WHERE col = <id>` bleibt numerisch und cross-DBMS-safe. Keine Aktion auf Consumer-Seite erforderlich.

---

## 📦 Aktualisierte Pakete

| Package | Von | Auf |
|---|---|---|
| WuicCore | 1.1.0 | 1.2.0 |
| Wuic.Webcore | 1.1.0 | 1.2.0 |
| WuicOData | 1.1.0 | 1.2.0 |
| RuntimeEfCore | 1.1.0 | 1.2.0 |
| Wuic.MySqlProvider | 1.1.0 | 1.2.0 |
| Wuic.PostgresProvider | — | 1.2.0 |
| Wuic.OracleProvider | — | 1.2.0 |
| wuic-framework-lib (NPM) | 1.1.0 | 1.2.0 |

---

## 🔧 Empfohlene operative Aktualisierungen für Upgrader

1. **Für MSSQL- oder MySQL-Nutzer**: keine Aktion erforderlich. Der Spreadsheet-Filter-Fix wird auf allen Providern nach dem ersten Client-Refresh transparent angewendet.
2. **PostgreSQL aktivieren**: `postgresql.dll` (zusammen mit Runtime-Dependencies — `Npgsql.dll`, `Npgsql.EntityFrameworkCore.PostgreSQL.dll`, `Microsoft.Extensions.Logging.Abstractions.dll`) in den IIS-Physical-Path oder in das Linux-Publish-Verzeichnis kopieren, Backend neu starten. PostgreSQL im firstRun-Wizard auswählen oder `ASPNETCORE_ENVIRONMENT=postgres` setzen, um die vorkonfigurierte `appsettings.postgres.json` zu verwenden.
3. **Oracle aktivieren**: gleiche Prozedur — `oracle.dll` + `Oracle.EntityFrameworkCore.dll` + `Oracle.ManagedDataAccess.dll`. Sicherstellen, dass die Ziel-DB-Version ≥ 12.2 ist (Bezeichner-Längen-Constraint).
4. **Client-Cache**: nach dem Update genügt ein Hard Refresh im Browser (`Strg+F5`), um den Client mit dem neuen Popup-Filter-Vertrag abzugleichen. Keine Server-seitige Metadata-Invalidierung erforderlich.
