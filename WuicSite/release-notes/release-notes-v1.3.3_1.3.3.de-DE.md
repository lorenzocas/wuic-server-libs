# Release Notes — WUIC Framework v1.3.3

**Datum**: 21. Juni 2026
**Zuvor veröffentlichte Version**: 1.3.2 (18. Juni 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Ein Release rund um den **RAG-Chatbot**: Die LLM-Modellkonfiguration wurde vereinfacht und vereinheitlicht, der Betrieb eines kostenlosen lokalen Modells (Qwen via Ollama) ist nun eine erstklassige Option, und die Engine wurde gegen die Eigenheiten lokaler Modelle gehärtet — so funktionieren die auf dem Designer und auf Metadaten vorgeschlagenen Aktionen auch ohne kommerziellen Provider zuverlässig.

---

## 🤖 RAG-Chatbot — vereinheitlichte LLM-Konfiguration

Die LLM-Provider-Konfiguration des Chatbots wurde auf **einen einzigen Schlüssel** und eine explizite Provider-Liste konsolidiert.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **explizit zu setzen** (kein Standard-Provider: wenn leer, bleibt der Chatbot im Retrieval-only-Modus und ruft kein LLM auf). `ollama` ist nun ein erstklassiger Wert: zeigt via `rag-llm-base-url` auf eine lokale Runtime im OpenAI-kompatiblen Format.
- `rag-llm-api-key` — die **einzige** Quelle des Schlüssels, unabhängig vom gewählten Provider. Ersetzt das bisherige Paar `llm-api-key` / `anthropic-api-key` (nur noch als Migrations-Fallback akzeptiert). Der Spezialwert `agent-sdk` nutzt das Agent SDK (`claude` CLI) via Subscription statt der kostenpflichtigen API, falls installiert.
- `rag-llm-base-url` — Endpoint-Override; erforderlich für `ollama` (z. B. `http://HOST:11434/v1`), optional für die anderen Provider.
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

Die Engine wurde gegenüber den Eigenheiten lokaler Modelle tolerant gemacht, die — anders als kommerzielle Modelle — das Tool-Call-Format manchmal nicht strikt einhalten. Der Chatbot stellt die vorgeschlagene Aktion nun korrekt wieder her, selbst wenn das Modell sie als Text oder mit nicht standardkonformen JSON-Escapes ausgibt. In der Praxis werden die Aktionen auf dem Designer und auf Metadaten — Tabellen-Buttons (Bulk), Zeilen-Buttons, bedingte Stile, Callbacks, Komponenten-Injektion im Designer — auch mit einem lokalen LLM zuverlässig vorgeschlagen und angewendet.

## 🐛 Nennenswerte Bugfixes

- **Designer — mehrspaltiges Layout**: Die Injektion eines mehrspaltigen/mehrbereichigen Layouts (z. B. "3 Spalten, jede mit einem Grid"), das der Chatbot vorschlägt, füllt nun alle Bereiche korrekt. Zuvor wurden nach der ersten Zelle die folgenden nicht aufgelöst und die Komponenten blieben leer.
- **Chatbot — Route-Whitelist**: Wird darum gebeten, eine Komponente an eine Route mit ungenauem Namen zu binden (z. B. "provincie" für "stateprovinces"), führt der Chatbot nun den semantischen Match durch und schlägt die Aktion vor, statt fälschlich zu antworten, die Route-Liste lade noch.

## 🔧 Empfohlene operative Updates für Aktualisierende

1. Für ein kostenloses lokales LLM in `appsettings.json` -> `AppSettings` setzen: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (Platzhalterwert, z. B. `ollama`) und `rag-llm-default-chat-model`.
2. Den Chatbot-Schlüssel auf `rag-llm-api-key` migrieren: die bisherigen `llm-api-key` und `anthropic-api-key` funktionieren weiterhin als Fallback, doch die empfohlene Konfiguration nutzt nur `rag-llm-api-key`.
3. Um das Agent SDK via Subscription statt der kostenpflichtigen API zu nutzen, `rag-llm-api-key=agent-sdk` setzen (erfordert die installierte `claude` CLI).
