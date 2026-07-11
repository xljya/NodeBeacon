#!/usr/bin/env bash
# Retain all daily NodeBeacon archives for 30 days, then one archive per UTC
# calendar month for 12 months. Dry-run by default; pass --apply to delete.
set -euo pipefail

BACKUP_DIR="${NODEBEACON_REMOTE_BACKUP_DIR:-/srv/backups/nodebeacon/archives}"
KEEP_DAILY_DAYS="${NODEBEACON_REMOTE_KEEP_DAILY_DAYS:-30}"
KEEP_MONTHLY_MONTHS="${NODEBEACON_REMOTE_KEEP_MONTHLY_MONTHS:-12}"
MODE="${1:---dry-run}"

if [[ "${MODE}" != "--dry-run" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi
if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Backup directory does not exist: ${BACKUP_DIR}" >&2
  exit 1
fi

now="$(date -u +%s)"
daily_cutoff="$((now - KEEP_DAILY_DAYS * 86400))"
monthly_cutoff="$(date -u -d "${KEEP_MONTHLY_MONTHS} months ago" +%s)"
declare -A monthly_keep=()
declare -a candidates=()

while IFS= read -r -d '' file; do
  mtime="$(stat -c %Y "${file}")"
  if (( mtime >= daily_cutoff )); then
    continue
  fi
  if (( mtime < monthly_cutoff )); then
    candidates+=("${file}")
    continue
  fi

  month="$(date -u -d "@${mtime}" +%Y-%m)"
  current="${monthly_keep[${month}]:-}"
  if [[ -z "${current}" ]]; then
    monthly_keep[${month}]="${file}"
  elif [[ "${file}" -nt "${current}" ]]; then
    candidates+=("${current}")
    monthly_keep[${month}]="${file}"
  else
    candidates+=("${file}")
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'nodebeacon-*.tar.gz' -print0)

for file in "${candidates[@]}"; do
  if [[ "${MODE}" == "--apply" ]]; then
    rm -f -- "${file}"
    echo "deleted ${file}"
  else
    echo "would delete ${file}"
  fi
done

echo "retention complete: daily=${KEEP_DAILY_DAYS}d monthly=${KEEP_MONTHLY_MONTHS}mo mode=${MODE}"
