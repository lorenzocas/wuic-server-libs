# Release Notes — WUIC Framework v1.3.0

**Datum**: 3. Juni 2026
**Vorherige veroeffentlichte Version**: 1.2.1 (31. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor-Release mit Fokus auf die Integration des **RAG-Chatbots** auf Framework-Seite: persistente Konversationshistorie, automatisches Context-Management, Hot-Reload-Konfiguration aus `appsettings.json` und cross-DBMS-Schema, das beim ersten Start automatisch angewendet wird. Neben dem Hauptfeature einige Fixes am Metadata-Scaffolder und zur Robustheit des Chat-Repositories auf MySQL/Oracle, die in frischen DB-Provisioning-Szenarien aufgetreten sind.

Der Chatbot ist die erste WUIC-Komponente mit serverseitigem Zustand (`_rag_chat_sessions` + `_rag_chat_messages`), die sich ohne manuelle Schema-Konfiguration ueber alle vier unterstuetzten Provider erstreckt. Der erste `Ask` erkennt den Provider, wendet die inkrementellen SQL-Patches der Reihe nach an und startet. Mit diesem Release kann der Serving-Stack zudem **nativ auf .NET** laufen (in-process ONNX-Engine), wodurch das Deployment beim Kunden unabhaengig von Python wird.

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

## 🛠️ Aktionen, die der Chatbot auf das Projekt anwenden kann

Über die Beantwortung in natürlicher Sprache hinaus kann der Chatbot **konkrete Änderungen** am Projekt als Aktions-Chips mit einer "Anwenden"-Schaltfläche vorschlagen. Jeder Chip zeigt an, was er tun wird (Ziel-Route, generierter Code, Begründung), und der Benutzer entscheidet, ob er ihn anwenden möchte. Ohne expliziten Klick wird nichts ausgeführt.

Unterstützte Aktionstypen:

- **Toolbar- und Zeilenaktionen** — fügt benutzerdefinierte Schaltflächen zur Toolbar einer `<wuic-list-grid>` oder zu Aktionen einzelner Zeilen hinzu, mit generierten JavaScript-Callbacks. Beispiele: "füge eine Aktion hinzu, die ausgewählte Zeilen als CSV exportiert", "Genehmigen-Schaltfläche auf jeder Zeile platzieren".
- **Bedingte Zeilen- und Spaltenstile** — wendet CSS-Klassen auf eine Zeile oder eine einzelne Zelle basierend auf einer JS-Bedingung an. Beispiele: "Zeilen mit überfälliger Frist rot markieren", "grünen Hintergrund auf die `status`-Zelle setzen, wenn der Wert 'OK' ist".
- **Anzeigeformel für Spalten** — ersetzt die Listendarstellung einer Spalte durch ein benutzerdefiniertes HTML/Angular-Template (Badge, Symbol, Link, farbiger Prozentwert). Beispiel: "`priorität` als grün/gelb/rotes Badge anzeigen".
- **Formel für den Formulartitel** — berechnet den Titel des Bearbeitungsformulars eines Datensatzes dynamisch aus dessen Inhalt. Beispiel: "Titel soll `Kunde {firmenname}` sein".
- **Standardwert und benutzerdefinierte Validierung** — generiert Callbacks für Standardwerte beim Öffnen des Formulars (Feld-Vorbelegung) oder für komplexe Validierung (feldübergreifend, benutzerdefinierte Regex). Beispiele: "Standard `erstellt_am` = heute", "validiere, dass `email` mit @firma.de endet".
- **Selection-changed- und Lifecycle-Callbacks** — Hooks auf Formularereignisse (Datensatzauswahl-Änderung, before-save, after-save, after-delete) für benutzerdefinierte Seiteneffekte: verlinkte Datasources aktualisieren, Benachrichtigungen, Audit-Log auf Anwendungsebene.
- **Metadaten-Änderungen** — wendet direkte Änderungen an Tabellen-/Spalten-Metadaten an (Caption, Sortierung, in Liste/Bearbeitung ausblenden, grundlegende Validierungen), ohne den manuellen Metadaten-Editor zu verwenden.
- **SQL-Snippets in Metadaten (Super-Admin)** — schreibt rohe SQL-Fragmente in Metadaten-Felder, die zur Laufzeit in automatisch generierten Abfragen konkateniert werden: benutzerdefinierter JOIN auf der Route, benutzerdefinierte SELECT-Klausel auf einer Spalte, berechnete Spaltenformel, Lookup-Anzeigeausdruck. Beispiele: "berechne `total` auf `orders` als `price` × `quantity`", "füge Join zu `payments` auf `invoice_id` hinzu". Der Chatbot kennt den aktiven Provider-Dialekt (mssql/mysql/postgres/oracle) und generiert SQL mit dem korrekten Quoting/Syntax. Gated D3-Operation: erfordert Super-Admin-Privilegien serverseitig, mit automatischem Audit-Log in `_error__logs` für jede Anwendung.

### 🎨 Neue Aktion: Dashboard-Layout aus natürlicher Sprache

Wenn der Benutzer sich auf der **Designer**-Seite eines Dashboards befindet, stellt der Chatbot eine neue Familie von Aktionen bereit, die direkt auf das Designer-Canvas wirken (nicht auf persistierte Metadaten).

Unterstützte Prompt-Muster:

- "füge eine Grid hinzu, gebunden an Route `cities`" → injiziert `DATASOURCE` + `DATAREPEATER` konfiguriert und gebunden;
- "erstelle ein 2×2 Tabellen-Layout" → injiziert eine 2×2 `<table>` mit Zellen, die bereit sind, weitere Komponenten aufzunehmen;
- "setze einen vertikalen Splitter mit 3 Bereichen" → injiziert einen konfigurierten `SPLITTER`;
- "ändere den Hintergrund des Bereichs oben rechts auf rot" → ändert die `backgroundColor`-Eigenschaft der identifizierten Komponente;
- "füge eine Spalte zur Tabelle hinzu" / "entferne Zeile 2" → ändert `cols`/`rows` der ausgewählten `TABLE`-Komponente;
- "entferne den Umsatz-KPI" → löscht eine Komponente vom Canvas anhand ihres Namens.

Der Chatbot kennt den vollständigen Katalog der 31 Designer-Tools (Gruppen HTML, DATA, CONTAINER) und deren bearbeitbare Eigenschaften. Wenn der Benutzer eine Metadaten-Route mit einem ungefähren Namen erwähnt ("Provinzen" statt "stateprovinces"), führt der Chatbot einen Fuzzy-Match gegen die im Projekt verfügbaren Routen durch und zeigt den aufgelösten echten Namen in der Aktions-Begründung an.

Änderungen bleiben auf dem Designer-Canvas bis der Benutzer auf "Dashboard speichern" klickt — keine automatischen DB-Schreibvorgänge, das visuelle Ergebnis wird immer vor dem Commit überprüft. Undo/Redo des Designers deckt auch vom Chatbot injizierte Aktionen ab.

---

## ⚙️ Natives .NET-RAG-Engine (Deployment ohne Python)

Der Serving-Stack des RAG-Chatbots kann nun **vollstaendig auf .NET** laufen, ohne separaten Python-Server oder Virtual Environment auf der Zielmaschine. Die Retrieval-Modelle (Embeddings + Reranker) werden in-process ueber ONNX Runtime geladen, mit automatisch erkannter GPU-Beschleunigung (CUDA) und transparentem CPU-Fallback.

- Aktivierung ueber `appsettings.json`: `rag-use-dotnet-engine=true` waehlt das .NET-Engine; der Default `false` behaelt das bisherige Verhalten bei.
- `rag-engine-device` (`auto` / `cpu` / `cuda`) waehlt das Inferenz-Device; `rag-engine-profile` steuert den Redaktionsgrad der in den Antworten zitierten Quellen.
- Beim ersten Start werden die benoetigten Artefakte (ONNX-Modelle + Index) on-demand heruntergeladen, sodass das Basis-Paket schlank bleibt.

Praktisches Ergebnis: das Deployment beim Kunden ist **nur .NET** — keine Python-Installation und keine zusaetzlichen nativen Abhaengigkeiten ausser der .NET-Runtime. Der Aufruf des Konversationsmodells und die Retrieval- und Aktions-Pipeline sind zwischen beiden Engines identisch.

---

## 🐛 Bemerkenswerte Bugfixes

- **Callback-Dokumentation am Runtime ausgerichtet**: das Callback-Kochbuch beschrieb in zwei Faellen Signaturen, die nicht dem tatsaechlichen Verhalten entsprachen. Der Default-Value-Callback schreibt den Wert in das Record (`record[field.mc_nome_colonna] = ...`) und das `return` wird ignoriert; die Custom-Validation erhaelt `(record, field, vr, wtoolbox)` und teilt das Ergebnis mit einem booleschen `return` mit (`false` blockiert das Speichern) plus `vr.message` fuer den angezeigten Text. Die vorherigen Beispiele, basierend auf `validateResult(...)` und auf einem `return` fuer den Default Value, erzeugten Callbacks, die nicht angewendet wurden. Dokumentation in allen fuenf Sprachen korrigiert.

- **Zuverlaessigkeit der vom Chatbot vorgeschlagenen Aktionen**: bei Aktionsanfragen emittiert der Chatbot nun deterministisch die passende Aktions-Chip und wiederholt automatisch bei einem transienten Rate-Limit des Konversationsmodells, statt still auf eine reine Textantwort zu degradieren.

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
5. Um den RAG-Chatbot **ohne Python** auf der Zielmaschine zu betreiben, `rag-use-dotnet-engine=true` in `appsettings.json` setzen (optional `rag-engine-device` und `rag-engine-profile`). Beim ersten Start werden die Inferenz-Artefakte automatisch heruntergeladen.
