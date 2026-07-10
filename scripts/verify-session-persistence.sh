#!/usr/bin/env bash
# Production session acceptance check. Runs on the k3s host and uses the
# already-injected owner credentials inside the Pod without printing them.
set -euo pipefail

NAMESPACE="${NODEBEACON_NAMESPACE:-nodebeacon}"
BASE_URL="${NODEBEACON_BASE_URL:-http://10.77.0.1:31003}"

pod="$(kubectl -n "${NAMESPACE}" get pods \
  -l app.kubernetes.io/name=nodebeacon \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')"

cookie="$(kubectl -n "${NAMESPACE}" exec "${pod}" -- node --input-type=module -e '
  const response = await fetch("http://127.0.0.1:3001/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.INITIAL_OWNER_EMAIL,
      password: process.env.INITIAL_OWNER_PASSWORD
    })
  });
  if (!response.ok) {
    console.error(`owner login failed: ${response.status}`);
    process.exit(1);
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    console.error("owner login did not issue a cookie");
    process.exit(1);
  }
  console.log(setCookie.split(";", 1)[0]);
')"

assert_code() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "ERROR: ${label} returned ${actual}, expected ${expected}." >&2
    exit 1
  fi
}

me_before="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: ${cookie}" "${BASE_URL}/api/auth/me")"
assert_code 200 "${me_before}" "session before restart"

origin_code="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Cookie: ${cookie}" \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  --data '{}' "${BASE_URL}/api/admin/nodes/rs1000")"
assert_code 403 "${origin_code}" "foreign-Origin mutation"

kubectl -n "${NAMESPACE}" rollout restart deploy/nodebeacon >/dev/null
kubectl -n "${NAMESPACE}" rollout status deploy/nodebeacon --timeout=180s >/dev/null

me_after="$(curl -sS --retry 30 --retry-connrefused --retry-delay 1 --max-time 5 \
  -o /dev/null -w '%{http_code}' \
  -H "Cookie: ${cookie}" "${BASE_URL}/api/auth/me")"
assert_code 200 "${me_after}" "session after restart"

logout="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${cookie}" "${BASE_URL}/api/auth/logout")"
assert_code 200 "${logout}" "logout"

replay="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: ${cookie}" "${BASE_URL}/api/auth/me")"
assert_code 401 "${replay}" "revoked cookie replay"

echo "Session acceptance passed: login=200 origin=403 restart=200 logout=200 replay=401"
