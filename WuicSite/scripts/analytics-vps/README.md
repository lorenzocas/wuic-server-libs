# Plausible self-hosted — VPS Linux dedicato

Sostituisce l'approccio WSL-su-produzione di `scripts/analytics/` (**deprecato**
dopo l'incidente del 2026-07-12: abilitare le feature WSL sul VPS Windows di
produzione ha corrotto il boot → restore da Auto Backup Contabo).

**Principio: l'analytics vive su una macchina sua.** Se ClickHouse impazzisce,
muore solo l'analytics — sito, demo e forum non lo sanno nemmeno.

## Cosa serve

1. **VPS Linux** (Ubuntu 24.04) — basta il taglio minimo:
   - Contabo VPS S (~4.50 €/m) — stesso pannello che già usi
   - Hetzner CX22 (~4 €/m) — alternativa
   - 2 vCPU / 4 GB bastano larghi per Plausible a questo traffico
2. **DNS**: A-record esplicito `analytics.wuic-framework.com → <IP nuovo VPS>`
   nel tab **DNS Management** del pannello Contabo. Il record esplicito vince
   sul wildcard `*.wuic-framework.com` che punta alla produzione.

## Setup (5 minuti dopo la creazione del VPS)

```bash
# dal tuo PC, da C:\src\Wuic\WuicSite (Git Bash):
scp -r scripts/analytics-vps root@<IP>:/opt/analytics-setup
ssh root@<IP> 'bash /opt/analytics-setup/setup-analytics-vps.sh'
```

Lo script (idempotente): Docker CE ufficiale → UFW (solo 22/80/443) →
unattended-upgrades → Plausible CE + Postgres + ClickHouse + **Caddy**
(TLS Let's Encrypt automatico, zero certbot/IIS).

## Post-setup

1. `https://analytics.wuic-framework.com` → registra l'utente admin
2. Aggiungi il sito `wuic-framework.com` → Plausible ti dà lo snippet
3. Chiudi la registrazione:
   ```bash
   ssh root@<IP> "sed -i 's/DISABLE_REGISTRATION=false/DISABLE_REGISTRATION=true/' /opt/plausible/plausible-conf.env && cd /opt/plausible && docker compose up -d"
   ```
4. Snippet nell'`<head>` di `src/index.html` (poi build+deploy sito):
   ```html
   <script defer data-domain="wuic-framework.com"
           src="https://analytics.wuic-framework.com/js/script.js"></script>
   <script>window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}</script>
   ```
5. Goals custom in dashboard (i nomi sono già cablati nel codice del sito):
   `sandbox_open` · `download_click` · `buy_click` · `pricing_view`

## Manutenzione

- Update: `ssh root@<IP> "cd /opt/plausible && docker compose pull && docker compose up -d"`
- Log: `ssh root@<IP> "cd /opt/plausible && docker compose logs -f plausible"`
- Backup: volumi `db-data` + `event-data`; per iniziare basta lo snapshot
  del VPS dal pannello (1 click, prima di ogni update)
