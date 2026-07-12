# Release Notes — WUIC Framework v1.5.0

**Datum**: 11. Juli 2026
**Zuletzt veröffentlichte Version**: 1.3.2 (18. Juni 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Ein umfangreiches Release, das Arbeiten an mehreren Fronten bündelt. Der **RAG-Chatbot** erhält eine vereinfachte, vereinheitlichte LLM-Konfiguration; der Betrieb eines kostenlosen lokalen Modells (Qwen via Ollama) ist nun eine erstklassige Option, und die Engine wurde gegen die Eigenheiten lokaler Modelle gehärtet. Ein neues **Visual Studio Code**-Plugin, **WUIC Assistant**, bringt denselben agentischen Ansatz in den Editor. Der neue **Scene3D Designer** bringt das Authoring von 3D-Szenen in die App — PBR-Materialien, Shader-Effekte, Lichter mit Baking, Physik und einen Viewer, der Objekte an Daten bindet — und das Rendering ist nun zwischen WebGL und **WebGPU** wählbar. Der **Workflow Designer** erhält ein Paket für unterstütztes Authoring (Startvorlagen, Graph-Validierung, geführte Dialoge, Inline-Hilfe), und der **Dashboard-Designer** eine Reihe von Editing-Verbesserungen.

---

## 🤖 RAG-Chatbot — vereinheitlichte LLM-Konfiguration

Die LLM-Provider-Konfiguration des Chatbots wurde auf **einen einzigen Schlüssel** und eine explizite Provider-Liste konsolidiert.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **explizit zu setzen** (kein Standard-Provider: wenn leer, bleibt der Chatbot im Retrieval-only-Modus und ruft kein LLM auf). `ollama` ist nun ein erstklassiger Wert: zeigt via `rag-llm-base-url` auf eine lokale Runtime im OpenAI-kompatiblen Format.
- `rag-llm-api-key` — die **einzige** Quelle des Schlüssels, unabhängig vom gewählten Provider. Ersetzt das bisherige Paar `llm-api-key` / `anthropic-api-key` (nur noch als Migrations-Fallback akzeptiert). Der Spezialwert `agent-sdk` nutzt das Agent SDK (`claude` CLI) via Subscription statt der kostenpflichtigen API, falls installiert.
- `rag-llm-base-url` — endpoint-Override; erforderlich für `ollama` (z. B. `http://HOST:11434/v1`), optional für die anderen Provider.
- `rag-llm-default-chat-model` — Modell-ID für den gewählten Provider.

Alle Schlüssel werden weiterhin **hot-reload** aus `appsettings.json` gelesen: ein Wechsel von Provider oder Modell erfordert keinen Neustart.

## 🧠 Kostenloses lokales LLM (Qwen via Ollama), ohne API-Key

Der Chatbot kann nun vollständig auf einem **kostenlosen offenen lokalen Modell** laufen — z. B. **Qwen** (`qwen2.5-coder:32b`), bereitgestellt von **Ollama** auf der eigenen Maschine oder im LAN — ohne API-Key und ohne Kosten pro Token. Typische Konfiguration in `appsettings.json` -> `AppSettings`:

```
rag-llm-provider           = ollama
rag-llm-base-url           = http://HOST:11434/v1
rag-llm-api-key            = ollama
rag-llm-default-chat-model = qwen2.5-coder:32b
```

Eine vollständige Anleitung zum Aufsetzen des Ollama-Servers (Windows/Linux, LAN-Freigabe, Context-Tuning, persistenter Start) liegt dem Paket bei.

## ⚙️ Zuverlässige Chatbot-Aktionen auch mit lokalen Modellen

Die Engine wurde gegenüber den Eigenheiten lokaler Modelle tolerant gemacht, die — anders als kommerzielle Modelle — das tool-call-Format manchmal nicht strikt einhalten. Der Chatbot stellt die vorgeschlagene Aktion nun korrekt wieder her, selbst wenn das Modell sie als Text oder mit nicht standardkonformen JSON-Escapes ausgibt. In der Praxis werden die Aktionen auf dem Designer und auf Metadaten — Tabellen-Buttons (Bulk), Zeilen-Buttons, bedingte Stile, Callbacks, Komponenten-Injektion im Designer — auch mit einem lokalen LLM zuverlässig vorgeschlagen und angewendet.

## 🧩 Agentischer Assistent in VS Code — WUIC Assistant

Das Paket enthält nun ein Plugin für **Visual Studio Code**, **WUIC Assistant** (`llm-workspace/plugin/wuic-assistant.vsix`): ein Assistent, der die Framework-Konventionen bereits kennt und direkt am geöffneten Projekt arbeitet. Er erzeugt Angular-Komponenten (Cards, Dashboards mit KPI-Kacheln, List-Grids mit Navigation zum Bearbeitungsformular), Komponenten, die von einem eigenen .NET-endpoint gespeist werden, und schlägt Metadaten-Änderungen vor (bedingte Stile, Tabellen- und Zeilenaktionen, Lookups). Jeder Schreibvorgang durchläuft eine Vorschau vor der Bestätigung.

Er nutzt dasselbe lokale WUIC-RAG über den MCP-Server `wuic-rag` (automatisch gestartet) und das im Projekt bereits vorhandene Grounding, sodass keine manuelle MCP-Server-Konfiguration nötig ist. Das LLM-Modell ist frei wählbar — **lokal via Ollama** (Qwen, ohne API-Key) oder Anthropic.

Installation aus dem ZIP:

```
code --install-extension llm-workspace/plugin/wuic-assistant.vsix
```

Alternativ installiert es `install-llm-workspace.ps1`. Danach `Ctrl+Shift+P` -> **WUIC Assistant: Apri Chat**; den Provider in den Einstellungen wählen (`wuicAssistant.provider` = `ollama` oder `anthropic`).

## 🧊 Scene3D Designer (neu)

Ein neuer visueller 3D-Designer auf Route `#/scene3d_designer`, schreibgeschützt veröffentlicht über den Scene3D Viewer (`#/scene3d_viewer/:scene_key`). Er erlaubt es, eine dreidimensionale Szene zu komponieren und ihre Objekte an App-Daten zu binden.

- **Palette und Import**: Primitive (Würfel, Kugel, Ebene, Zylinder, Kegel, Torus), Gruppen, Lichter, Kamera, 3D-Text und Mesh Repeater (aus Daten erzeugte Instanzen). Import externer Modelle als glTF/GLB, OBJ, FBX, STL und DAE. Die Palette ist über Metadaten um benutzerdefinierte Typen erweiterbar.
- **PBR-Materialien**: Metalness, Roughness, Emissiv, Deckkraft, Wireframe, Flat Shading und Flächenseiten; beim physikalischen Material zusätzlich Transmission, IOR, Dicke und volumetrische Absorption (farbiges Glas).
- **Shader-Effekte**: Ein in JSON beschriebener Effekt (schemagestützt, mit Vervollständigung und einer "Struktur"-Ansicht) wird für den aktiven Renderer kompiliert; alternativ handgeschriebene GLSL-Shader auf dem WebGL-Renderer.
- **Beleuchtung**: Szenenlichter mit weichen Schatten, baking der statischen Beleuchtung in Vertex-Farben (unlit) und — auf dem WebGL-Renderer — ein fotorealistischer Vorschau-path tracing.
- **Animation und Physik**: Transport-Steuerung für Clips importierter Assets; optionale Physik pro Objekt mit Play/Stop-Simulation im Designer und Autoplay im Viewer.
- **Datenbindung**: Jedes Objekt bindet an eine WUIC-Route (mit optionalem Datensatz) und mappt visuelle Eigenschaften (Beschriftung, Farbe, Sichtbarkeit) auf Spalten; ein Doppelklick auf ein gebundenes Objekt im Viewer öffnet das CRUD des Datensatzes.
- **Automatische Vorschaubilder**: Beim Speichern wird die Szene vom Canvas erfasst und als Vorschau in der Liste "Szene laden" angezeigt — ohne Konfiguration und ohne externen Prozess.

Die Routen von Designer und Viewer benötigen das Feature `scene3d-designer`. Die Support-Tabellen werden bei der ersten Verwendung automatisch angelegt und aktualisiert, auf allen unterstützten Datenbanken.

## 🖥️ WebGPU-Renderer (opt-in)

Das Rendering von Szene und Viewer ist jetzt zwischen **WebGL** (Standard) und **WebGPU** (über die Symbolleiste umschaltbar) wählbar. Ist WebGPU im Browser nicht verfügbar, bleibt der Designer automatisch bei WebGL. Der gewählte Modus wird mit der Szene gespeichert und beim Öffnen wiederhergestellt. Mit aktivem WebGPU-Renderer läuft das Licht-baking auf der GPU (inklusive Schatten), deutlich schneller bei dichten Szenen; handgeschriebene GLSL-Shader und path tracing bleiben auf dem WebGL-Renderer verfügbar.

## 🔀 Workflow Designer — unterstütztes Authoring

Der Workflow-Designer (`#/workflow-designer`) begleitet nun das Erstellen eines Prozesses von Grund auf.

- **Startvorlagen**: "Neu aus Vorlage" erzeugt einen fertigen Graphen für gängige Muster (einfache Freigabe, Claim/Release-Warteschlange, Schwellenwertkette, parallele Aufgaben): Sie wählen die Hauptroute und — falls nötig — das Statusfeld, und Graph, Aktionen und Übergänge entstehen bereits verdrahtet.
- **Graph-Validierung**: "Graph validieren" meldet Probleme vor dem Speichern (Start ohne Ausgänge, unerreichbare Knoten, Aktion ohne Ziel, leere Bedingung, toter Zweig, unvollständiger Timer oder Split, Berechtigung mit fehlender Rolle). Ein Klick auf einen Befund rückt den Knoten auf dem Canvas ins Bild. Das Speichern wird nie blockiert: Bei offenen Punkten erscheint eine Zusammenfassung mit "Trotzdem speichern".
- **Geführte Konfiguration**: Die Dialoge für Timer und parallele Aufgaben verwenden Dropdowns und eine Route-Autovervollständigung statt aus dem Gedächtnis getippter Freitextfelder.
- **Onboarding und Hilfe**: eine Erste-Schritte-Checkliste auf leerem Canvas, beschreibende Palette-Tooltips und eine "Kurzanleitung" mit einer Legende der Formen und einem Glossar der Konzepte (Übergang, Guard, Berechtigung, interne Aktion).

## 🎨 Dashboard-Designer — schnelleres Editing

- **Snap-to-Grid**: Über das Aktionen-Menü des Designers aktivierbar; zeigt das Raster auf dem Canvas und richtet Ziehen, Größenänderung und Palette-Drops automatisch aus. Beim Aktivieren werden auch die bereits vorhandenen Elemente am Raster ausgerichtet.
- **Normaler / absoluter Fluss**: Neues Flag im Aktionen-Menü (Standard: normaler Fluss, keine Änderung für bestehende Dashboards). Im absoluten Modus werden abgelegte Elemente an den Drop-Koordinaten positioniert, außerhalb des Flusses: Die Größenänderung eines Elements verschiebt die anderen nicht. Der Drop in einen Container nutzt den Container als Positionsreferenz, und die Runtime erkennt in diesem Modus gespeicherte Dashboards automatisch.
- **Tastaturkürzel**: `Entf`/`Backspace` löscht das ausgewählte Element, die Pfeiltasten verschieben es, `Ctrl+Z`/`Ctrl+Y` für Undo/Redo. Durch Ziehen eines Auswahlrechtecks aus einem leeren Canvas-Bereich lassen sich mehrere Elemente auswählen: Pfeiltasten und `Entf` wirken auf die gesamte Auswahl.
- **JSON- und Preset-Import/-Export**: Das aktuelle Dashboard lässt sich als re-importierbare JSON-Datei exportieren (identisch mit dem persistierten Inhalt) — nützlich, um Layouts zwischen Umgebungen zu übertragen. Presets speichern wiederverwendbare Layouts unter einem Namen und werden mit einem Klick angewendet.
- **Zwischen Tabs verschieben**: Über das Kontextmenü eines Elements in einem Tab erstellt *In neuen Tab verschieben* einen neuen Tab und migriert das Element dorthin (Bindings und Zustand bleiben erhalten); *In anderen Tab verschieben* — verfügbar, wenn die Tabview mehrere Tabs hat — verschiebt es in einen bestehenden Tab nach Wahl. Der Ziel-Tab wird automatisch aktiviert, ebenso ein frisch abgelegter Tab.
- **Dashboard/Preset in ein Element importieren**: Über das Kontextmenü eines Containers lässt sich ein gespeichertes Dashboard oder ein Preset direkt in das Element importieren; die Bezeichner der importierten Elemente werden neu generiert und interne Referenzen (einschließlich Datasources) neu zugeordnet — ohne Kollisionen mit dem bestehenden Inhalt.

## 🐛 Bemerkenswerte Fehlerbehebungen

- **Designer — mehrspaltiges Layout**: Die Injektion eines mehrspaltigen/mehrbereichigen Layouts (z. B. "3 Spalten, jede mit einem Grid"), das der Chatbot vorschlägt, füllt nun alle Bereiche korrekt. Zuvor wurden nach der ersten Zelle die folgenden nicht aufgelöst und die Komponenten blieben leer.
- **Chatbot — Route-Whitelist**: Wird darum gebeten, eine Komponente an eine Route mit ungenauem Namen zu binden (z. B. "provincie" für "stateprovinces"), führt der Chatbot nun den semantischen Match durch und schlägt die Aktion vor, statt fälschlich zu antworten, die Route-Liste lade noch.
- **3D-Viewer — Navigation zwischen Szenen**: Werden verschiedene Szenen nacheinander im selben Viewer geöffnet, lädt jetzt jede Szene korrekt. Zuvor konnte der Viewer weiterhin die zuerst geöffnete Szene anzeigen.
- **Schemagestützter JSON-Editor**: Der Code-Editor im JSON-Modus bietet nun eine "Struktur"-Ansicht (per Schalter umschaltbar), um typisierte, schemageführte Eigenschaften hinzuzufügen und zu entfernen, ohne JSON von Hand zu schreiben.

## 🔧 Empfohlene operative Aktualisierungen für Aktualisierende

1. Für ein kostenloses lokales LLM in `appsettings.json` -> `AppSettings` setzen: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (Platzhalterwert, z. B. `ollama`) und `rag-llm-default-chat-model`.
2. Den Chatbot-Schlüssel auf `rag-llm-api-key` migrieren: die bisherigen `llm-api-key` und `anthropic-api-key` funktionieren weiterhin als Fallback, doch die empfohlene Konfiguration nutzt nur `rag-llm-api-key`.
3. Für den VS-Code-Assistenten das Plugin aus dem ZIP installieren: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (oder von `install-llm-workspace.ps1` installieren lassen).
4. Um den Scene3D Designer zu nutzen, aktivieren Sie das Feature `scene3d-designer` in der aktiven Lizenz. Die Support-Tabellen werden bei der ersten Verwendung automatisch angelegt und migriert; der WebGPU-Renderer ist über die Designer-Symbolleiste optional zuschaltbar (opt-in), mit automatischem Fallback auf WebGL bei Browsern ohne Unterstützung.
