# ⛔ DEPRECATO — non usare

> **2026-07-12**: abilitare le feature WSL/VirtualMachinePlatform sul VPS
> Windows di produzione ha corrotto il boot (shutdown impiantato → WinRE
> senza driver virtio → restore da Auto Backup Contabo). Questo approccio
> è abbandonato: **mai hypervisor/WSL/Docker sul box di produzione**.
> L'approccio corrente è [scripts/analytics-vps/](../analytics-vps/) —
> VPS Linux dedicato, produzione mai coinvolta.

# Plausible self-hosted su wuic-framework.com (WSL2 + Docker su Windows Server)

Analytics privacy-first, self-hosted sul VPS Contabo (Windows Server 2025).
Plausible gira in Docker **dentro WSL2**, IIS fa da reverse proxy TLS su
`https://analytics.wuic-framework.com`.

## Perché questa architettura

Il VPS è Windows/IIS senza Docker nativo. Plausible (Elixir + ClickHouse +
Postgres) vuole Docker. La strada meno invasiva: WSL2 + Docker CE dentro
Ubuntu, tenuto vivo da un task SYSTEM, con IIS che proxya la porta locale.

Prerequisiti verificati sul server (2026-07):
- WSL + VirtualMachinePlatform: **disabilitati** → li abilita la fase 1 (reboot)
- IIS URL Rewrite + WebSocket: **presenti**
- IIS ARR: **assente** → lo installa la fase 3
- win-acme: presente in `C:\tools\win-acme\wacs.exe`
- DNS `analytics.wuic-framework.com`: già risolve sul server (wildcard)

⚠️ **La fase 1 riavvia il server** → butta giù per ~2-3 min tutti i siti IIS
(pubblico, demo, forum, crash receiver). Lanciarla in una finestra a basso
traffico. Nessun riavvio automatico ricorrente: è un one-shot esplicito.

## Runbook

### 1. Copia gli script sul server (direttamente nella cartella di lavoro)

```bash
# Dalla tua macchina, da C:\src\Wuic\WuicSite (Git Bash):
scp -r scripts/analytics/* Administrator@194.163.167.71:C:/wuic-analytics/
```

Nota: si copia dentro `C:\wuic-analytics` (la stessa cartella dove gira tutto),
NON in una `-src` separata. Così non c'è nessuna copia interna da sbagliare.
La `/*` finale mette i file *dentro* `wuic-analytics`, non in una sottocartella.

### 2. FASE 1 — abilita WSL + reboot (interattiva, come Administrator)

```powershell
cd C:\wuic-analytics
.\01-enable-wsl-and-reboot.ps1
```

Scarica e **valida** il rootfs Ubuntu *prima* di toccare il sistema (se il
download fallisce non riavvia niente), abilita le feature, registra la fase 2
come task SYSTEM @startup, poi riavvia dopo 15s (Ctrl+C per annullare).

Dry-run senza riavvio: `.\01-enable-wsl-and-reboot.ps1 -NoReboot`

### 3. FASE 2 — automatica dopo il reboot (come SYSTEM)

Parte da sola. Segui i log:

```powershell
Get-Content C:\wuic-analytics\phase2.log -Wait
```

Importa Ubuntu, installa Docker, tira su Plausible, registra il keep-alive,
si de-registra. La prima volta ClickHouse impiega qualche minuto. Fine quando
il log dice `Plausible RISPONDE su :8000`.

Verifica manuale:
```powershell
curl http://localhost:8000/api/health
```

### 4. FASE 3 — reverse proxy IIS + TLS (interattiva, come Administrator)

Solo **dopo** che :8000 risponde:

```powershell
cd C:\wuic-analytics-src
.\03-iis-reverse-proxy.ps1
```

Installa ARR, crea il sito `WuicAnalytics`, emette il certificato con win-acme,
crea il binding 443 + redirect http→https.

### 5. Primo utente + chiusura registrazione

1. Apri `https://analytics.wuic-framework.com` → crea l'utente admin.
2. Aggiungi il sito `wuic-framework.com` in Plausible → ottieni lo snippet.
3. Chiudi la registrazione (dentro WSL):
   ```powershell
   wsl -d UbuntuAnalytics -u root -- sed -i 's/DISABLE_REGISTRATION=false/DISABLE_REGISTRATION=true/' /opt/plausible/plausible-conf.env
   wsl -d UbuntuAnalytics -u root -- sh -c "cd /opt/plausible && docker compose up -d"
   ```

### 6. Snippet + goal sul sito

Nell'`<head>` di `src/index.html` (poi rebuild + deploy del sito):

```html
<script defer data-domain="wuic-framework.com"
        src="https://analytics.wuic-framework.com/js/script.js"></script>
<script>window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}</script>
```

I goal custom sono già cablati nel codice (chiamate `plausible('nome_evento')`):
- `sandbox_open` — CTA sandbox (home + /start, già presente in `start.ts`)
- `download_click` — CTA download (home + /start)
- `buy_click` — bottoni acquisto su /pricing (da aggiungere)
- `pricing_view` — pageview /pricing (automatico)

Crea gli stessi nomi come **Goals → Custom event** nella dashboard Plausible.

UTM su tutti i link outreach (dev.to/LinkedIn/posts.md):
`?utm_source=devto&utm_medium=article&utm_campaign=rag-chatbot` ecc.

## Manutenzione

- **Update Plausible**: `wsl -d UbuntuAnalytics -u root -- sh -c "cd /opt/plausible && docker compose pull && docker compose up -d"`
- **Log app**: `wsl -d UbuntuAnalytics -u root -- sh -c "cd /opt/plausible && docker compose logs -f plausible"`
- **Backup**: i volumi `db-data` (Postgres) + `event-data` (ClickHouse) vivono
  nella distro. Backup con `docker compose exec` + dump, oppure snapshot del
  vhdx della distro (`C:\wsl\UbuntuAnalytics`).
- **Rinnovo cert**: win-acme registra un task automatico, nessuna azione.

## Rollback

```powershell
Unregister-ScheduledTask WuicAnalyticsKeepWSL -Confirm:$false
Unregister-ScheduledTask WuicAnalyticsPhase2  -Confirm:$false -ErrorAction SilentlyContinue
wsl --unregister UbuntuAnalytics
Remove-Website WuicAnalytics
# le feature WSL/VMP possono restare abilitate senza effetti collaterali
```

## File

| File | Ruolo |
|---|---|
| `01-enable-wsl-and-reboot.ps1` | Fase 1: feature + download + reboot |
| `02-install-plausible.ps1` | Fase 2 (SYSTEM @startup): import + docker + plausible |
| `wsl-bootstrap.sh` | Dentro WSL: installa Docker, genera segreti, compose up |
| `plausible/docker-compose.yml` | Stack Plausible CE (app + postgres + clickhouse) |
| `plausible/plausible-conf.env.sample` | Template env (i segreti reali finiscono in `plausible-conf.env`, non versionato) |
| `03-iis-reverse-proxy.ps1` | Fase 3: ARR + sito IIS + TLS win-acme |
