#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose --profile test run --rm tests
