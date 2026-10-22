#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
logs=0
if [ "${1:-}" = --logs ]; then logs=1; fi
docker compose run --rm -T --no-deps -e CHECK_LOGS="$logs" -v "$PWD/.local/secrets/grafana_password:/run/secrets/grafana_password:ro" app node --input-type=module < scripts/verify.mjs
