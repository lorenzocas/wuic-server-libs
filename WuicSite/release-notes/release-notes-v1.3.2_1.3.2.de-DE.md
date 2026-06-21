# Release Notes — WUIC Framework v1.3.2

**Datum**: 18. Juni 2026
**Vorherige veröffentlichte Version**: 1.3.0 (11. Juni 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Eine Konsolidierungs-Release rund um den in 1.3.0 eingeführten **RAG-Chatbot**: Das Konversationsmodell ist nicht mehr an Anthropic gebunden — jeder OpenAI-kompatible Endpoint, einschließlich lokaler Runtimes wie Ollama mit offenen Modellen (Qwen), ist nun konfigurierbar und läuft ohne API-Key. Daneben eine Reihe von Fixes am First-Run-Installer, am Quellpaket und am Metadaten-Scaffolding, die bei frischen Installationen auftraten, sowie ein Workspace, der für KI-Coding-Assistenten bereit ist.

---

## 🤖 RAG-Chatbot — flexibler LLM-Provider (auch lokal und kostenlos)

Das Konversationsmodell des Chatbots ist nun providerunabhängig. Zusätzlich zu Anthropic werden **OpenAI-kompatible** Endpoints unterstützt, was lokale Runtimes (z. B. Ollama) einschließt: Offene, kostenlose Modelle wie **Qwen** lassen sich auf der eigenen Maschine betreiben, **ohne API-Key und ohne Kosten pro Token**.

- `rag-llm-provider` — `anthropic` (Standard) / `openai` / `openrouter`. Wählt den Wire-Dialekt des Providers.
- `rag-llm-base-url` — Endpoint-Override; mit der URL eines lokalen Servers (z. B. `http://localhost:11434/v1` für Ollama) spricht der Chatbot lokal mit dem Modell.
- `rag-llm-default-chat-model` — Modell-Id für den gewählten Provider (z. B. ein Qwen-Modell auf Ollama).
- `llm-api-key` — Key des aktiven Providers; für lokale Runtimes, die ihn nicht prüfen, genügt ein Platzhalterwert (z. B. `ollama`). Der bisherige `anthropic-api-key` bleibt gültig, wenn `rag-llm-provider=anthropic` (keine Migration nötig).

Alle Keys werden per **Hot-Reload** aus `appsettings.json` gelesen: ein Wechsel von Provider oder Modell erfordert keinen Neustart.

**Genaueres Retrieval** — das Re-Ranking der Ergebnisse wurde verfeinert: Der Chatbot zitiert bei natürlichsprachlichen Anfragen relevantere Quellen.

**Setup-Benachrichtigungen** — beim ersten Einsatz lädt die .NET-Engine die ONNX-Modelle on-demand herunter. Der Administrator erhält nun **Start- / Bereit- / Fehler**-Benachrichtigungen des Downloads in der Glocke, über alle vier DB-Provider hinweg, auch wenn die Initialisierung durch eine Anfrage ohne angemeldeten Benutzer ausgelöst wird.

**Automatische GPU-Beschleunigung** — auf einer Maschine mit NVIDIA-GPU nutzt die Engine die GPU ohne CUDA-Installation: beim ersten Start lädt sie neben den ONNX-Modellen auch das benötigte CUDA-12- + cuDNN-9-Runtime on-demand herunter (~1,8 GB, einmalig, nur wenn eine GPU vorhanden ist) und bindet es selbst ein. Ohne GPU → CPU, kein zusätzlicher Download. Manueller Override mit `rag-engine-cuda-path`.

---

## 🧩 Workspace bereit für KI-Coding-Assistenten

Mit dem Framework generierte Anwendungen enthalten nun eine **Sammlung von Markdown-Kontextdateien** (Projektbeschreibung, Konventionen, Betriebsregeln) im Workspace-Root. Diese Dateien machen agentische KI-Assistenten — **Continue**, **Cline**, Cursor und ähnliche — sofort mit der WUIC-Struktur und den Konventionen vertraut, ganz ohne proprietäre Erweiterung. Jeder Client, der den Workspace-Kontext liest, verhält sich wie ein „WUIC-nativer" Assistent.

---

## 🐛 Nennenswerte Bugfixes

- **First-Run-Installer — Nicht-Tutorial-Modus auf allen DB-Providern**: Die Installation mit Scaffolding einer bestehenden Datenbank (ohne die Tutorial-Beispieldaten) wurde korrigiert und über alle unterstützten Provider hinweg vereinheitlicht — SQL Server, MySQL, PostgreSQL und Oracle. Behoben wurden Fehler durch SQL-Dialekt-Unterschiede, die Auswahl der Ziel-Datenbank/des Ziel-Schemas und die Verbindungsverwaltung, die außerhalb des Tutorial-Modus auftraten.

- **First-Run-Installer — SQL-Skript-Pfad (non-BAK)**: Beim Provisioning der Metadaten-DB über das inkrementelle SQL-Skript (Alternative zum Restore aus einer `.bak`) verarbeitete der Parser für `GO`-getrennte Batches einige Trenner falsch, sodass die Schema-Erstellung bei frischen Installationen fehlschlug. Der Splitter wurde korrigiert, und skriptbasierte Installationen laufen nun sauber durch.

- **Quellpaket — .NET-RAG-Engine zur Laufzeit nicht gefunden**: Im Quellpaket (`-src-`) wurde die Engine `WuicRagEngine.dll` im Paket-Root abgelegt, während die aus `bin/` gestartete Anwendung sie neben sich suchte — der RAG-Chatbot startete nicht („WuicRagEngine.dll nicht gefunden"). Der Loader durchsucht den Ordner `rag-engine/` nun an mehreren Stellen (Build-Output, Content-Root, Arbeitsverzeichnis) und findet die Engine in beiden Deploy-Layouts.

- **First-Run — Persistenz des Chatbot-API-Keys**: Der im Erstinstallations-Assistenten eingegebene LLM-Key wird nun in die kanonische `appsettings.json` geschrieben, die zur Laufzeit tatsächlich gelesen wird. Zuvor konnte er in manchen Layouts in einer Kopie landen, die der Prozess nie liest, sodass der Chatbot direkt nach der Installation ohne Key blieb.

- **Metadaten-Scaffolding — Diagnose und Robustheit**: Das Scaffolding der Metadaten bestimmter Tabellen konnte mit einer generischen Meldung („Unable to scaffold metadata table") fehlschlagen, die die eigentliche Ursache verbarg. Der tatsächliche SQL-Fehler wird nun bis zum Aufrufer propagiert, und der auslösende Fall ist behoben.

- **Quellpaket — Echtzeit-Benachrichtigungen im Dev-Modus**: Im `-src-`-Paket leitete der Proxy des Dev-Servers (`ng serve`) WebSocket-Verbindungen nicht an das Backend weiter; der Benachrichtigungskanal (`/ws`) lief in einen Timeout und Aktualisierungen erschienen erst nach einem manuellen Seiten-Reload. Der Proxy leitet nun auch WebSockets weiter: Benachrichtigungen kommen in Echtzeit an.

---

## 📦 Aktualisierte Pakete

| Paket | Von | Auf |
|---|---|---|
| WuicCore | 1.3.0 | 1.3.2 |
| Wuic.Webcore | 1.3.0 | 1.3.2 |
| WuicOData | 1.3.0 | 1.3.2 |
| RuntimeEfCore | 1.3.0 | 1.3.2 |
| Wuic.MySqlProvider | 1.3.0 | 1.3.2 |
| Wuic.PostgresProvider | 1.3.0 | 1.3.2 |
| Wuic.OracleProvider | 1.3.0 | 1.3.2 |
| wuic-framework-lib (NPM) | 1.3.0 | 1.3.2 |

---

## 🔧 Empfohlene betriebliche Schritte beim Upgrade

1. Um den Chatbot mit einem **lokalen, kostenlosen Modell** zu betreiben (z. B. Qwen über Ollama): `rag-llm-provider=openai`, `rag-llm-base-url` auf den lokalen Endpoint (z. B. `http://localhost:11434/v1`) und `rag-llm-default-chat-model` auf die Modell-Id setzen; `llm-api-key` mit einem Platzhalter (z. B. `ollama`) belegen, falls die Runtime ihn nicht prüft. Kein Neustart: Die Keys werden per Hot-Reload gelesen.
2. Um bei Anthropic zu bleiben, ist nichts zu tun: `anthropic-api-key` funktioniert weiterhin mit `rag-llm-provider=anthropic` (Standard).
3. Das **Quellpaket (`-src-`) ist leichter**: Es enthält die redundanten Framework-DLLs nicht mehr im Root; diese werden von `dotnet build` aus den NuGet-Paketen neu erzeugt. Der Download des neuen `-src-` erfordert keine Aktion.
4. Beim **ersten Chatbot-Einsatz** mit der .NET-Engine sieht der Administrator den Download-Fortschritt der ONNX-Modelle in der Glocke. Vor dem ersten `Ask` die „bereit"-Benachrichtigung abwarten.
5. **Neue Apps** des Frameworks enthalten die KI-Assistenten-Kontextdateien automatisch im Workspace-Root; für bestehende Apps lassen sie sich neu erzeugen.
