#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
file=${1:?Dùng: sh scripts/restore.sh .local/backups/ten-file.sql}
test -s "$file"
printf 'Khôi phục sẽ thay dữ liệu hiện tại. Nhập RESTORE để tiếp tục: '
read -r answer
[ "$answer" = RESTORE ] || exit 1
docker compose stop app
trap 'docker compose start app' EXIT
docker compose exec -T mysql sh -ec 'export MYSQL_PWD=$(cat /run/secrets/db_root_password); exec mysql -uroot cinema' < "$file"
echo 'Khôi phục hoàn tất.'
