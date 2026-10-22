#!/bin/sh
set -eu
export MYSQL_PWD="$(cat /run/secrets/db_root_password)"
app_password=$(cat /run/secrets/db_app_password)
migrate_password=$(cat /run/secrets/db_migrate_password)
admin_password=$(cat /run/secrets/db_admin_password)
exporter_password=$(cat /run/secrets/db_exporter_password)
# Các file secret được kiểm tra ký tự trước khi sử dụng để khởi tạo.
for value in "$app_password" "$migrate_password" "$admin_password" "$exporter_password"; do
  case "$value" in ''|*[!a-zA-Z0-9._@!+-]*) echo 'Secret DB chứa ký tự không được hỗ trợ.' >&2; exit 1;; esac
done
mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS cinema CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'cinema_app'@'%' IDENTIFIED BY '${app_password}';
GRANT SELECT, INSERT, UPDATE, DELETE ON cinema.* TO 'cinema_app'@'%';
CREATE USER IF NOT EXISTS 'cinema_migrate'@'%' IDENTIFIED BY '${migrate_password}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON cinema.* TO 'cinema_migrate'@'%';
CREATE USER IF NOT EXISTS 'cinema_admin'@'%' IDENTIFIED BY '${admin_password}';
GRANT ALL PRIVILEGES ON cinema.* TO 'cinema_admin'@'%';
CREATE USER IF NOT EXISTS 'cinema_exporter'@'%' IDENTIFIED BY '${exporter_password}' WITH MAX_USER_CONNECTIONS 3;
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'cinema_exporter'@'%';
SQL
unset MYSQL_PWD app_password migrate_password admin_password exporter_password
