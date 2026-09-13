#!/usr/bin/env bash
# Stops and removes the Speculos container started by speculos-start.sh.
set -euo pipefail

CONTAINER_NAME="husky-agent-speculos"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "Speculos stopped."
else
  echo "Speculos container ($CONTAINER_NAME) is not running."
fi
