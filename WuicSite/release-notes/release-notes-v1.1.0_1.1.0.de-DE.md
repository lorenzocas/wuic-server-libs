# Release Notes — WUIC Framework v1.1.0

**Datum**: 13. Mai 2026
**Zuvor veröffentlichte Version**: 1.0.20 (12. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor-Sprung: Dieses Release führt zwei strukturelle Funktionen ein, die das Deployment-Modell des Frameworks verändern.

- **Multi-Tenant**: Eine einzelne Framework-Instanz leitet Daten und Metadaten von N Unternehmen auf N verschiedene DB-Verbindungen weiter. Per-Tenant-Konfiguration über die Spalten `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta`; transparentes Routing auf Anwendungsebene via `TenantContext` (AsyncLocal, übersteht Task/Scheduler-Grenzen).
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

- **Dynamische Edit-Formulare — Tabs und Widgets in `md_edit_template`-Templates in Production**: In Production-Builds rendeten die über `md_edit_template` an eine Route gebundenen benutzerdefinierten HTML-Templates die Tabs von PrimeNG 21 nicht korrekt (Labels erschienen als verketteter Klartext ohne Komponenten-Chrome) und Field-Editors zeigten statt der Eingabefelder nur `<!---->`-Platzhalter. Ursache: der vom Framework für dynamische Templates verwendete Runtime-Compiler benötigt eine explizite Auflistung der im Template verfügbaren Standalone-Komponenten, und `MetadataProviderService.widgetDefinition.dynamicFormImports` war unvollständig. Zur Baseline hinzugefügt: `TabsModule` + `Tabs`/`TabList`/`Tab`/`TabPanels`/`TabPanel`, `FieldsetModule`, `DataRepeaterComponent`, `DataSourceComponent`, `ImageWrapperComponent`. Keine Aktion auf Consumer-Apps erforderlich, sobald das Paket `wuic-framework-lib` aktualisiert ist.

---

## 🎁 Kostenlose Apps jetzt verfügbar

Ab dieser Version werden drei vollständige Anwendungen **kostenlos** auf dem Framework ausgeliefert — verfügbar im Abschnitt „Free apps" der [Downloads](/downloads)-Seite:

- **CrmApp** — Selbstgehostetes B2B-CRM: Kundenverwaltung, Opportunity-Pipeline mit Drag-and-Drop-Kanban, Aktivitäten (Anrufe / Meetings / E-Mails), rollenbasiertes Dashboard. ([Artikel lesen](/blog/crmapp-free-crm-on-wuic))
- **FatturazioneElettronica** — Italienische E-Rechnung: FatturaPA v1.2-Rechnungseditor, CADES-BES-Signatur, XSD-Validierung, 4 austauschbare SDI-Provider (DirectPec kostenlos via PEC, ArubaPec / FatturePec / PecIt kommerziell), gesetzliche Aufbewahrung, IVA-Register und Liquidation. ([Artikel lesen](/blog/fatturazione-elettronica-free-italian-einvoicing))
- **FlottaMezzi** — Fuhrparkverwaltung: Fahrzeug- / Fahrerverwaltung, automatische Fristen (Steuer / TÜV / Versicherung / Wartung / Führerschein), OBD/GPS-Geolokalisierungs-Feed, Live-Karte, €/km-Kostenaggregation pro Fahrzeug und Fahrer, TCO-Reporting. ([Artikel lesen](/blog/flottamezzi-free-fleet-management))

Jede App wird in drei Formaten ausgeliefert: IIS-ZIP mit Tutorial-DB (sofort wiederherstellbar), IIS-ZIP ohne DB, Quellcode-ZIP.

**Lizenzmodell.** Die kostenlosen Apps sind **KOSTENLOS in der ausgelieferten Form** — das Binary `<App>.dll` im ZIP trägt eine eingebettete `host-binding-license`-Ressource, die die Framework-Runtime ohne externe Schlüssel autorisiert. Nur wenn Sie die **App aus dem Quellcode neu kompilieren** (etwa um einen neuen Controller hinzuzufügen oder eine öffentliche Signatur zu ändern), benötigen Sie eine WUIC Developer- oder Professional-Lizenz: die Neukompilierung erzeugt ein Binary mit anderer Identität, verliert das Bundling, und das Framework fällt auf die Standard-Fingerprint-Lizenzprüfung zurück.

Das Erweitern der kostenlosen Apps ohne Neukompilierung des Binarys wird vom Bundling abgedeckt: Metadaten via SQL hinzufügen, Angular-Komponenten im wwwroot, Jobs in der `scheduler`-Tabelle, Custom Hooks via `appsettings.json:customCrudHookClass`.

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
5. **Backend Hot Reload in Dev**: Wenn Sie mit `dotnet watch` entwickeln, erfordert der Task `backend: kill dll lockers` jetzt `pwsh` 7+ (nicht mehr Windows PowerShell 5.x). Das Inline-C#-Skript für Restart Manager verwendet `Dictionary<,>`-Syntax, die nur in PS 7+ korrekt geparst wird.
