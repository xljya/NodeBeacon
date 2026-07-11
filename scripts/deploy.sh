#!/usr/bin/env bash
# NodeBeacon release script — run ON RS1000 from the repo root of a synced tree.
#
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --plan
#
# The release version is single-sourced from the root package.json. The script
# refuses to run if the live Deployment or restore Pod template does not
# reference the same version tag. The built image also receives an immutable
# `git-<sha>` tag, and a temporary Kustomize overlay deploys that immutable tag
# without editing the committed manifests.
#
# Rollback: `kubectl -n nodebeacon rollout undo deploy/nodebeacon` (previous
# images stay in containerd), or check out the previous tag and re-run this.
set -euo pipefail

cd "$(dirname "$0")/.."

PLAN_ONLY=false
case "${1:-}" in
  "") ;;
  --plan) PLAN_ONLY=true ;;
  *)
    echo "Usage: $0 [--plan]" >&2
    exit 2
    ;;
esac

VERSION="$(node -p "require('./package.json').version")"
VERSION_TAG="nodebeacon:${VERSION}"
GIT_SHA="$(git rev-parse HEAD)"
SHORT_GIT_SHA="$(git rev-parse --short=12 HEAD)"
GIT_TAG="nodebeacon:git-${SHORT_GIT_SHA}"
BASE_URL="${NODEBEACON_BASE_URL:-http://10.77.0.1:31003}"
RELEASE_DIR="${NODEBEACON_RELEASE_DIR:-artifacts/deployments}"

if [ "${PLAN_ONLY}" != "true" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: tracked files are modified. Commit the release tree before deploying." >&2
  exit 1
fi

for manifest in infra/k8s/deployment.yaml infra/k8s/restore-pod.example.yaml; do
  if ! grep -Eq "image:[[:space:]]+${VERSION_TAG}\$" "${manifest}"; then
    echo "ERROR: ${manifest} does not reference ${VERSION_TAG}." >&2
    echo "Bump both release image tags and commit first." >&2
    exit 1
  fi
done

echo "Release plan"
echo "  version:        ${VERSION}"
echo "  git SHA:        ${GIT_SHA}"
echo "  version image:  ${VERSION_TAG}"
echo "  deployed image: ${GIT_TAG}"
echo "  evidence dir:   ${RELEASE_DIR}"

if [ "${PLAN_ONLY}" = "true" ]; then
  exit 0
fi

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RECORD_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
render_dir="$(mktemp -d)"
rendered_manifest="$(mktemp)"
cleanup() {
  rm -rf "${render_dir}" "${rendered_manifest}"
}
trap cleanup EXIT

echo "==> Building ${VERSION_TAG} and ${GIT_TAG}"
docker build -t "${VERSION_TAG}" -t "${GIT_TAG}" .

echo "==> Importing into k3s containerd"
docker save "${VERSION_TAG}" "${GIT_TAG}" | sudo k3s ctr images import -

echo "==> Rendering immutable deployment manifest"
cp -R infra/k8s/. "${render_dir}/"
cat >> "${render_dir}/kustomization.yaml" <<EOF
images:
  - name: nodebeacon
    newName: nodebeacon
    newTag: git-${SHORT_GIT_SHA}
patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: nodebeacon
    patch: |-
      - op: add
        path: /metadata/annotations
        value:
          app.nodebeacon.io/version: "${VERSION}"
          app.nodebeacon.io/git-sha: "${GIT_SHA}"
          app.nodebeacon.io/deployed-at: "${DEPLOYED_AT}"
      - op: add
        path: /spec/template/metadata/annotations
        value:
          app.nodebeacon.io/version: "${VERSION}"
          app.nodebeacon.io/git-sha: "${GIT_SHA}"
          app.nodebeacon.io/deployed-at: "${DEPLOYED_AT}"
EOF

kubectl kustomize "${render_dir}" > "${rendered_manifest}"
if ! grep -Fq "image: ${GIT_TAG}" "${rendered_manifest}"; then
  echo "ERROR: rendered manifest does not reference ${GIT_TAG}." >&2
  exit 1
fi

echo "==> Applying manifests"
kubectl apply -f "${rendered_manifest}"

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
if [ "${deployed_image}" != "${GIT_TAG}" ]; then
  echo "ERROR: deployment is running ${deployed_image}, expected ${GIT_TAG}." >&2
  exit 1
fi

image_id="$(kubectl -n nodebeacon get pods -l app.kubernetes.io/name=nodebeacon -o jsonpath='{.items[0].status.containerStatuses[0].imageID}')"
mkdir -p "${RELEASE_DIR}"
record_path="${RELEASE_DIR}/${RECORD_STAMP}-${VERSION}-${SHORT_GIT_SHA}.txt"
record_tmp="${record_path}.tmp"
cat > "${record_tmp}" <<EOF
version=${VERSION}
git_sha=${GIT_SHA}
version_image=${VERSION_TAG}
deployed_image=${GIT_TAG}
runtime_image_id=${image_id}
deployed_at=${DEPLOYED_AT}
base_url=${BASE_URL}
readyz=pass
healthz=pass
status_api=pass
auth_config=pass
admin_guard=pass
EOF
mv "${record_tmp}" "${record_path}"

echo "==> Deployed ${GIT_TAG} (${VERSION_TAG}) successfully."
echo "    Acceptance record: ${record_path}"
echo "    Full manual checklist: infra/README.md (Verify section)."
