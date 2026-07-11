#!/usr/bin/env bash
# Nightly NodeBeacon off-site backup. Run from RS1000 cron with
# NODEBEACON_BACKUP_REMOTE=user@other-vps:/absolute/backup/path/
set -euo pipefail

NAMESPACE="${NODEBEACON_NAMESPACE:-nodebeacon}"
BACKUP_REMOTE="${NODEBEACON_BACKUP_REMOTE:?set NODEBEACON_BACKUP_REMOTE to user@host:/path/}"
BACKUP_DIR="${NODEBEACON_BACKUP_DIR:-/var/backups/nodebeacon}"
KEEP_LOCAL_DAYS="${NODEBEACON_BACKUP_KEEP_LOCAL_DAYS:-7}"
BACKUP_IDENTITY="${NODEBEACON_BACKUP_IDENTITY:-}"
KUBECTL_BIN="${NODEBEACON_KUBECTL_BIN:-$(command -v kubectl || true)}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="${BACKUP_DIR}/${STAMP}"
REMOTE_DB="/data/nodebeacon-backup-${STAMP}.db"

if [[ -z "${KUBECTL_BIN}" || ! -x "${KUBECTL_BIN}" ]]; then
  echo "kubectl not found; set NODEBEACON_KUBECTL_BIN to its absolute path" >&2
  exit 1
fi

mkdir -p "${WORK_DIR}"

POD="$(${KUBECTL_BIN} -n "${NAMESPACE}" get pods \
  -l app.kubernetes.io/name=nodebeacon \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')"

cleanup() {
  "${KUBECTL_BIN}" -n "${NAMESPACE}" exec "${POD}" -- \
    rm -f "${REMOTE_DB}" "${REMOTE_DB}-wal" "${REMOTE_DB}-shm" >/dev/null 2>&1 || true
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

"${KUBECTL_BIN}" -n "${NAMESPACE}" exec "${POD}" -- \
  node apps/api/dist/cli/backupDatabase.js /data/nodebeacon.db "${REMOTE_DB}"
"${KUBECTL_BIN}" -n "${NAMESPACE}" cp "${POD}:${REMOTE_DB}" "${WORK_DIR}/nodebeacon.db"

if "${KUBECTL_BIN}" -n "${NAMESPACE}" exec "${POD}" -- test -f /data/nodes.yaml; then
  "${KUBECTL_BIN}" -n "${NAMESPACE}" cp "${POD}:/data/nodes.yaml" "${WORK_DIR}/nodes.yaml"
fi

ARCHIVE="${BACKUP_DIR}/nodebeacon-${STAMP}.tar.gz"
tar -C "${WORK_DIR}" -czf "${ARCHIVE}" .
SCP_OPTIONS=(-p -o BatchMode=yes)
if [[ -n "${BACKUP_IDENTITY}" ]]; then
  SCP_OPTIONS+=(-i "${BACKUP_IDENTITY}")
fi
scp "${SCP_OPTIONS[@]}" "${ARCHIVE}" "${BACKUP_REMOTE}"

find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'nodebeacon-*.tar.gz' \
  -mtime "+${KEEP_LOCAL_DAYS}" -delete

trap - EXIT
cleanup
echo "NodeBeacon backup copied to ${BACKUP_REMOTE}: $(basename "${ARCHIVE}")"
