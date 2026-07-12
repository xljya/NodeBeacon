#!/usr/bin/env bash
# Read-only production acceptance check. It does not log in, mutate Kubernetes,
# purge caches, trigger rate limits, or create backups.
set -euo pipefail

cd "$(dirname "$0")/.."

NAMESPACE="${NODEBEACON_NAMESPACE:-nodebeacon}"
BASE_URL="${NODEBEACON_BASE_URL:-http://10.77.0.1:31003}"
PUBLIC_URL="${NODEBEACON_PUBLIC_URL:-https://monitor.liucf.com}"
EXPECTED_NODES="${NODEBEACON_EXPECTED_NODES:-5}"
MAX_BACKUP_AGE_SECONDS="${NODEBEACON_MAX_BACKUP_AGE_SECONDS:-129600}"
RECORD_DIR="${NODEBEACON_VERIFICATION_DIR:-artifacts/production-verification}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CHECKED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: required command not found: $1" >&2; exit 1; }
}
for command in kubectl curl node; do require "${command}"; done

fail() { echo "ERROR: $*" >&2; exit 1; }
header() {
  tr -d '\r' < "$1" | awk -v key="$2" 'BEGIN { IGNORECASE=1 } index(tolower($0), tolower(key) ":") == 1 { sub(/^[^:]+:[[:space:]]*/, ""); value=$0 } END { print value }'
}

version="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.metadata.annotations.app\.nodebeacon\.io/version}')"
git_sha="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.metadata.annotations.app\.nodebeacon\.io/git-sha}')"
deployed_at="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.metadata.annotations.app\.nodebeacon\.io/deployed-at}')"
image="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.spec.template.spec.containers[0].image}')"
short_sha="${git_sha:0:12}"
[ -n "${version}" ] && [ -n "${git_sha}" ] && [ -n "${deployed_at}" ] || fail "release annotations are incomplete"
[ "${image}" = "nodebeacon:git-${short_sha}" ] || fail "image ${image} does not match annotated SHA ${git_sha}"

available="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.status.availableReplicas}')"
desired="$(kubectl -n "${NAMESPACE}" get deploy nodebeacon -o jsonpath='{.spec.replicas}')"
[ "${available:-0}" = "${desired}" ] || fail "Deployment availability is ${available:-0}/${desired}"

health_json="$(curl -fsS "${BASE_URL}/healthz")"
ready_json="$(curl -fsS "${BASE_URL}/readyz")"
status_json="$(curl -fsS "${BASE_URL}/api/status")"
auth_json="$(curl -fsS "${BASE_URL}/api/auth/config")"
node -e 'const v=JSON.parse(process.argv[1]); if(v.status!=="ok") process.exit(1)' "${health_json}" || fail "healthz failed"
node -e 'const v=JSON.parse(process.argv[1]); if(v.status!=="ready"||v.components?.database?.status!=="ok"||v.components?.registry?.status!=="ok") process.exit(1)' "${ready_json}" || fail "readyz failed"
node -e 'const v=JSON.parse(process.argv[1]); const expected=Number(process.argv[2]); if(v.total!==expected||v.online!==expected) process.exit(1)' "${status_json}" "${EXPECTED_NODES}" || fail "expected ${EXPECTED_NODES} total and online nodes"
node -e 'const v=JSON.parse(process.argv[1]); if(typeof v.passwordLoginEnabled!=="boolean") process.exit(1)' "${auth_json}" || fail "auth config failed"
admin_code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/summary")"
[ "${admin_code}" = "401" ] || fail "admin guard returned ${admin_code}, expected 401"

temporary="$(mktemp -d)"
cleanup() { rm -rf "${temporary}"; }
trap cleanup EXIT
curl -fsS -D "${temporary}/home.headers" -o "${temporary}/home.html" "${PUBLIC_URL}/"
curl -fsS -D "${temporary}/api.headers" -o /dev/null "${PUBLIC_URL}/api/status"
home_cache_control="$(header "${temporary}/home.headers" Cache-Control)"
home_cf_cache="$(header "${temporary}/home.headers" CF-Cache-Status)"
api_cache_control="$(header "${temporary}/api.headers" Cache-Control)"
api_cf_cache="$(header "${temporary}/api.headers" CF-Cache-Status)"
[[ "${home_cache_control}" == *no-cache* ]] || fail "homepage Cache-Control is ${home_cache_control}"
[ "${home_cf_cache}" = "DYNAMIC" ] || fail "homepage CF-Cache-Status is ${home_cf_cache}"
[[ "${api_cache_control}" == *no-store* ]] || fail "API Cache-Control is ${api_cache_control}"
[ "${api_cf_cache}" = "DYNAMIC" ] || fail "API CF-Cache-Status is ${api_cf_cache}"

asset="$(sed -n 's/.*src="\([^"]*\/assets\/[^"]*\.js\)".*/\1/p' "${temporary}/home.html" | head -1)"
[ -n "${asset}" ] || fail "could not discover a hashed JavaScript asset"
case "${asset}" in http*) asset_url="${asset}" ;; *) asset_url="${PUBLIC_URL}${asset}" ;; esac
curl -fsS -D "${temporary}/asset-first.headers" -o /dev/null "${asset_url}"
curl -fsS -D "${temporary}/asset-second.headers" -o /dev/null "${asset_url}"
asset_cache_control="$(header "${temporary}/asset-second.headers" Cache-Control)"
asset_cf_cache="$(header "${temporary}/asset-second.headers" CF-Cache-Status)"
[[ "${asset_cache_control}" == *public* && "${asset_cache_control}" == *immutable* ]] || fail "asset Cache-Control is ${asset_cache_control}"
case "${asset_cf_cache}" in HIT|MISS|EXPIRED|REVALIDATED) ;; *) fail "asset CF-Cache-Status is ${asset_cf_cache}" ;; esac

metrics="$(curl -fsS "${BASE_URL}/metrics")"
backup_timestamp="$(awk '$1 == "nodebeacon_backup_last_success_timestamp_seconds" { print int($2); exit }' <<< "${metrics}")"
[[ "${backup_timestamp}" =~ ^[0-9]+$ ]] && [ "${backup_timestamp}" -gt 0 ] || fail "backup success timestamp is missing or invalid"
backup_age="$(( $(date -u +%s) - backup_timestamp ))"
[ "${backup_age}" -ge 0 ] && [ "${backup_age}" -le "${MAX_BACKUP_AGE_SECONDS}" ] || fail "backup age ${backup_age}s exceeds ${MAX_BACKUP_AGE_SECONDS}s"

rules="$(kubectl -n "${NAMESPACE}" get prometheusrule nodebeacon -o jsonpath='{range .spec.groups[*].rules[*]}{.alert}{"\n"}{end}')"
for alert in NodeBeaconUnavailable NodeBeaconBackupStale NodeBeaconBackupMissing; do
  grep -Fxq "${alert}" <<< "${rules}" || fail "PrometheusRule is missing ${alert}"
done

mkdir -p "${RECORD_DIR}"
record="${RECORD_DIR}/${STAMP}-${version}-${short_sha}.txt"
cat > "${record}.tmp" <<EOF
checked_at=${CHECKED_AT}
version=${version}
git_sha=${git_sha}
deployed_image=${image}
deployed_at=${deployed_at}
deployment_available=${available}/${desired}
healthz=pass
readyz=pass
nodes_total=${EXPECTED_NODES}
nodes_online=${EXPECTED_NODES}
auth_config=pass
admin_guard=pass
homepage_cache_control=${home_cache_control}
homepage_cf_cache_status=${home_cf_cache}
api_cache_control=${api_cache_control}
api_cf_cache_status=${api_cf_cache}
asset=${asset}
asset_cache_control=${asset_cache_control}
asset_cf_cache_status=${asset_cf_cache}
backup_last_success_timestamp_seconds=${backup_timestamp}
backup_age_seconds=${backup_age}
prometheus_rules=pass
EOF
mv "${record}.tmp" "${record}"

echo "Production verification passed for ${version} (${git_sha})."
echo "Acceptance record: ${record}"
