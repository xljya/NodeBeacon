#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

version="$(node -p "require('./package.json').version")"
git_sha="$(git rev-parse HEAD)"
short_git_sha="$(git rev-parse --short=12 HEAD)"
output="$(./scripts/deploy.sh --plan)"

grep -Fq "version:        ${version}" <<<"${output}"
grep -Fq "git SHA:        ${git_sha}" <<<"${output}"
grep -Fq "version image:  nodebeacon:${version}" <<<"${output}"
grep -Fq "deployed image: nodebeacon:git-${short_git_sha}" <<<"${output}"
grep -Fq "evidence dir:   artifacts/deployments" <<<"${output}"

if ./scripts/deploy.sh --unknown >/dev/null 2>&1; then
  echo "ERROR: deploy.sh accepted an unknown argument." >&2
  exit 1
fi

echo "deploy plan checks passed for ${version} (${short_git_sha})"
