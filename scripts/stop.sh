#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose down
echo 'Đã dừng; volume dữ liệu được giữ nguyên.'
