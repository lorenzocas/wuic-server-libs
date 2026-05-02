#!/usr/bin/env bash
# install.sh — WuicCore Linux one-liner installer.
#
# Hosted on https://wuic-framework.com/install.sh.
# Consumer-side bash script that downloads the latest tarball, verifies it,
# extracts it, and runs scripts/linux/install-all.sh with the operator's flags.
#
# Quick start:
#
#   curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- \
#     --dbms mssql --admin-password 'MyS3cret!' --hostname app.example.com
#
# Required flags:
#   --admin-password <pwd>   Initial password for the seeded `admin` user. The
#                            tutorial-metadata seed ships admin/admin as a
#                            placeholder; this flag re-hashes the password
#                            after schema load so the credentials never leave
#                            their default value on disk.
#
# Optional flags:
#   --dbms <mssql|mysql>     Database engine (default: mssql).
#   --hostname <name>        nginx server_name (default: _ wildcard).
#   --version <v>            Tarball version to download (default: latest from
#                            https://wuic-framework.com/releases/latest).
#   --skip-rag               Don't install the Python RAG stack.
#   --with-tls               Issue a Let's Encrypt cert via certbot (requires
#                            real --hostname pointing at this box).
#   --with-e2e-tests         Provision the four e2e test users:
#                              wuic_e2e_admin / _2 / _3 (admin role 1, password 'E2E_Admin123!')
#                              guest_1 (guest role 16, password 'guest_1' — required by
#                                the autenticazione-autorizzazioni docs-driven scenarios)
#                            and force --seed-tutorial so the docs-driven
#                            Playwright suite (testmaster, testdetail,
#                            uploadsample, ...) can run against this host.
#   --anthropic-api-key <k>  Anthropic Claude API key (sk-ant-api03-...) for
#                            the RAG chatbot. Without it the rag server stays
#                            in retrieval-only mode (returns top-K chunks but
#                            no LLM-generated answer). The key is written to
#                            /etc/wuiccore/secrets.master with mode 0600 and
#                            picked up by wuic-rag.service via EnvironmentFile.
#   --keep-staging           Don't delete /opt/wuiccore/staging after install.
#   --tarball-url <url>      Override the download URL (for staging / mirrors).
#
# Idempotent: re-running picks up where the previous run left off via the state
# markers in /var/lib/wuiccore/.install-state/. Use --force to ignore them.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults + arg parsing
# ---------------------------------------------------------------------------
DBMS="mssql"
ADMIN_PASSWORD=""
HOSTNAME_ARG="_"
VERSION="latest"
TARBALL_URL=""
SKIP_RAG=0
WITH_TLS=0
WITH_E2E_TESTS=0
KEEP_STAGING=0
ANTHROPIC_API_KEY=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dbms)              DBMS="$2"; shift 2 ;;
    --admin-password)    ADMIN_PASSWORD="$2"; shift 2 ;;
    --hostname)          HOSTNAME_ARG="$2"; shift 2 ;;
    --version)           VERSION="$2"; shift 2 ;;
    --tarball-url)       TARBALL_URL="$2"; shift 2 ;;
    --skip-rag)          SKIP_RAG=1; shift ;;
    --with-tls)          WITH_TLS=1; shift ;;
    --with-e2e-tests)    WITH_E2E_TESTS=1; shift ;;
    --keep-staging)      KEEP_STAGING=1; shift ;;
    --anthropic-api-key) ANTHROPIC_API_KEY="$2"; shift 2 ;;
    --force|--seed-tutorial|--skip-prefetch|--runtime-only)
      EXTRA_ARGS+=("$1"); shift ;;
    --client-max-body)   EXTRA_ARGS+=("$1" "$2"); shift 2 ;;
    -h|--help)
      sed -n '2,40p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "This installer must be run as root (use sudo)." >&2
  exit 1
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: --admin-password is required." >&2
  echo "Example: curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- --admin-password 'MyS3cret!'" >&2
  exit 2
fi
if [[ "$DBMS" != "mssql" && "$DBMS" != "mysql" ]]; then
  echo "ERROR: --dbms must be 'mssql' or 'mysql' (got '$DBMS')." >&2
  exit 2
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
# Resolve tarball URL
# ---------------------------------------------------------------------------
BASE_URL="https://wuic-framework.com/releases"
if [[ -z "$TARBALL_URL" ]]; then
  if [[ "$VERSION" == "latest" ]]; then
    # The /releases/latest endpoint redirects to the current versioned filename.
    # Use -I + Location header so we can echo the resolved version to the user.
    RESOLVED="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$BASE_URL/latest/wuic-framework-linux-x64.tar.gz")"
    if [[ -z "$RESOLVED" ]]; then
      echo "ERROR: could not resolve latest version URL." >&2
      exit 1
    fi
    TARBALL_URL="$RESOLVED"
  else
    TARBALL_URL="$BASE_URL/v${VERSION}/wuic-framework-v${VERSION}-linux-x64.tar.gz"
  fi
fi
SHA_URL="${TARBALL_URL}.sha256"

# ---------------------------------------------------------------------------
# Download + verify
# ---------------------------------------------------------------------------
STAGING="/opt/wuiccore/staging"
mkdir -p "$STAGING"
cd "$STAGING"

echo "[INFO] Downloading $TARBALL_URL"
curl -fL --progress-bar -o tarball.tar.gz "$TARBALL_URL"
echo "[INFO] Downloading checksum"
curl -fsSL -o tarball.sha256 "$SHA_URL"

# The .sha256 file is "<hash>  <filename>". Replace its filename with our local
# `tarball.tar.gz` so `sha256sum -c` validates against the right path.
EXPECTED_HASH="$(awk '{print $1}' tarball.sha256)"
echo "${EXPECTED_HASH}  tarball.tar.gz" > tarball.sha256.local
if ! sha256sum -c tarball.sha256.local --quiet; then
  echo "ERROR: SHA256 mismatch. Expected: $EXPECTED_HASH" >&2
  exit 3
fi
echo "[ OK ] Checksum verified ($EXPECTED_HASH)"

# ---------------------------------------------------------------------------
# Extract + run
# ---------------------------------------------------------------------------
echo "[INFO] Extracting tarball"
EXTRACT_DIR="$STAGING/extracted"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
tar xzf tarball.tar.gz -C "$EXTRACT_DIR"

LINUX_DIR="$EXTRACT_DIR/scripts/linux"
# Ensure shell scripts are executable. Tarballs produced on Windows (deploy-release.ps1
# uses the bundled bsdtar/Compress-Archive style packing) frequently strip the +x
# bits because NTFS doesn't track them. Without this chmod, the next `[[ -x ... ]]`
# check would falsely report the tarball as corrupt.
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
[[ "$HOSTNAME_ARG" != "_" ]] && INSTALL_ARGS+=(--domain "$HOSTNAME_ARG")
[[ $SKIP_RAG       -eq 1 ]] && INSTALL_ARGS+=(--skip-rag)
[[ $WITH_TLS       -eq 1 ]] && INSTALL_ARGS+=(--with-tls)
[[ $WITH_E2E_TESTS -eq 1 ]] && INSTALL_ARGS+=(--with-e2e-tests)
[[ -n "$ANTHROPIC_API_KEY" ]] && INSTALL_ARGS+=(--anthropic-api-key "$ANTHROPIC_API_KEY")
INSTALL_ARGS+=(--from-artifact "$EXTRACT_DIR" --from-www "$EXTRACT_DIR/wwwroot")
INSTALL_ARGS+=("${EXTRA_ARGS[@]}")

echo "[INFO] Running scripts/linux/install-all.sh ${INSTALL_ARGS[*]}"
bash "$LINUX_DIR/install-all.sh" "${INSTALL_ARGS[@]}"

# ---------------------------------------------------------------------------
# Final cleanup
# ---------------------------------------------------------------------------
if [[ $KEEP_STAGING -eq 0 ]]; then
  echo "[INFO] Cleaning up $STAGING (use --keep-staging to preserve)"
  rm -rf "$STAGING"
fi

echo
echo "================================================================="
echo " Install complete."
echo " Open: http://${HOSTNAME_ARG/#_/$(hostname -I | awk '{print $1}')}/"
echo " Login: admin / <the password you passed via --admin-password>"
echo " Set the WUIC license: log in, go to AppSettings Editor, paste the"
echo "   license-payload + license-signature provided when you purchased."
if [[ $WITH_E2E_TESTS -eq 1 ]]; then
  echo
  echo " E2E test users provisioned:"
  echo "   wuic_e2e_admin   / E2E_Admin123!  (dispatcher / API user, isAdmin=1, role=1)"
  echo "   wuic_e2e_admin_2 / E2E_Admin123!  (browser user — UI login, isAdmin=1, role=1)"
  echo "   wuic_e2e_admin_3 / E2E_Admin123!  (spare — multi-session tests, isAdmin=1, role=1)"
  echo "   guest_1          / guest_1        (autenticazione-autorizzazioni scenarios, isAdmin=0, role=16)"
  if [[ "$DBMS" == "mysql" ]]; then
    DISPATCHER="scripts/docs-driven-tests-mysql.ps1"
  else
    DISPATCHER="scripts/docs-driven-tests.ps1"
  fi
  RESOLVED_HOST="${HOSTNAME_ARG/#_/$(hostname -I | awk '{print $1}')}"
  echo " Run the docs-driven Playwright suite from a workstation with:"
  echo "   pwsh ${DISPATCHER} \\"
  echo "     -BackendBaseUrl  http://${RESOLVED_HOST}/ \\"
  echo "     -FrontendBaseUrl http://${RESOLVED_HOST}/"
fi
echo "================================================================="
