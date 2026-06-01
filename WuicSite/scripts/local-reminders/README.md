# Local daily reminders (Windows Toast)

Local-only fallback canale per i daily reminder community. Le cloud routine su
`claude.ai/code/routines/` continuano a girare (logging affidabile su pagina
routine), ma il canale di **notifica al desktop** è questo: Windows Scheduled
Tasks → PowerShell → BurntToast → toast nativo.

## Perché non solo le cloud routine

Il toggle "Email da Claude Code sul web" è documentato per build/PR completion,
non per output di routine schedulate. Verifica empirica: routine devto fired
2026-06-01T07:05:27Z, nessuna email arrivata (né inbox né spam) entro 25+
minuti. Il pipeline web → email NON è affidabile per le routine.

Quindi: il toast Windows è il canale primario, le cloud routine restano come
backup ridondante consultabile via web.

## Setup (una volta)

```powershell
# Da pwsh nativo, qualsiasi directory:
pwsh -NoProfile -ExecutionPolicy Bypass -File C:\src\Wuic\WuicSite\scripts\local-reminders\install-tasks.ps1
```

Output atteso:
```
[ok] Registered: WUIC-DevTo-Reminder → daily 09:00 → -Type devto
[ok] Registered: WUIC-LinkedIn-Reminder → daily 09:30 → -Type linkedin
[ok] Registered: WUIC-SO-Triage → daily 18:00 → -Type so
```

Lo script è idempotente — relanciarlo aggiorna i task in place.

## Verifica

```powershell
Get-ScheduledTask -TaskName 'WUIC-*' | Format-Table TaskName, State, @{N='NextRun';E={(Get-ScheduledTaskInfo $_).NextRunTime}}
```

## Test manuale immediato (per vedere il toast SUBITO)

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File C:\src\Wuic\WuicSite\scripts\local-reminders\wuic-reminder.ps1 -Type devto
```

Primo run installa BurntToast (PS module, CurrentUser scope, ~10s). Dopo
quello, il toast appare in basso a destra entro 1-2 secondi.

## Cosa fa ogni reminder

### `WUIC-DevTo-Reminder` (09:00 daily)

Legge `cross-posts/devto/MANIFEST.md`, trova la prima riga `☐` (non
pubblicata), estrae slug + titolo. Toast mostra:

```
📝 dev.to crosspost today
RAG chatbot with Claude + bge-m3...
→ Paste content from rag-chatbot-with-claude-and-bge-m3.md into dev.to/new

[Open file] [Open URL]
```

- **Open file** → apre il file .md locale in editor default (VS Code)
- **Open URL** → apre dev.to/new in browser

Quando MANIFEST è tutto `✅`, il toast diventa "🎉 All 10 articles published!".

### `WUIC-LinkedIn-Reminder` (09:30 daily)

Legge `community/linkedin/posts.md`, cerca `## Day N — YYYY-MM-DD` con la
data odierna. Se trovato: toast con day + topic. Se non: prompt generico per
il batch background posts.

### `WUIC-SO-Triage` (18:00 daily)

Lancia `scripts/so-candidates.mjs` (Stack Exchange API, no auth, 13 tag
groups), parsa JSON, mostra top candidate o "no candidates today".

## Architettura

```
[Windows Scheduled Task] ─ daily fire (09:00/09:30/18:00) ─→ [pwsh.exe]
                                                                  ↓
                                              [wuic-reminder.ps1 -Type X]
                                                  ↓               ↓
                                        [reads MANIFEST.md]  [BurntToast]
                                        [reads posts.md]          ↓
                                        [runs so-candidates]  [WinRT Toast]
                                                                  ↓
                                                          [Desktop notification]
                                                          [→ Open file]
                                                          [→ Open URL]
```

Niente cron remoto, niente API call, niente email pipeline. Tutto on-host,
funziona offline (tranne SO triage che fa fetch SE API).

## Disinstallare

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File C:\src\Wuic\WuicSite\scripts\local-reminders\uninstall-tasks.ps1
```

## Troubleshooting

**Toast non appare al test manuale**:
1. Verifica Settings → System → Notifications → enabled
2. Verifica BurntToast installato: `Get-Module -ListAvailable BurntToast`
3. Verifica "Focus Assist" non in priority/alarms-only mode
4. Rilancia con visibilità: rimuovi `-WindowStyle Hidden` dall'install per
   vedere errori della prima esecuzione

**Task non parte al trigger time**:
1. `Get-ScheduledTaskInfo -TaskName 'WUIC-DevTo-Reminder'` mostra LastRunTime
   + LastTaskResult (`0x0` = OK, `0x1` = generic error)
2. Apri Task Scheduler GUI → vai sul task → History tab per log dettagliato
3. Conferma che il PC sia acceso/non in hibernate al trigger time (i task
   hanno `-StartWhenAvailable` → recovery al wake, ma solo entro 24h)

**Click su "Open file" non fa nulla**:
- Verifica che VS Code (o editor default) sia associato a `.md` (apri il
  file manualmente da Explorer, vedi cosa parte)
- L'attivazione Protocol del toast usa `file:///` prefix — file con spazi
  nel path vengono URL-encoded

## Dipendenze

- PowerShell 7+ (`pwsh.exe`) — AGENTS.md rule 27
- BurntToast PS module — auto-install on first run (CurrentUser scope)
- Node.js per il SO triage — risolto via `%APPDATA%\nvm\v24.14.0\node.exe`,
  fallback a `node` da PATH
- Windows 10/11 con Notification System abilitato
