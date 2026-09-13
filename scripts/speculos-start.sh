#!/usr/bin/env bash
# Starts the Speculos emulator (Docker) loaded with TESTNET_MNEMONIC from
# .env.testnet, exposing the APDU port the signer connects to
# (SPECULOS_TRANSPORT_URL, default 127.0.0.1:40000). See docs/05-signing-spec.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.testnet"
CONTAINER_NAME="husky-agent-speculos"
APP_ELF="${REPO_ROOT}/assets/app.elf"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.testnet.example to .env.testnet first." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ -z "${TESTNET_MNEMONIC:-}" ]; then
  echo "TESTNET_MNEMONIC is not set in $ENV_FILE." >&2
  exit 1
fi

if [ ! -s "$APP_ELF" ]; then
  echo "Missing or empty Ethereum app binary at $APP_ELF." >&2
  echo "Speculos needs a real Nano X/Nano S+ Ethereum app .elf — Ledger doesn't" >&2
  echo "bundle it in the base speculos image. Build it from" >&2
  echo "https://github.com/LedgerHQ/app-ethereum (or obtain a prebuilt release" >&2
  echo "artifact for your target model) and place it at $APP_ELF before running this." >&2
  exit 1
fi

APDU_PORT="${SPECULOS_TRANSPORT_URL##*:}"
APDU_PORT="${APDU_PORT:-40000}"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Removing existing $CONTAINER_NAME container..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Starting Speculos on APDU port ${APDU_PORT}..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${APDU_PORT}:40000" \
  -p "5000:5000" \
  -v "${APP_ELF}:/app/app.elf" \
  ghcr.io/ledgerhq/speculos:latest \
  --model nanox \
  --seed "$TESTNET_MNEMONIC" \
  /app/app.elf

echo "Speculos started (container: ${CONTAINER_NAME}, APDU: 127.0.0.1:${APDU_PORT})."
echo "Health-check it with the CLI, or: curl -s http://127.0.0.1:5000/events"
