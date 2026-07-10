#!/usr/bin/env bash
# NodeBeacon release script — run ON RS1000 from the repo root of a synced tree.
#
#   ./scripts/deploy.sh
#
# The release version is single-sourced from the root package.json. The script
# refuses to run if infra/k8s/deployment.yaml does not reference the same tag,
# so git stays the source of truth (no blind sed on manifests).
#
# Rollback: `kubectl -n nodebeacon rollout undo deploy/nodebeacon` (previous
# images stay in containerd), or check out the previous tag and re-run this.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
TAG="nodebeacon:${VERSION}"
BASE_URL="${NODEBEACON_BASE_URL:-http://10.77.0.1:31003}"

if ! grep -Eq "image:[[:space:]]+${TAG}\$" infra/k8s/deployment.yaml; then
  echo "ERROR: infra/k8s/deployment.yaml does not reference ${TAG}." >&2
  echo "Bump the image tag there (single per-release edit) and commit first." >&2
  exit 1
fi

echo "==> Building ${TAG}"
docker build -t "${TAG}" .

echo "==> Importing into k3s containerd"
docker save "${TAG}" | sudo k3s ctr images import -

echo "==> Applying manifests"
kubectl apply -k infra/k8s

echo "==> Waiting for rollout"
kubectl -n nodebeacon rollout status deploy/nodebeacon --timeout=180s

echo "==> Smoke checks against ${BASE_URL}"
curl -fsS "${BASE_URL}/readyz" > /dev/null
curl -fsS "${BASE_URL}/healthz" > /dev/null
curl -fsS "${BASE_URL}/api/status" | grep -q '"total"'
curl -fsS "${BASE_URL}/api/auth/config" | grep -q '"passwordLoginEnabled"'

admin_code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/summary")"
if [ "${admin_code}" != "401" ]; then
  echo "ERROR: unauthenticated /api/admin/summary returned ${admin_code}, expected 401." >&2
  exit 1
fi

deployed_image="$(kubectl -n nodebeacon get deploy nodebeacon -o jsonpath='{.spec.template.spec.containers[0].image}')"
if [ "${deployed_image}" != "${TAG}" ]; then
  echo "ERROR: deployment is running ${deployed_image}, expected ${TAG}." >&2
  exit 1
fi

echo "==> Deployed ${TAG} successfully."
echo "    Full manual checklist: infra/README.md (Verify section)."
