# Release Notes — WUIC Framework v1.1.0

**Datum**: 13. Mai 2026
**Zuvor veröffentlichte Version**: 1.0.20 (12. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor-Sprung: Dieses Release führt zwei strukturelle Funktionen ein, die das Deployment-Modell des Frameworks verändern.

- **Multi-Tenant**: Eine einzelne KonvergenceCore-Instanz leitet Daten und Metadaten von N Unternehmen auf N verschiedene DB-Verbindungen weiter. Per-Tenant-Konfiguration über die Spalten `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta`; transparentes Routing auf Anwendungsebene via `TenantContext` (AsyncLocal, übersteht Task/Scheduler-Grenzen).
- **Sprachabhängige Menü-Lokalisierung**: Menüeinträge (`mm_display_string_menu`) enthalten keine hartcodierten italienischen Labels mehr, sondern stabile namespaced Schlüssel `menu.<scope>.<slug>`, die zur Laufzeit von der Angular-`translate`-Pipe gegen `_wuic_translations` aufgelöst werden. Sprachwechsel über den Benutzer-Selector aktualisiert alle Einträge ohne F5.

---

## 🌐 Multi-Tenant-Verwaltung

Eine einzelne Framework-Installation kann jetzt mehrere Unternehmen ("Tenants") bedienen, deren Daten und Metadaten physisch auf unterschiedlichen DBs isoliert sind — ohne dass die Anwendung repliziert oder Reverse-Proxies pro Host partitioniert werden müssen.

**Datenmodell.** Das Tenant→Verbindungs-Routing ist auf zwei Spalten der primären Metadaten-DB definiert:

- `Aziende.Connessione_DB_Dati` — Name eines Eintrags in `ConnectionStrings` für die Anwendungs-DB des Tenants
- `Aziende.CONNESSIONE_DB_Meta` — Name eines Eintrags in `ConnectionStrings` für die Metadaten-DB des Tenants

Die Spalten enthalten den **Namen** des Eintrags, nicht den wörtlichen String. Credential-Rotation erfolgt durch Editieren von `appsettings.<env>.json`, ohne die DB anzufassen.

**Aktivierung.** Flag in `appsettings.json` (Abschnitt `AppSettings`):

```json
"multiConnectionEnabled": "true"
```

Mit Flag `false` (Default) bleibt das Verhalten Single-Tenant, identisch zu den vorherigen Releases. Mit Flag `true` löst jede authentifizierte HTTP-Anfrage die `AziendaId` aus dem eingeloggten Benutzer auf und leitet `GetOpenConnection` an die Connection Strings des entsprechenden Tenants weiter.

**Transparentes Routing.** Alle DB-Zugriffspunkte des Frameworks (`MetaService.*`, Scheduler, Scaffolding, AsmxProxy CRUD, Custom Callbacks) konsultieren `TenantScope.CurrentAziendaId` via `AsyncLocal`, propagiert vom HTTP-Middleware post-authenticate. Background-Jobs und Custom Callbacks deklarieren den Tenant explizit mit `using (TenantScope.Push(aziendaId)) { ... }`, wenn sie außerhalb des Request-Kontexts laufen.

**Tenant-bewusster Cache.** Server-seitige `Application[]`-Keys und lokale Metadaten-Caches werden automatisch mit `AziendaId` suffixiert, wenn das Flag aktiv ist, um Metadaten-Bleed zwischen Tenants zu vermeiden.

**Login-Routing.** Die Tabelle `_login_index(username_hash, id_azienda)` auf der primären DB mappt Username → Tenant für den `MetaService.login`-Fallback: Nach der Authentifizierung trägt das Cookie `k-user` `azienda_id` als Teil des Payloads, und die Middleware erstellt bei jeder folgenden Anfrage den korrekten `TenantScope`.

**Scaffold-Propagation.** Die Aktion "Scaffold Tabelle" propagiert Tabellenmetadaten idempotent zu allen in `Aziende` aufgeführten Tenants. Die Propagation läuft mit explizitem `TenantScope` auf jedem Ziel und ist idempotent: wiederholbar, wendet nur fehlende Änderungen an.

**Im Paket enthaltene Dateien:**

- `appsettings.multi-tenant.mssql.json` / `appsettings.multi-tenant.mysql.json` — self-contained Environment mit 6 Beispiel-Connection-Strings (1 Primary + 5 Tenants) und `multiConnectionEnabled=true`. Aktivieren mit `ASPNETCORE_ENVIRONMENT=multi-tenant.mssql`.
- `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` / `_mysql.sql` — DDL, um die beiden Spalten zu `Aziende` auf bestehenden DBs hinzuzufügen.

---

## 🗺️ Sprachabhängige Menü-Lokalisierung

Menüeinträge werden jetzt dynamisch nach der Benutzersprache übersetzt, ohne dass `_metadati__menu`-Datensätze pro Locale dupliziert werden müssen.

**Architektur.** Das Feld `mm_display_string_menu` von `_metadati__menu` enthält einen **stabilen namespaced Schlüssel** (`menu.admin.roles`, `menu.crm.opportunities`, `menu.fleet.vehicles`, ...). Das Template der Angular-Menükomponente wendet die `translate`-Pipe auf `item.label` an, und der Schlüssel wird zur Laufzeit aus dem nach aktueller Sprache gefilterten Dictionary `_wuic_translations` aufgelöst.

**Schlüssel-Schema.**

```
menu.<scope>.<slug>
   │       └── snake_case Slug (z. B. column_styles, opportunities)
   └── scope = root | admin | demo | crm | fleet | invoice
```

- `menu.root.*` — Top-Level-Parents (Verwaltung, Anwendung, Startseite, ...)
- `menu.admin.*` — 36 gemeinsame System-Einträge (Rollen, Designer, Spaltenstile, Workflow-Designer, ...)
- `menu.demo.*` — WideWorldImporters-Demo-Inhalt
- `menu.crm.*` / `menu.fleet.*` / `menu.invoice.*` — domänenspezifische Einträge des Tenants

**Vorteil gegenüber dem vorherigen Modell.**

- Das alte Modell verwendete den italienischen Text des Labels als Übersetzungsschlüssel (`Aziende`, `Customers`, `Ruoli`). Dies verursachte stille Case-Mismatches (`Ruoli` vs `ruoli`, `Stili Tabella` vs `Stili tabella`), weil die `translate`-Pipe case-sensitive ist, während `_wuic_translations` eine case-insensitive Collation hat: Der erste MERGE fixierte das Casing für immer, und nachfolgende case-divergente INSERTs wurden zu stillen No-Ops.
- Das neue stabile Schlüssel-Modell ist case-determiniert (per Konvention lowercase), per Scope namespaced, und kollidiert nicht mehr mit anderen Ressourcen, die denselben italienischen Text verwenden könnten (z. B. ein Button-Label "Ruoli" in einem Dropdown ist ein anderer Schlüssel als `menu.admin.roles`).

**5 unterstützte Sprachen.** `it-IT`, `en-US`, `fr-FR`, `es-ES`, `de-DE`. Übersetzungen liegen in `_wuic_translations` (Standardformat: `language`, `resource`, `translation`). Sprachwechsel über das Benutzer-Dropdown oben rechts liest das Dictionary für die neue Sprache neu und rendert das Menü ohne F5 neu.

**Runtime-Fallback.** Aktuelle Sprache → en-US → it-IT → Raw-Key. Wenn Sie `menu.admin.roles` wörtlich auf dem Bildschirm sehen, wurde der Schlüssel in keiner der 5 Sprachen geseedet.

**Alte italienische Schlüssel in `_wuic_translations` werden vom Upgrade nicht angefasst**: Sie können von anderen Stellen der App konsumiert werden (`instant('Aziende')` im Code-Behind, List-Grid-Header, Page-Titles) und bleiben gültig.

---

## 🐛 Bemerkenswerte Bugfixes

- **DLL-Locker-Kill-Task — `dotnet watch` Hot Reload**: Der Cleanup-Task für Prozesse vor dem Backend-Neustart (`backend: kill dll lockers`) erkannte `WuicCore.exe` (das von .NET 8+ emittierte native Executable) nicht und verlor den DLL-Lock beim nächsten Rebuild (`MSB3026: file is being used by another process`). Detection neu geschrieben mit Restart Manager API (`rstrtmgr.dll`) als autoritative Quelle, Fallback CommandLine erweitert auf `<Assembly>.exe` zusätzlich zu `dotnet.exe`, rekursiver Kill des Prozessbaums. Die Tasks `backend: stop running` / `backend crmapp: stop running` / `backend wuictest: stop running` verwenden jetzt ebenfalls den gemeinsamen Helper `scripts/stop-dotnet-app-processes.ps1`, der sowohl Debug als auch Release behandelt.

---

## 📦 Aktualisierte Pakete

| Package | Von | Auf |
|---|---|---|
| WuicCore | 1.0.20 | 1.1.0 |
| Wuic.Webcore | 1.0.20 | 1.1.0 |
| WuicOData | 1.0.20 | 1.1.0 |
| RuntimeEfCore | 1.0.20 | 1.1.0 |
| wuic-framework-lib (NPM) | 1.0.20 | 1.1.0 |

---

## 🔧 Empfohlene operative Updates für Upgrader

1. **Für diejenigen, die Multi-Tenant aktivieren möchten** (Opt-in): Das DDL-Skript `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` (oder `_mysql.sql`) ausführen, um die Spalten `Connessione_DB_Dati` und `CONNESSIONE_DB_Meta` zu `Aziende` hinzuzufügen. `Aziende`-Zeilen mit den Namen der ConnectionStrings-Einträge aus `appsettings.json` füllen. `AppSettings.multiConnectionEnabled = "true"` setzen. Backend neu starten.
2. **Für diejenigen, die Single-Tenant bleiben**: Keine Aktion erforderlich. Ohne `multiConnectionEnabled=true` ist das Tenant-Routing deaktiviert und das Verhalten ist bit-identisch zur 1.0.20.
3. **Menü-Lokalisierung — Metadata-Refresh**: Nach dem Upgrade einmal `POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime` ausführen, um das Menü-Dictionary clientseitig neu zu laden. Alternativ Benutzer aus- und einloggen.
4. **Menü-Lokalisierung — Migration eines bestehenden Projekts**: Für Projekte, die von einer früheren Version mit italienischen Labels in `_metadati__menu.mm_display_string_menu` kommen, zwei idempotente SQL-Schritte anwenden: (a) `UPDATE _metadati__menu SET mm_display_string_menu = '<menu.scope.slug>' WHERE mm_display_string_menu = '<altes Label>'` für jeden Eintrag, gemäß dem oben dokumentierten Schema `menu.<scope>.<slug>`; (b) `INSERT/MERGE INTO _wuic_translations (language, resource, translation)` 5 Zeilen pro neuem Schlüssel (eine pro Sprache). Die alten Zeilen in `_wuic_translations` mit resource = italienischer Text bleiben in der DB und können weiterhin von anderen Callern (`instant()`, List-Grid-Header) konsumiert werden.
5. **Backend Hot Reload in Dev**: Wenn Sie mit `dotnet watch` oder dem Launcher `Backend: KonvergenceCore (Hot Reload Watch)` entwickeln, erfordert der Task `backend: kill dll lockers` jetzt `pwsh` 7+ (nicht mehr Windows PowerShell 5.x). Das Inline-C#-Skript für Restart Manager verwendet `Dictionary<,>`-Syntax, die nur in PS 7+ korrekt geparst wird.
