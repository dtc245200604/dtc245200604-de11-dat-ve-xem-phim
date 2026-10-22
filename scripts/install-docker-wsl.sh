#!/bin/sh
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Chạy sudo sh scripts/install-docker-wsl.sh'; exit 1; }
. /etc/os-release
[ "$ID" = ubuntu ] || { echo 'Script dành cho Ubuntu.'; exit 1; }
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
if [ -n "${SUDO_USER:-}" ]; then usermod -aG docker "$SUDO_USER"; fi
docker compose version
echo 'Mở lại phiên WSL nếu vừa được thêm vào nhóm docker.'
