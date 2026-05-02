#!/usr/bin/env bash
# install.sh — WuicCore Linux one-liner installer.
#
# Hosted on https://wuic-framework.com/install.sh.
# Consumer-side bash script that downloads the latest tarball(s), verifies
# them, extracts them, and runs the install steps for the chosen audience.
#
# Two audiences:
#   - "demo"  → operator running WUIC as a system service (default).
#               Pre-compiled .NET app under /opt/wuiccore/app/, nginx vhost,
#               wuic-core.service + wuic-rag.service via systemd, full DB
#               seeded (minimal-metadata + tutorial-metadata + tutorial-data).
#   - "src"   → developer cloning + building from source.
#               Source tree extracted to /opt/wuic-src/ (or --src-dir),
#               owned by ${SUDO_USER} so the dev can edit + dotnet build.
#               No service; the dev runs `dotnet run` from the tree itself.
#
# By default install.sh deploys BOTH audiences (demo + src). Limit with
# --demo-only or --src-only.
#
# Quick start (operator):
#
#   curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- \
#     --dbms mssql --admin-password 'MyS3cret!' --hostname app.example.com
#
# Quick start (developer-only on a fresh box):
#
#   curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- \
#     --src-only --dbms both --admin-password 'DevPwd123!' --src-owner lollo
#
# Required flags:
#   --admin-password <pwd>   Initial password for the seeded `admin` user.
#                            ALWAYS required (unless --src-only without --with-db,
#                            in which case no admin user is provisioned and the
#                            flag is ignored — but harmless if passed).
#
# Audience selector flags (mutually exclusive; default = neither = both audiences):
#   --demo-only              Install only the runtime/demo half (current behavior:
#                            pre-compiled .NET, nginx, systemd, full tutorial seed).
#                            Skips the source tarball download + extract.
#   --src-only               Install only the developer source tree. Loads
#                            ONLY minimal-metadata into the DB by default
#                            (skip tutorial). No nginx, no systemd, no
#                            pre-compiled app deploy.
#   --with-db                In --src-only mode, ALSO load tutorial-metadata
#                            and tutorial-data seeds (matches what --demo-only
#                            does for the DB). Useful for devs who want a
#                            fully populated environment to explore.
#                            Ignored in --demo-only or default mode (already on).
#
# Source-tree placement (only relevant for --src-only or default both):
#   --src-dir <path>         Extraction destination (default: /opt/wuic-src).
#   --src-owner <user>       Owner of the src tree (default: ${SUDO_USER},
#                            i.e. the unprivileged user who invoked sudo).
#
# DBMS flags:
#   --dbms <mssql|mysql|both>  Database engine (default: mssql).
#                              'both' installs MSSQL + MySQL side-by-side;
#                              the active wuic-core profile defaults to mssql,
#                              re-pointable later by symlink.
#
# Misc demo-mode flags (ignored if --src-only):
#   --hostname <name>          nginx server_name (default: _ wildcard).
#   --skip-rag                 Don't install the Python RAG stack.
#   --with-tls                 Issue Let's Encrypt cert via certbot.
#   --with-e2e-tests           Provision the e2e users (admin role + guest_1)
#                              and force --seed-tutorial. Implies --with-db
#                              when combined with --src-only.
#   --anthropic-api-key <k>    Claude API key for the RAG chatbot.
#
# Misc:
#   --version <v>            Tarball version to download (default: latest).
#   --tarball-url <url>      Override the runtime tarball URL.
#   --src-tarball-url <url>  Override the src tarball URL (independent of
#                            --tarball-url; the two tarballs are downloaded
#                            separately when both audiences are selected).
#   --keep-staging           Don't delete /opt/wuiccore/staging after install.
#
# Idempotent: re-running picks up where the previous run left off via the
# state markers in /var/lib/wuiccore/.install-state/. Use --force to ignore.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults + arg parsing
# ---------------------------------------------------------------------------
DBMS="mssql"
ADMIN_PASSWORD=""
HOSTNAME_ARG="_"
WUIC_VERSION="latest"
TARBALL_URL=""
SRC_TARBALL_URL=""
SKIP_RAG=0
WITH_TLS=0
WITH_E2E_TESTS=0
KEEP_STAGING=0
ANTHROPIC_API_KEY=""

# Audience selector. Defaults: install BOTH demo + src.
DEMO_ONLY=0
SRC_ONLY=0
WITH_DB=0
SRC_DIR="/opt/wuic-src"
SRC_OWNER=""   # default resolved post-parse to ${SUDO_USER}

EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dbms)              DBMS="$2"; shift 2 ;;
    --admin-password)    ADMIN_PASSWORD="$2"; shift 2 ;;
    --hostname)          HOSTNAME_ARG="$2"; shift 2 ;;
    --version)           WUIC_VERSION="$2"; shift 2 ;;
    --tarball-url)       TARBALL_URL="$2"; shift 2 ;;
    --src-tarball-url)   SRC_TARBALL_URL="$2"; shift 2 ;;
    --skip-rag)          SKIP_RAG=1; shift ;;
    --with-tls)          WITH_TLS=1; shift ;;
    --with-e2e-tests)    WITH_E2E_TESTS=1; shift ;;
    --keep-staging)      KEEP_STAGING=1; shift ;;
    --anthropic-api-key) ANTHROPIC_API_KEY="$2"; shift 2 ;;
    --demo-only)         DEMO_ONLY=1; shift ;;
    --src-only)          SRC_ONLY=1; shift ;;
    --with-db)           WITH_DB=1; shift ;;
    --src-dir)           SRC_DIR="$2"; shift 2 ;;
    --src-owner)         SRC_OWNER="$2"; shift 2 ;;
    --force|--seed-tutorial|--skip-prefetch|--runtime-only)
      EXTRA_ARGS+=("$1"); shift ;;
    --client-max-body)   EXTRA_ARGS+=("$1" "$2"); shift 2 ;;
    -h|--help)
      sed -n '2,80p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve audience semantics
# ---------------------------------------------------------------------------
if [[ $DEMO_ONLY -eq 1 && $SRC_ONLY -eq 1 ]]; then
  echo "ERROR: --demo-only and --src-only are mutually exclusive." >&2
  exit 2
fi

# Audiences enabled. Default = both.
if [[ $DEMO_ONLY -eq 1 ]]; then
  INSTALL_DEMO=1; INSTALL_SRC=0
elif [[ $SRC_ONLY -eq 1 ]]; then
  INSTALL_DEMO=0; INSTALL_SRC=1
else
  INSTALL_DEMO=1; INSTALL_SRC=1
fi

# In demo mode tutorial seed is always loaded (--with-e2e-tests forces it
# anyway via install-all.sh). In src-only mode the tutorial seed is opt-in
# via --with-db. --with-e2e-tests on src-only implies --with-db.
if [[ $INSTALL_SRC -eq 1 && $INSTALL_DEMO -eq 0 ]]; then
  if [[ $WITH_E2E_TESTS -eq 1 && $WITH_DB -eq 0 ]]; then
    WITH_DB=1
    echo "[INFO] --src-only + --with-e2e-tests implies --with-db (need tutorial seed for e2e users)."
  fi
fi

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "This installer must be run as root (use sudo)." >&2
  exit 1
fi

# admin-password requirements:
#   - Mandatory in demo mode
#   - Mandatory in src-only --with-db (will provision admin via tutorial seed)
#   - Optional in src-only without --with-db (no admin row to provision; flag ignored)
if [[ $INSTALL_DEMO -eq 1 ]] || [[ $INSTALL_SRC -eq 1 && $WITH_DB -eq 1 ]]; then
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    echo "ERROR: --admin-password is required for demo mode or --src-only --with-db." >&2
    echo "Example: curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- --admin-password 'MyS3cret!'" >&2
    exit 2
  fi
fi

if [[ "$DBMS" != "mssql" && "$DBMS" != "mysql" && "$DBMS" != "both" ]]; then
  echo "ERROR: --dbms must be 'mssql', 'mysql', or 'both' (got '$DBMS')." >&2
  exit 2
fi

# Resolve --src-owner default. ${SUDO_USER} is the user who invoked `sudo`;
# falls back to root with a warning if install.sh was run as root directly.
if [[ $INSTALL_SRC -eq 1 ]]; then
  if [[ -z "$SRC_OWNER" ]]; then
    if [[ -n "${SUDO_USER:-}" ]]; then
      SRC_OWNER="$SUDO_USER"
    else
      SRC_OWNER="root"
      echo "[WARN] --src-owner not specified and SUDO_USER unset → defaulting to 'root'." >&2
      echo "[WARN] Recommended: pass --src-owner <username> so the dev can edit /opt/wuic-src/ without sudo." >&2
    fi
  fi
  if ! id -u "$SRC_OWNER" >/dev/null 2>&1; then
    echo "ERROR: --src-owner '$SRC_OWNER' is not an existing user on this system." >&2
    exit 2
  fi
fi

for cmd in curl tar sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: required command '$cmd' not found. Install it first (apt install $cmd)." >&2
    exit 1
  }
done

# Verify supported distro early so we fail fast rather than midway.
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  case "$ID:$VERSION_ID" in
    ubuntu:22.04|ubuntu:24.04|debian:12) ;;
    *) echo "WARN: Detected $PRETTY_NAME — only Ubuntu 22.04/24.04 and Debian 12 are tested. Continuing anyway." >&2 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Resolve tarball URLs
# ---------------------------------------------------------------------------
BASE_URL="https://wuic-framework.com/releases"

resolve_url() {
  local kind="$1"   # "" for runtime, "-src" for src
  local override="$2"
  if [[ -n "$override" ]]; then
    echo "$override"; return
  fi
  if [[ "$WUIC_VERSION" == "latest" ]]; then
    # NOTE: do NOT redirect-resolve via curl -I here. /etc/os-release was
    # `. sourced` earlier and exported VERSION="22.04.5 LTS (Jammy Jellyfish)"
    # into our scope — that's why this whole flow uses WUIC_VERSION instead.
    # Hit the canonical /releases/latest/ filename directly (it's a stable
    # alias maintained by deploy-site.ps1, not a redirect).
    echo "$BASE_URL/latest/wuic-framework-linux-x64${kind}.tar.gz"
  else
    echo "$BASE_URL/v${WUIC_VERSION}/wuic-framework-v${WUIC_VERSION}-linux-x64${kind}.tar.gz"
  fi
}

if [[ $INSTALL_DEMO -eq 1 ]]; then
  TARBALL_URL="$(resolve_url "" "$TARBALL_URL")"
  SHA_URL="${TARBALL_URL}.sha256"
fi
if [[ $INSTALL_SRC -eq 1 ]]; then
  SRC_TARBALL_URL="$(resolve_url "-src" "$SRC_TARBALL_URL")"
  SRC_SHA_URL="${SRC_TARBALL_URL}.sha256"
fi

# ---------------------------------------------------------------------------
# Download + verify
# ---------------------------------------------------------------------------
STAGING="/opt/wuiccore/staging"
mkdir -p "$STAGING"
cd "$STAGING"

download_and_verify() {
  local url="$1"
  local sha_url="$2"
  local outname="$3"   # e.g. tarball.tar.gz or src-tarball.tar.gz
  echo "[INFO] Downloading $url"
  curl -fL --progress-bar -o "$outname" "$url"
  echo "[INFO] Downloading checksum"
  curl -fsSL -o "${outname}.sha256" "$sha_url"
  local expected
  expected="$(awk '{print $1}' "${outname}.sha256")"
  echo "${expected}  ${outname}" > "${outname}.sha256.local"
  if ! sha256sum -c "${outname}.sha256.local" --quiet; then
    echo "ERROR: SHA256 mismatch for ${outname}. Expected: $expected" >&2
    exit 3
  fi
  echo "[ OK ] Checksum verified ($expected) for $outname"
}

if [[ $INSTALL_DEMO -eq 1 ]]; then
  download_and_verify "$TARBALL_URL" "$SHA_URL" "tarball.tar.gz"
fi
if [[ $INSTALL_SRC -eq 1 ]]; then
  download_and_verify "$SRC_TARBALL_URL" "$SRC_SHA_URL" "src-tarball.tar.gz"
fi

# ---------------------------------------------------------------------------
# Extract + run — DEMO branch
# ---------------------------------------------------------------------------
if [[ $INSTALL_DEMO -eq 1 ]]; then
  echo "[INFO] Extracting runtime tarball"
  EXTRACT_DIR="$STAGING/extracted"
  rm -rf "$EXTRACT_DIR"
  mkdir -p "$EXTRACT_DIR"
  tar xzf tarball.tar.gz -C "$EXTRACT_DIR"

  LINUX_DIR="$EXTRACT_DIR/scripts/linux"
  # Ensure shell scripts are executable (Windows tarballs strip +x bits).
  find "$LINUX_DIR" -maxdepth 1 -name '*.sh' -type f -exec chmod +x {} \; 2>/dev/null || true

  [[ -f "$LINUX_DIR/install-all.sh" ]] || {
    echo "ERROR: tarball is missing scripts/linux/install-all.sh — corrupt or wrong tarball?" >&2
    exit 4
  }
  [[ -x "$LINUX_DIR/install-all.sh" ]] || {
    echo "ERROR: scripts/linux/install-all.sh extracted but not executable (chmod +x failed?)." >&2
    exit 4
  }

  # Build install-all.sh argument vector.
  INSTALL_ARGS=(
    --dbms "$DBMS"
    --admin-password "$ADMIN_PASSWORD"
    --seed-tutorial
  )
  [[ "$HOSTNAME_ARG" != "_" ]]   && INSTALL_ARGS+=(--domain "$HOSTNAME_ARG")
  [[ $SKIP_RAG       -eq 1 ]]    && INSTALL_ARGS+=(--skip-rag)
  [[ $WITH_TLS       -eq 1 ]]    && INSTALL_ARGS+=(--with-tls)
  [[ $WITH_E2E_TESTS -eq 1 ]]    && INSTALL_ARGS+=(--with-e2e-tests)
  [[ -n "$ANTHROPIC_API_KEY" ]]  && INSTALL_ARGS+=(--anthropic-api-key "$ANTHROPIC_API_KEY")
  INSTALL_ARGS+=(--from-artifact "$EXTRACT_DIR" --from-www "$EXTRACT_DIR/wwwroot")
  INSTALL_ARGS+=("${EXTRA_ARGS[@]}")

  echo "[INFO] Running scripts/linux/install-all.sh ${INSTALL_ARGS[*]}"
  bash "$LINUX_DIR/install-all.sh" "${INSTALL_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Extract + run — SRC branch
# ---------------------------------------------------------------------------
if [[ $INSTALL_SRC -eq 1 ]]; then
  echo "[INFO] Extracting src tarball to $SRC_DIR (owner=$SRC_OWNER)"
  mkdir -p "$SRC_DIR"
  tar xzf src-tarball.tar.gz -C "$SRC_DIR"
  chown -R "${SRC_OWNER}:${SRC_OWNER}" "$SRC_DIR"
  chmod 0755 "$SRC_DIR"

  SRC_LINUX_DIR="$SRC_DIR/wuicCore/scripts/linux"
  if [[ -d "$SRC_LINUX_DIR" ]]; then
    find "$SRC_LINUX_DIR" -maxdepth 1 -name '*.sh' -type f -exec chmod +x {} \; 2>/dev/null || true
  fi

  # SRC-ONLY mode: install.sh orchestrates the minimum set of steps directly,
  # bypassing install-all.sh (which is "full production" oriented). We need:
  #   00 prereqs           (apt base + wuiccore user + dirs)
  #   10 dotnet            (.NET 10 SDK)
  #   20|21 dbms install   (mssql, mysql, or both)
  #   30|31 bootstrap      (load minimal-metadata; +tutorial if --with-db)
  #   22 secrets profiles  (--no-symlink: only render /etc/wuiccore/appsettings.{mssql,mysql}.json)
  # NOT run: 40 (no RAG in src-only), 50 (no publish — dev runs from src),
  #          60 (no systemd — dev runs interactively), 70 (no nginx).
  if [[ $INSTALL_DEMO -eq 0 ]]; then
    SEED_FLAG=""
    [[ $WITH_DB -eq 1 ]] && SEED_FLAG="--seed-tutorial"

    # Use the steps from the src tarball. They're identical to the ones in the
    # runtime tarball, but we want a single source of truth on a src-only box.
    echo
    echo "================================================================="
    echo " SRC-ONLY install: orchestrating minimal step set from $SRC_LINUX_DIR"
    echo " DBMS=$DBMS, with-db=$WITH_DB, src-dir=$SRC_DIR, src-owner=$SRC_OWNER"
    echo "================================================================="
    bash "$SRC_LINUX_DIR/00-prereqs.sh"
    bash "$SRC_LINUX_DIR/10-install-dotnet.sh"
    if [[ "$DBMS" == "mssql" || "$DBMS" == "both" ]]; then
      bash "$SRC_LINUX_DIR/20-install-mssql.sh"
      if [[ -n "$SEED_FLAG" ]]; then
        bash "$SRC_LINUX_DIR/30-bootstrap-databases.sh" "$SEED_FLAG"
      else
        bash "$SRC_LINUX_DIR/30-bootstrap-databases.sh"
      fi
    fi
    if [[ "$DBMS" == "mysql" || "$DBMS" == "both" ]]; then
      bash "$SRC_LINUX_DIR/21-install-mysql.sh"
      if [[ -n "$SEED_FLAG" ]]; then
        bash "$SRC_LINUX_DIR/31-bootstrap-mysql-databases.sh" "$SEED_FLAG"
      else
        bash "$SRC_LINUX_DIR/31-bootstrap-mysql-databases.sh"
      fi
    fi
    # Render /etc/wuiccore/appsettings.{mssql,mysql}.json without symlinking
    # (because /opt/wuiccore/app/ doesn't exist in src-only mode).
    bash "$SRC_LINUX_DIR/22-write-secrets-profiles.sh" --no-symlink

    # Provision admin user (and optionally e2e users) in the metadataDB(s) we
    # bootstrapped above. Without this, --admin-password would be silently
    # ignored on src-only — utenti table stays empty and login fails.
    # For --dbms both we run step 35 against each DBMS so both metadataDBs
    # have the same admin/e2e users.
    if [[ -n "$ADMIN_PASSWORD" || $WITH_E2E_TESTS -eq 1 ]]; then
      step35_args=()
      [[ -n "$ADMIN_PASSWORD" ]]  && step35_args+=(--admin-password "$ADMIN_PASSWORD")
      [[ $WITH_E2E_TESTS -eq 1 ]] && step35_args+=(--with-e2e-tests)
      if [[ "$DBMS" == "mssql" || "$DBMS" == "both" ]]; then
        bash "$SRC_LINUX_DIR/35-provision-auth-users.sh" --dbms mssql "${step35_args[@]}"
      fi
      if [[ "$DBMS" == "mysql" || "$DBMS" == "both" ]]; then
        bash "$SRC_LINUX_DIR/35-provision-auth-users.sh" --dbms mysql "${step35_args[@]}"
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Final cleanup
# ---------------------------------------------------------------------------
if [[ $KEEP_STAGING -eq 0 ]]; then
  echo "[INFO] Cleaning up $STAGING (use --keep-staging to preserve)"
  rm -rf "$STAGING"
fi

# ---------------------------------------------------------------------------
# Summary banner
# ---------------------------------------------------------------------------
RESOLVED_HOST="${HOSTNAME_ARG/#_/$(hostname -I | awk '{print $1}')}"

echo
echo "================================================================="
echo " Install complete."
echo "================================================================="
if [[ $INSTALL_DEMO -eq 1 ]]; then
  echo " [demo runtime]"
  echo "   URL:    http://${RESOLVED_HOST}/"
  echo "   Login:  admin / <the password you passed via --admin-password>"
  echo "   Set the WUIC license: log in, AppSettings Editor → License tab,"
  echo "     paste license-payload + license-signature provided at purchase."
  if [[ $WITH_E2E_TESTS -eq 1 ]]; then
    echo
    echo "   E2E test users provisioned:"
    echo "     wuic_e2e_admin   / E2E_Admin123!  (dispatcher / API user)"
    echo "     wuic_e2e_admin_2 / E2E_Admin123!  (browser UI login)"
    echo "     wuic_e2e_admin_3 / E2E_Admin123!  (spare — multi-session tests)"
    echo "     guest_1          / guest_1        (autenticazione-autorizzazioni)"
    if [[ "$DBMS" == "mysql" ]]; then
      DISPATCHER="scripts/docs-driven-tests-mysql.ps1"
    else
      DISPATCHER="scripts/docs-driven-tests.ps1"
    fi
    echo
    echo "   Run docs-driven Playwright suite from a workstation:"
    echo "     pwsh ${DISPATCHER} \\"
    echo "       -BackendBaseUrl  http://${RESOLVED_HOST}/ \\"
    echo "       -FrontendBaseUrl http://${RESOLVED_HOST}/"
  fi
fi
if [[ $INSTALL_SRC -eq 1 ]]; then
  echo
  echo " [developer source tree]"
  echo "   Path:   $SRC_DIR/ (owner: $SRC_OWNER)"
  echo "   Build:  cd $SRC_DIR/wuicCore && dotnet build -c Release"
  echo "   Run:    cd $SRC_DIR/wuicCore && ASPNETCORE_ENVIRONMENT=Development dotnet run"
  echo "   Docs:   cat $SRC_DIR/README.linux-src.md"
  if [[ $INSTALL_DEMO -eq 1 ]]; then
    echo
    echo "   NOTE: the demo wuic-core.service is bound to port 5000."
    echo "   To run the dev backend interactively, stop it first:"
    echo "     sudo systemctl stop wuic-core wuic-rag"
  fi
  if [[ $INSTALL_DEMO -eq 0 ]]; then
    echo
    echo "   Active appsettings profiles (no Production.json symlink in src-only):"
    echo "     /etc/wuiccore/appsettings.mssql.json"
    [[ "$DBMS" == "mysql" || "$DBMS" == "both" ]] && \
      echo "     /etc/wuiccore/appsettings.mysql.json"
    echo "   Copy the desired one into your dev tree before \`dotnet run\`:"
    echo "     cp /etc/wuiccore/appsettings.mssql.json $SRC_DIR/wuicCore/appsettings.Development.json"
  fi
fi
echo "================================================================="
