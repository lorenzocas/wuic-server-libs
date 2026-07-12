#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Plausible self-hosted — bootstrap dentro WSL/Ubuntu (eseguito come root
# dalla fase 2). Installa Docker, genera i segreti, tira su Plausible.
# Idempotente: rilanciabile senza danni.
# ---------------------------------------------------------------------------
set -euo pipefail

WORK=/mnt/c/wuic-analytics
PLAUSIBLE_DIR=/opt/plausible
BASE_URL="https://analytics.wuic-framework.com"

echo "[wsl] apt update + Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# docker.io + il plugin compose v2 (fornisce 'docker compose'): niente repo
# esterni, tutto da universe. Sufficiente per uno stack self-hosted.
apt-get install -y docker.io docker-compose-v2 openssl ca-certificates

echo "[wsl] Abilito Docker via systemd (wsl.conf ha systemd=true)"
systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker  >/dev/null 2>&1 || true
# Attendo che il socket sia pronto.
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 2
done
docker version || { echo "[wsl] ERRORE: dockerd non attivo"; exit 1; }

echo "[wsl] Preparo $PLAUSIBLE_DIR"
mkdir -p "$PLAUSIBLE_DIR/clickhouse"
cp "$WORK/plausible/docker-compose.yml" "$PLAUSIBLE_DIR/docker-compose.yml"

# Config ClickHouse: taglia il logging verboso e disabilita i sistemi di
# telemetria interni che su un box condiviso mangiano I/O e disco inutilmente.
cat > "$PLAUSIBLE_DIR/clickhouse/config.xml" <<'CHCONF'
<clickhouse>
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
  <profiles><default>
    <log_queries>0</log_queries>
    <log_query_threads>0</log_query_threads>
  </default></profiles>
</clickhouse>
CHUSER

# Segreti: generati UNA volta e persistiti. Se il file esiste, lo riuso
# (rigenerarli invaliderebbe sessioni e 2FA gia' emessi).
ENV_FILE="$PLAUSIBLE_DIR/plausible-conf.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[wsl] Genero i segreti Plausible"
  SECRET_KEY_BASE=$(openssl rand -base64 64 | tr -d '\n')
  TOTP_VAULT_KEY=$(openssl rand -base64 32 | tr -d '\n')
  # Parto dal template versionato e sostituisco i placeholder.
  sed -e "s|__BASE_URL__|${BASE_URL}|g" \
      -e "s|__SECRET_KEY_BASE__|${SECRET_KEY_BASE}|g" \
      -e "s|__TOTP_VAULT_KEY__|${TOTP_VAULT_KEY}|g" \
      "$WORK/plausible/plausible-conf.env.sample" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "[wsl] plausible-conf.env gia' presente, riuso i segreti esistenti"
fi

echo "[wsl] docker compose up -d"
cd "$PLAUSIBLE_DIR"
docker compose pull
docker compose up -d

echo "[wsl] Stato container:"
docker compose ps

echo "[wsl] Bootstrap completato. Plausible pubblica su 127.0.0.1:8000 (lato WSL)."
echo "[wsl] WSL localhostForwarding inoltra Windows localhost:8000 -> distro."
