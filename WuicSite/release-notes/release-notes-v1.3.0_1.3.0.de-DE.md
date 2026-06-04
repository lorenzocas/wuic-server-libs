# Release Notes — WUIC Framework v1.3.0

**Datum**: 3. Juni 2026
**Vorherige veroeffentlichte Version**: 1.2.1 (31. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor-Release mit Fokus auf die Integration des **RAG-Chatbots** auf Framework-Seite: persistente Konversationshistorie, automatisches Context-Management, Hot-Reload-Konfiguration aus `appsettings.json` und cross-DBMS-Schema, das beim ersten Start automatisch angewendet wird. Neben dem Hauptfeature einige Fixes am Metadata-Scaffolder und zur Robustheit des Chat-Repositories auf MySQL/Oracle, die in frischen DB-Provisioning-Szenarien aufgetreten sind.

Der Chatbot ist die erste WUIC-Komponente mit serverseitigem Zustand (`_rag_chat_sessions` + `_rag_chat_messages`), die sich ohne manuelle Schema-Konfiguration ueber alle vier unterstuetzten Provider erstreckt. Der erste `Ask` erkennt den Provider, wendet die inkrementellen SQL-Patches der Reihe nach an und startet.

---

## 🤖 RAG-Chatbot — End-to-End-Context-Management

Die Komponente `<wuic-rag-chatbot>` persistiert nun mehrere Sessions pro Benutzer mit vollstaendiger Konversationshistorie, automatischer Context-Summarization und Konfiguration ueber `appsettings.json`. Das Feature ist opt-in: ohne konfigurierten `anthropic-api-key` bleibt der Chatbot inaktiv.

**Sessions**

- Pro Benutzer persistierte Konversationshistorie. Die Session ueberlebt Browser-Reloads und Routenwechsel.
- Sessions-Popup absteigend nach `updated_at` sortiert, Titel aus dem ersten Prompt abgeleitet (auf 100 Zeichen gekuerzt + voller Tooltip).
- Inline-Umbenennen mit sofortiger Persistenz.

**Automatisches Context-Management**

- **Visueller Cue-% im Chatbot-Header**: ein farbiger Kreis, der die Auslastung des Modell-Context-Windows zeigt (gruen <60% / gelb 60-80% / orange 80-90% / rot >90%). Der Wert kommt aus den tatsaechlich vom Anthropic-API verbrauchten Tokens und wird pro Turn persistiert, daher ueberlebt er den Reload.
- **Auto-Compact pre-Ask**: wenn die Konversation den konfigurierbaren Schwellenwert ueberschreitet (Standard 30 Turns) und mindestens 10 Turns noch nicht zusammengefasst sind, startet das Backend vor dem naechsten Ask einen Best-Effort-Compact im Hintergrund. Die aktualisierte Zusammenfassung wird fuer zukuenftige Turns in den System-Prompt eingebettet.
- **On-Demand-Compact**: der Benutzer kann einen Compact ueber das Slash-Command `/compact` oder per Klick auf den Cue-Kreis erzwingen.
- **Memory Facts**: das Modell selbst kann hochpriorisierte Fakten via Tool-Use (`remember_fact`/`forget_fact`) "anpinnen". Fakten bleiben auch nach einem Compact im System-Prompt (max. 20, FIFO-Eviction).
- **Follow-up Questions**: das Modell schlaegt bis zu 3 Folgefragen vor, die als anklickbare Chips unter der Antwort dargestellt werden. Klick = befuellt das Eingabefeld vor (sendet nicht automatisch).

**Konfiguration `appsettings.json`**

- `anthropic-api-key` — Anthropic-API-Key, **Hot-Reload**. Nicht hard-coded, niemals ins Repo committen.
- `anthropic-default-chat-model` — `claude-haiku-4-5-20251001` (200k, Standard) / `claude-sonnet-4-5-20250929` / `claude-opus-4-5`. Bestimmt das Context-Window und den visuellen Cue.
- `anthropic-auto-compact-threshold` — Ganzzahl >=0, Standard `30`. Auf `0` setzen, um Auto-Compact zu deaktivieren (manueller `/compact` bleibt verfuegbar).

**Cross-DBMS-Auto-Migration**

Das Chat-History-Schema (5 inkrementelle Patches) wird beim ersten `Ask` idempotent auf den konfigurierten Provider angewendet (MSSQL / MySQL / PostgreSQL / Oracle). Auf bestehenden Installationen kein DBA-Schritt erforderlich.

---

## 🐛 Bemerkenswerte Bugfixes

- **Metadata-Scaffolder — Unterscheidung `date` vs `datetime` konsolidiert**: Follow-up des in 1.2.1 eingefuehrten Fixes auf generierten temporalen Typen. Der Parser der Quelltypen deckt nun auch atypische DDL-Varianten ab (MySQL `DATETIME(0)` ohne Praezision, PostgreSQL nacktes `timestamp` ohne Time-Zone-Qualifier, Oracle `TIMESTAMP(n)` mit expliziter Praezision) — alle werden weiterhin korrekt auf den UI-Typ `datetime` gemappt und behalten die Zeitkomponente beim Speichern.

- **Suggest auf Metadata-Feldern — `mc_suggest_value_callback` normalisiert nun den Return-Wert**: der DB-konfigurierte Callback konnte ein Promise oder einen synchronen Wert zurueckgeben, der Runtime-Parser akzeptierte aber nur den synchronen Fall. Resultat: der Suggest schlug bei async Callbacks lautlos fehl. Die Normalisierung wartet nun einheitlich `Promise.resolve(callback(...))` ab.

- **Chat-Repository — cross-driver `Guid`**: der Treiber MySQL.Data materialisiert eine `CHAR(36)`-Spalte als `Guid`, wenn das Flag `OldGuids` `false` ist (Standard ab Connector-Version 6.6), und verursacht `InvalidCastException` auf `GetString`. Gleiches Risiko auf Oracle mit `RAW(16)`-Storage. Das Lesen der Correlation-Id hat nun eine Fallback-Kaskade (`GetGuid` → `GetString` → `GetValue` mit Runtime-Type-Switch) — robust auf allen vier Providern unabhaengig von der Treiber-Konfiguration.

- **Chat-Repository — MySQL-Verbindung nicht geoeffnet**: das MySQL-Gateway lieferte eine `new MySqlConnection(cs)` zurueck, ohne `Open()` aufzurufen, asymmetrisch zu den PostgreSQL- und Oracle-Gateways. Der erste `ExecuteNonQueryAsync` des Schema-Auto-Apply schlug mit "Connection must be valid and open" fehl. Es wurde ein symmetrisches `OpenConnectionToConnectionString` hinzugefuegt, angeglichen an die anderen Provider.

---

## 📦 Aktualisierte Pakete

| Package | Von | Auf |
|---|---|---|
| WuicCore | 1.2.1 | 1.3.0 |
| Wuic.Webcore | 1.2.1 | 1.3.0 |
| WuicOData | 1.2.1 | 1.3.0 |
| RuntimeEfCore | 1.2.1 | 1.3.0 |
| Wuic.MySqlProvider | 1.2.1 | 1.3.0 |
| Wuic.PostgresProvider | 1.2.1 | 1.3.0 |
| Wuic.OracleProvider | 1.2.1 | 1.3.0 |
| wuic-framework-lib (NPM) | 1.2.1 | 1.3.0 |

---

## 🔧 Empfohlene operative Aktualisierungen

1. Um den **RAG-Chatbot zu aktivieren**, den Schluessel `anthropic-api-key` (und optional `anthropic-default-chat-model` und `anthropic-auto-compact-threshold`) zur `appsettings.json` hinzufuegen. Das Backend liest die Schluessel im Hot-Reload — kein Neustart noetig.
2. **Kein DBA-Schritt erforderlich** auf bestehenden Installationen: beim ersten Chatbot-`Ask` wird das Chat-History-Schema (`_rag_chat_sessions` + `_rag_chat_messages` mit allen Spalten) idempotent auf den in `MetaDataSQLConnection` konfigurierten Provider angewendet. Die Auto-Migration deckt frische und teilweise migrierte Installationen ab.
3. Falls die Installation auf **MySQL / PostgreSQL / Oracle** laeuft, sicherstellen, dass der Connection-String auf den korrekten Provider verweist und der Benutzer ueber `ALTER TABLE`-Privilegien auf dem Metadata-Schema verfuegt (einmalig, beim ersten Start noetig).
4. Um die **Context-Window-Nutzung zu ueberwachen**, ist der Cue-%-Kreis im Chatbot-Header der unmittelbare visuelle Treiber. Ueber 80% lohnt sich ein manueller Compact (`/compact` oder Klick auf den Cue), um die Latenz nachfolgender Turns zu reduzieren.
