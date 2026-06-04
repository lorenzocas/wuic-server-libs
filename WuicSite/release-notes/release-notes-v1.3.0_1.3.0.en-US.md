# Release Notes — WUIC Framework v1.3.0

**Date**: 3 June 2026
**Previous published version**: 1.2.1 (31 May 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor release focused on the **RAG chatbot** integration on the framework side: persistent conversation history, automatic context management, hot-reload configuration from `appsettings.json` and cross-DBMS schema auto-applied at first start. Alongside the main feature, a few metadata scaffolder and chat repository robustness fixes that surfaced in fresh DB provisioning scenarios.

The chatbot is the first WUIC component with server-side state (`_rag_chat_sessions` + `_rag_chat_messages`) that spans all four supported providers without manual schema configuration. The first `Ask` detects the provider, applies the incremental SQL patches in order and starts up.

---

## 🤖 RAG Chatbot — end-to-end context management

The `<wuic-rag-chatbot>` component now persists multiple sessions per user, with full conversation history, automatic context summarization and `appsettings.json` configuration. The feature is opt-in: without `anthropic-api-key` configured the chatbot stays inactive.

**Sessions**

- Conversation history persisted per user. The session survives browser reloads and route changes.
- Sessions popup ordered by `updated_at` descending, with title derived from the first prompt (truncated at 100 chars + full tooltip).
- Inline rename with immediate persistence.

**Automatic context management**

- **Visual cue % in the chatbot header**: a colored circle showing the model's context window usage (green <60% / yellow 60-80% / orange 80-90% / red >90%). The value comes from the tokens actually consumed by the Anthropic API and is persisted per turn, so it survives reload.
- **Auto-compact pre-Ask**: when the conversation exceeds the configurable threshold (default 30 turns) and at least 10 turns are not yet summarized, the backend triggers a best-effort compact in the background before the next Ask. The refreshed summary is injected into the system prompt for future turns.
- **On-demand compact**: the user can force a compact via the slash command `/compact` or by clicking the cue circle.
- **Memory facts**: the model itself can "pin" high-priority facts via tool use (`remember_fact`/`forget_fact`). Facts stay in the system prompt even after a compact (max 20, FIFO eviction).
- **Follow-up questions**: the model suggests up to 3 follow-up questions, rendered as clickable chips under the response. Click = pre-fills the input box (does not auto-send).

**`appsettings.json` configuration**

- `anthropic-api-key` — Anthropic API key, **hot-reload**. Not hard-coded, never commit to repo.
- `anthropic-default-chat-model` — `claude-haiku-4-5-20251001` (200k, default) / `claude-sonnet-4-5-20250929` / `claude-opus-4-5`. Drives the context window and the visual cue.
- `anthropic-auto-compact-threshold` — integer >=0, default `30`. Set to `0` to disable auto-compact (manual `/compact` remains available).

**Cross-DBMS auto-migration**

The chat history schema (5 incremental patches) is applied idempotently at the first `Ask`, on the configured provider (MSSQL / MySQL / PostgreSQL / Oracle). No DBA step required on existing installs.

---

## 🐛 Notable bug fixes

- **Metadata scaffolder — `date` vs `datetime` distinction consolidated**: follow-up of the fix introduced in 1.2.1 on generated temporal types. The source-type parser now also covers atypical DDL variants (MySQL `DATETIME(0)` without precision, PostgreSQL bare `timestamp` without time-zone qualifier, Oracle `TIMESTAMP(n)` with explicit precision) — they all continue to map correctly to UI type `datetime` while preserving the time component at save.

- **Metadata field suggest — `mc_suggest_value_callback` now normalizes the return value**: the DB-configured callback could return a promise or a sync value, but the runtime parser only accepted the sync case. Result: suggest silently failed inside async callbacks. The normalization now awaits `Promise.resolve(callback(...))` uniformly.

- **Chat repository — cross-driver `Guid`**: the MySQL.Data driver materializes a `CHAR(36)` column as `Guid` when the `OldGuids` flag is `false` (default starting from connector version 6.6), causing `InvalidCastException` on `GetString`. Same risk on Oracle with `RAW(16)` storage. The correlation id read now has a fallback cascade (`GetGuid` → `GetString` → `GetValue` with runtime-type switch) — robust on all four providers regardless of driver configuration.

- **Chat repository — MySQL connection not open**: the MySQL gateway returned a `new MySqlConnection(cs)` without calling `Open()`, asymmetrically with the PostgreSQL and Oracle gateways. The first `ExecuteNonQueryAsync` of the schema auto-apply failed with "Connection must be valid and open". Added a symmetric `OpenConnectionToConnectionString`, aligned with the other providers.

---

## 📦 Updated packages

| Package | From | To |
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

## 🔧 Recommended operational updates

1. To **enable the RAG chatbot**, add the `anthropic-api-key` key (and optionally `anthropic-default-chat-model` and `anthropic-auto-compact-threshold`) to `appsettings.json`. The backend reads the keys in hot-reload — no restart needed.
2. **No DBA step required** on existing installs: at the first chatbot `Ask`, the chat history schema (`_rag_chat_sessions` + `_rag_chat_messages` with all columns) is applied idempotently on the provider configured in `MetaDataSQLConnection`. Auto-migration covers fresh and partially migrated installs.
3. If the install runs on **MySQL / PostgreSQL / Oracle**, verify the connection string points to the correct provider and the user has `ALTER TABLE` privileges on the metadata schema (needed only once, at the first start).
4. To **monitor context window usage**, the cue % circle in the chatbot header is the immediate visual driver. Above 80% it is worth running a manual compact (`/compact` or click the cue) to reduce latency on subsequent turns.
