#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Chưa có Docker. Chạy sh scripts/install-docker-wsl.sh'; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker chưa sẵn sàng. Kiểm tra dịch vụ và quyền người dùng.'; exit 1; }
sh scripts/prepare.sh
docker compose build
docker compose up -d --wait --wait-timeout 300
if [ -f compose.monitoring.yaml ]; then
  check_logs=0
  if [ -f compose.logging.yaml ]; then check_logs=1; fi
  docker compose exec -T -e "CHECK_LOGS=$check_logs" app node < scripts/check-services.js
fi
echo 'Rạp Mây: http://localhost:8080 | phpMyAdmin: http://localhost:8081'
if [ -f compose.monitoring.yaml ]; then echo 'Grafana: http://localhost:3001 | Prometheus: http://localhost:9090'; fi
