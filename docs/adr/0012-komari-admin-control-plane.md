# ADR 0012: Komari-style admin control plane

## Status

Accepted for the v1.0.28 foundation and incremental follow-up releases.

## Decision

The admin console keeps the public status page anonymous and uses a single
SQLite-backed Owner. Site/general settings, safe JSON theme tokens, encrypted
TOTP factors, recovery-code hashes, notification intent, latency task intent,
remote-run intent, audit events and sessions live in the existing PVC database.
Secrets are encrypted with `SETTINGS_ENCRYPTION_KEY` (the development cookie
secret is only a local fallback) and API responses return masks only.

Remote execution is allow-list-only. The executor is a separate non-root
Deployment with zero initial replicas; interactive XtermJS is disabled until
the canary `netcup-1o` has passed task, TOTP, output-limit and audit checks.
The web pod writes a backup request marker only. The host cron owns backup and
recovery operations.

## Constraints

- Loki selectors, notification webhook hosts and remote task IDs are fixed
  server-side; browsers never submit LogQL, PromQL, Shell or Kubernetes object
  names.
- Public default themes use the versioned `AppearanceTokensV1` JSON whitelist:
  mode, Radix accent/gray scales, radius, scaling and panel background. Owner
  browser overrides remain local. Raw CSS, HTML, JavaScript, remote assets and
  theme archives are never accepted or executed.
- Schema migrations are monotonic. A rollback across schema v5 requires the
  pre-migration SQLite backup as well as the previous image.

## Rollout

v1.0.28 provides the control-plane foundation. Notifications, central probes,
allow-listed remote runs and then the TOTP terminal are separately enabled and
validated in v1.0.29 through v1.0.32.
