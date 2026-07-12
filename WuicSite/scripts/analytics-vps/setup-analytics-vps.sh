#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Plausible CE self-hosted su VPS Linux DEDICATO (Ubuntu 24.04).
#
# Architettura decisa dopo l'incidente del 2026-07-12: mai piu' hypervisor/
# WSL/Docker sul VPS Windows di produzione (l'abilitazione feature WSL ha
# rotto il boot -> restore da backup). L'analytics vive su una macchina sua:
# blast radius zero verso sito/demo/forum.
#
# Uso (dal tuo PC, dopo aver creato il VPS Ubuntu 24.04 e aggiunto il DNS
# A-record analytics.wuic-framework.com -> IP del nuovo VPS):
#
#   scp -r scripts/analytics-vps root@<IP>:/opt/analytics-setup
#   ssh root@<IP> 'bash /opt/analytics-setup/setup-analytics-vps.sh'
#
# Idempotente: rilanciabile. TLS automatico via Caddy (niente certbot).
# ---------------------------------------------------------------------------
set -euo pipefail

SETUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAUSIBLE_DIR=/opt/plausible
BASE_URL="https://analytics.wuic-framework.com"

echo "== [1/6] Pacchetti base + Docker CE (repo ufficiale) =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw openssl
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "== [2/6] Firewall: solo 22/80/443 =="
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

echo "== [3/6] Aggiornamenti di sicurezza automatici =="
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== [4/6] Config Plausible in $PLAUSIBLE_DIR =="
mkdir -p "$PLAUSIBLE_DIR/clickhouse"
cp "$SETUP_DIR/docker-compose.yml" "$PLAUSIBLE_DIR/"
cp "$SETUP_DIR/Caddyfile"          "$PLAUSIBLE_DIR/"

# ClickHouse: logging alleggerito (i system-log tables mangiano disco inutilmente).
cat > "$PLAUSIBLE_DIR/clickhouse/config.xml" <<'CHCONF'
<clickhouse>
  <!-- Container senza IPv6: se resta solo <listen_host>::</listen_host> (default),
       tutti i bind falliscono e ClickHouse non ascolta su 8123 -> healthcheck ko.
       Forziamo il listen su IPv4. -->
  <listen_host>0.0.0.0</listen_host>
  <logger><level>warning</level><console>true</console></logger>
  <query_thread_log remove="remove"/>
  <query_log remove="remove"/>
  <text_log remove="remove"/>
  <trace_log remove="remove"/>
  <metric_log remove="remove"/>
  <asynchronous_metric_log remove="remove"/>
  <session_log remove="remove"/>
  <part_log remove="remove"/>
</clickhouse>
CHCONF
cat > "$PLAUSIBLE_DIR/clickhouse/user-config.xml" <<'CHUSER'
<clickhouse>
  <users>
    <default>
      <!-- L'immagine clickhouse-server porta un default-user.xml che limita
           l'utente default a localhost (::1/127.0.0.1). Plausible pero' si
           connette da un ALTRO container -> 403. Apriamo la rete: ClickHouse
           non pubblica porte fuori da Docker, resta interno allo stack. -->
      <networks replace="replace">
        <ip>0.0.0.0/0</ip>
      </networks>
    </default>
  </users>
  <profiles><default>
    <log_queries>0</log_queries>
    <log_query_threads>0</log_query_threads>
  </default></profiles>
</clickhouse>
CHUSER

# Segreti: generati una volta, poi riusati (rigenerarli invalida sessioni/2FA).
ENV_FILE="$PLAUSIBLE_DIR/plausible-conf.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "    genero i segreti"
  SECRET_KEY_BASE=$(openssl rand -base64 64 | tr -d '\n')
  TOTP_VAULT_KEY=$(openssl rand -base64 32 | tr -d '\n')
  sed -e "s|__BASE_URL__|${BASE_URL}|g" \
      -e "s|__SECRET_KEY_BASE__|${SECRET_KEY_BASE}|g" \
      -e "s|__TOTP_VAULT_KEY__|${TOTP_VAULT_KEY}|g" \
      "$SETUP_DIR/plausible-conf.env.sample" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "    plausible-conf.env esistente, riuso i segreti"
fi

echo "== [5/6] docker compose up =="
cd "$PLAUSIBLE_DIR"
docker compose pull -q
docker compose up -d
docker compose ps

echo "== [6/6] Attendo l'health di Plausible =="
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "    Plausible UP su :8000 (Caddy pubblica su 443 con TLS automatico)"
    break
  fi
  sleep 5
done

echo ""
echo "FATTO. Prossimi passi:"
echo "  1. verifica: https://analytics.wuic-framework.com (il cert Let's Encrypt"
echo "     arriva al primo hit, serve il DNS gia' puntato QUI)"
echo "  2. crea l'utente admin dalla pagina di registrazione"
echo "  3. chiudi la registrazione:"
echo "       sed -i 's/DISABLE_REGISTRATION=false/DISABLE_REGISTRATION=true/' $ENV_FILE"
echo "       cd $PLAUSIBLE_DIR && docker compose up -d"
