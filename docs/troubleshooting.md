# NodeBeacon troubleshooting

This runbook is for the RS1000 k3s deployment. Start with read-only checks and
save command output with the UTC incident time. Never paste Secrets, cookies,
OAuth credentials, backup SSH keys, or database contents into tickets.

## First response

```sh
date -u
kubectl -n nodebeacon get deploy,pod,svc,pvc
kubectl -n nodebeacon describe pod -l app.kubernetes.io/name=nodebeacon
kubectl -n nodebeacon logs deploy/nodebeacon --tail=200
curl -i http://10.77.0.1:31003/healthz
curl -i http://10.77.0.1:31003/readyz
```

`/healthz` only proves that Fastify is alive. `/readyz` returns 503 when
SQLite/schema or both runtime and seed node registries cannot be read.
Prometheus and Alertmanager are deliberately excluded: their API paths degrade
to stale/unknown states instead of restarting the application.

## Pod startup or readiness

Check Events, logs, image availability, Secret references, PVC mount ownership,
and release annotations. Production uses `imagePullPolicy: Never`; the immutable
`nodebeacon:git-<12-char-sha>` image must exist in k3s containerd. Do not replace
it with `latest`. If health is 200 but readiness is 503, use the component status
to distinguish SQLite/schema from registry failure. Avoid editing the PVC until
a backup exists.

## Prometheus or Alertmanager unavailable

Confirm their in-cluster Services and Endpoints, then query them from the Pod.
Prometheus failure should mark status data stale/unknown. Alertmanager failure
should affect live alerts only while SQLite incident history remains visible.
Neither outage should fail readiness. Inspect the corresponding
`nodebeacon_prometheus_*` or `nodebeacon_alertmanager_*` metrics and alerts.

## SQLite or YAML damage

Stop writers before replacing SQLite. Restore the newest archive into isolation,
run the bundled online-backup verifier (`integrity_check`), then inspect schema,
sessions, incidents, and audit events. Follow `infra/README.md` exactly.

For `/data/nodes.yaml`, NodeBeacon falls back to the read-only ConfigMap seed.
If both are invalid, readiness returns 503. Recover runtime YAML from the latest
off-site archive or a known-good export, validate it, and install it atomically.

## Cloudflare 1015 during login

1015 is expected after a login burst. Stop testing, wait for the mitigation
window, and verify the Security Event. Do not disable bot protection, change
DNS/SSL/Tunnel, create User-Agent skips, or keep testing the real owner account.

## Backup failure or stale alert

Read the host cron log and run `scripts/backup.sh` with the same out-of-band
environment. Verify the remote archive exists. The PVC timestamp advances only
after `scp` succeeds:

```sh
curl -fsS http://10.77.0.1:31003/metrics | grep nodebeacon_backup_last_success_timestamp_seconds
```

Warning starts after 36 hours and critical after 72 hours (or a missing/invalid
timestamp). Never touch the timestamp manually to silence an alert.

## Rollback

Prefer redeploying a known Git tag through `scripts/deploy.sh --plan` and the
normal deploy script so version, SHA, image, annotations, and evidence align.
For an immediate rollback use `kubectl -n nodebeacon rollout undo
deploy/nodebeacon`, then verify provenance, health, readiness, five nodes, auth
guard, metrics, and cache headers. Record the reason and resulting SHA.

## Recovery drill and acceptance

Restore the newest real off-site archive into isolation. Acceptance requires
SQLite `integrity_check=ok`, schema version 2, five registry nodes, and incident
and audit spot checks. Never overwrite the live PVC during a drill. After any
deployment or recovery, run `scripts/verify-production.sh` and archive its record
with the deployment record and Security Events evidence.

## Provider traffic differs from host counters

`networkRxBytesTotal` / `networkTxBytesTotal` are interface counters since boot,
not the provider's current allowance period. A forwarding server commonly has
similar upload and download totals. Check the physical interface, ordinary
scrape job, accounting mode, unit and reset period before concluding that the
metrics are duplicated. Never infer a traffic reset date from invoice renewal.

From v1.1.14, the Owner node editor can publish a separate calibrated cycle
summary. Read the provider's upload/download values and observation time, set
the allowance, GB/GiB unit, sum/max/tx/rx mode and explicit period, and save.
Only mark the reset time verified when the provider supplies an exact instant.
A countdown-derived date remains an expected reset. The homepage and detail
page label the result as an estimate; raw since-boot counters remain available.

The estimate adds ordinary Prometheus interface increments after the snapshot.
If it is unavailable, check boundary sample freshness, scrape failures and
retention; do not replace null values with zero. After provider/manual resets
or `needs_calibration`, enter a fresh period and provider reading. Disabling
calibration returns the card to its explicitly labelled since-boot view.
Provider billing remains authoritative: refresh lag, rounded readings,
sampling/extrapolation and provider accounting can still produce differences.
See [the public/API contract](api/status.md#calibrated-cycle-traffic-v1114).
