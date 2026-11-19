#!/usr/bin/env bash
# Only on an ephemeral Ubuntu 24.04 x64 runner; no secrets in this step.
set -euo pipefail
test "$(uname -m)" = x86_64
. /etc/os-release
test "$ID:$VERSION_ID" = ubuntu:24.04
test -n "${RUNNER_TEMP:-}"
test -n "${GITHUB_PATH:-}"
tool_dir="$RUNNER_TEMP/arandu-recovery-tools"
mkdir -p "$tool_dir"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 20 --max-time 120 --retry 5 --retry-all-errors --retry-delay 3 --retry-max-time 360 \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$tool_dir/pgdg.asc"
fingerprint=$(gpg --show-keys --with-colons "$tool_dir/pgdg.asc" | awk -F: '$1=="fpr" {print $10; exit}')
test "$fingerprint" = B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
sudo install -m 0644 "$tool_dir/pgdg.asc" /usr/share/keyrings/arandu-pgdg.asc
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/arandu-pgdg.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' | sudo tee /etc/apt/sources.list.d/arandu-pgdg.list >/dev/null
# Prevent an unsolicited cluster/service: tests create two private clusters.
sudo mkdir -p /etc/postgresql-common
printf '%s\n' 'create_main_cluster = false' | sudo tee /etc/postgresql-common/createcluster.conf >/dev/null
sudo "$(command -v node)" "$(dirname "$0")/ci/apt-install.mjs" --update-only
sudo apt-get install -y --allow-downgrades postgresql-client-17=17.11-1.pgdg24.04+2 postgresql-17=17.11-1.pgdg24.04+2
bash "$(dirname "$0")/ci/install-age.sh" "$tool_dir"
printf '%s\n' /usr/lib/postgresql/17/bin "$tool_dir/age" >> "$GITHUB_PATH"
test "$(/usr/lib/postgresql/17/bin/pg_dump --version)" = 'pg_dump (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2)'
test "$("$tool_dir/age/age" --version)" = v1.3.2
