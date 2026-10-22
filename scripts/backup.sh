#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p .local/backups
file=".local/backups/cinema-$(date +%Y%m%d-%H%M%S).sql"
docker compose exec -T mysql sh -ec 'export MYSQL_PWD=$(cat /run/secrets/db_root_password); exec mysqldump -uroot --single-transaction --no-tablespaces --set-gtid-purged=OFF cinema' > "$file"
test -s "$file"
printf 'Đã sao lưu: %s\n' "$file"
