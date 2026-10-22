#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p .local/secrets
chmod 700 .local .local/secrets
if [ ! -f .local/secrets/db_app_password ]; then
  value=${RAPMAY_BOOTSTRAP_PASSWORD:-}
  if [ -z "$value" ] && [ -f .local/bootstrap_password ]; then value=$(cat .local/bootstrap_password); fi
  if [ -z "$value" ]; then
    printf 'Nhập mật khẩu khởi tạo các dịch vụ: '
    if [ -t 0 ]; then stty -echo; trap 'stty echo' EXIT INT TERM; fi
    IFS= read -r value
    if [ -t 0 ]; then stty echo; trap - EXIT INT TERM; fi
    printf '\n'
  fi
  [ ${#value} -ge 6 ] || { echo 'Cần ít nhất 6 ký tự.' >&2; exit 1; }
  case "$value" in *[!a-zA-Z0-9._@!+-]*) echo 'Chỉ dùng chữ, số và . _ @ ! + -' >&2; exit 1;; esac
  for name in db_root_password db_app_password db_migrate_password db_admin_password db_exporter_password admin_password grafana_password; do
    printf '%s' "$value" > ".local/secrets/$name"
  done
  unset value
fi
if [ ! -f .local/secrets/session_secret ]; then od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > .local/secrets/session_secret; fi
printf '[client]\nuser=cinema_exporter\npassword=%s\nhost=mysql\nport=3306\n' "$(cat .local/secrets/db_exporter_password)" > .local/secrets/mysqld_exporter.cnf
files=compose.yaml
for file in compose.monitoring.yaml compose.logging.yaml; do
  if [ -f "$file" ]; then files="$files,$file"; fi
done
printf 'COMPOSE_PROJECT_NAME=de11datvewsl\nCOMPOSE_PATH_SEPARATOR=,\nCOMPOSE_FILE=%s\n' "$files" > .env
chmod 644 .local/secrets/*
printf 'Đã chuẩn bị cấu hình. Chạy sh scripts/start.sh để khởi động.\n'
