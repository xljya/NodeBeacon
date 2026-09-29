#!/bin/bash
# Run as root on the Debian RIPE Atlas probe host.
set -euo pipefail
export LC_ALL=C DEBIAN_FRONTEND=noninteractive
umask 077
exec 9>/run/lock/ripe-atlas-auto-upgrade.lock
flock -n 9 || exit 0
packages=(ripe-atlas-common ripe-atlas-probe ripe-atlas-repo)
test -f /etc/apt/sources.list.d/ripe-atlas.sources
install -d -m 700 /root/backups/ripe-atlas
apt_options=(-o DPkg::Lock::Timeout=300 -o Acquire::Retries=3 -o Acquire::https::Timeout=60)
apt-get "${apt_options[@]}" -o APT::Update::Error-Mode=any \
  -o Dir::Etc::sourcelist=sources.list.d/ripe-atlas.sources \
  -o Dir::Etc::sourceparts=/dev/null -o APT::Get::List-Cleanup=0 update
plan=$(apt-get "${apt_options[@]}" -s --no-remove --only-upgrade install "${packages[@]}")
printf '%s\n' "$plan"
# Refuse dependency changes outside the explicitly maintained packages.
while read -r action package rest; do
  case "$action" in
    Remv) echo 'Refusing package removal' >&2; exit 1 ;;
    Inst|Conf)
      case "$package" in
        ripe-atlas-common|ripe-atlas-probe|ripe-atlas-repo) ;;
        *) echo "Refusing unrelated package change: $package" >&2; exit 1 ;;
      esac ;;
  esac
done <<< "$plan"
if [[ "${1:-}" == '--dry-run' ]]; then exit 0; fi
if ! grep -q '^Inst ' <<< "$plan"; then
  echo 'RIPE Atlas packages are already current'
  systemctl is-active --quiet ripe-atlas.service
  exit 0
fi
backup=$(mktemp -d /root/backups/ripe-atlas/auto-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX)
tar -czf "$backup/etc-ripe-atlas.tar.gz" -C / etc/ripe-atlas
sha256sum /etc/ripe-atlas/probe_key* > "$backup/key-checksums"
dpkg-query -W "${packages[@]}" > "$backup/packages-before.txt"
printf '%s\n' "$plan" > "$backup/plan.txt"
apt-get "${apt_options[@]}" -y --no-remove --only-upgrade \
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
  install "${packages[@]}"
sha256sum --status -c "$backup/key-checksums"
systemctl is-active --quiet ripe-atlas.service
dpkg-query -W "${packages[@]}"
