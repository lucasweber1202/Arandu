#!/usr/bin/env bash
# Pinned age v1.3.2 from the official GitHub release, verified by SHA-256.
# No apt and no Ubuntu mirror: the demo rehearsal only needs age/age-keygen,
# and the Ubuntu archive was the external dependency that failed in run
# 44524490289. Adds the binaries to GITHUB_PATH when running in Actions.
set -euo pipefail
test "$(uname -m)" = x86_64
dest="${1:-${RUNNER_TEMP:?RUNNER_TEMP ausente}/arandu-age}"
mkdir -p "$dest"
if ! curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 20 --max-time 120 --retry 5 --retry-all-errors --retry-delay 3 --retry-max-time 360 \
  https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz -o "$dest/age.tar.gz"; then
  echo '::error title=CI_EXTERNAL_DEPENDENCY::age release download failed (github.com release asset)'
  echo 'CI_FAILURE_CLASS=external_dependency'
  exit 20
fi
if ! printf '%s\n' "cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10  $dest/age.tar.gz" | sha256sum --check --status; then
  echo '::error title=CI_SECURITY::age archive SHA-256 mismatch; refusing to install'
  echo 'CI_FAILURE_CLASS=security'
  exit 21
fi
tar -xzf "$dest/age.tar.gz" -C "$dest" age/age age/age-keygen
test "$("$dest/age/age" --version)" = v1.3.2
if [ -n "${GITHUB_PATH:-}" ]; then printf '%s\n' "$dest/age" >> "$GITHUB_PATH"; fi
echo "age v1.3.2 verificado em $dest/age"
