#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test -s .local/secrets/cloudflare_tunnel_token || { echo 'Chưa có file tunnel token local.'; exit 1; }
chmod 644 .local/secrets/cloudflare_tunnel_token
docker compose -f compose.yaml -f compose.monitoring.yaml -f compose.logging.yaml -f compose.tunnel.yaml --profile tunnel up -d
docker compose -f compose.yaml -f compose.monitoring.yaml -f compose.logging.yaml -f compose.tunnel.yaml --profile tunnel ps cloudflared
