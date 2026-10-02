# Alert routing acceptance — 2026-10-03

## Release decision

- Configuration commit: `f479b9b4c1fb91d4071545d560785218f5761d20`.
- Monitoring Helm release: revision **17 → 18**, status `deployed`.
- Chart remains `kube-prometheus-stack-86.3.1` (operator `v0.91.0`).
- Added `RS1000PublicEgressDown`, `RS1000DNSResolutionDown` and
  `RS1000WireGuardPathDegraded` to the existing Telegram allowlist. Previously
  these alerts fell through to `blackhole` even when firing independently.
- Preserved the other 18 Telegram alert names, grouping/timing, receiver
  credentials, templates, secret mounts and root-cause inhibition. Operator's
  NodeBeacon incident route continues to fan out independently.
- Application remains v1.1.15, SHA
  `2d673e77eab020bc899d81b98438024350e05ba5`, image
  `nodebeacon:git-2d673e77eab0`, Deployment revision 103, 1/1 Ready.
  This monitoring-only Helm rollout did not rebuild or redeploy NodeBeacon.

## Source drift resolved

The host `/root/monitoring-stack/values-monitoring.yaml` disagreed with active
revision 17 in its Alertmanager section: route, receiver definitions, templates,
inhibition and mounted secrets. Other sections agreed. Reusing that old file
would have reverted existing notification behavior.

Both the original host file and active values were backed up privately. The
candidate was derived from **active revision 17**, changing only the route's
alert-name matcher. After successful upgrade, the host file was atomically
replaced with accepted revision 18 values (mode 0600), then compared with Helm.
Only the credential-free routing overlay is committed to Git.

## Validation completed

- Failure-first regression: 23/26 cases passed before modification. Exactly the
  three missing paths failed using the installed `amtool` against running config.
- Candidate matched the previous active values except for three added names.
  Helm server-side dry-run on the pinned chart changed exactly one resource:
  `monitoring/alertmanager-monitoring-kube-prometheus-alertmanager` Secret.
  Parsed Alertmanager config matched the previous config outside `route`.
- `amtool check-config` passed against the rendered candidate. Python syntax,
  JSON matrix and `git diff --check` passed.
- Applied from a clean Git checkout, using `helm upgrade --atomic --timeout 5m`.
- Post-rollout **26/26 routing tests passed**: all 21 allowlisted alerts reach
  Telegram, Watchdog/unlisted cases remain blackholed, and NodeBeacon namespace
  fan-out and incident-only routing behave as expected.
- Monitoring acceptance: 34 groups, 235 healthy rules, one upstream CrashLoop
  rule; Workload CPU, Pod memory and PVC metrics all available.
- All monitoring Pods were Ready. `verify-production.sh` passed from the
  existing application release, including provenance, readiness, health,
  authentication boundaries, five-node status, cache policy and backup freshness.
- Actual Telegram delivery to a device was not tested. The checks evaluate real
  routing without injecting incidents or sending test messages. Watchdog was the
  only active alert observed at final inspection.
- App lint/build/E2E were not rerun because application sources, dependencies,
  image and UI were unchanged. The infrastructure checks above cover this rollout.

## Evidence and rollback

- Clean configuration checkout:
  `/root/deploy/nodebeacon-routing-20261003-f479b9b4c1fb`.
- Root-only evidence directory:
  `/root/monitoring-stack/evidence/20261003-alert-routing/`.
  Includes before/after matrix results, sanitized effective routing, monitoring
  health, changed-resource summary and protected Helm backup/render/upgrade data.
  Full Helm values and Secret manifests contain credentials: never publish them.
- Application verification:
  `/root/deploy/nodebeacon-v1.1.15-2d673e77eab0/artifacts/production-verification/20261002T165612Z-1.1.15-2d673e77eab0.txt`.
- `/root/deploy/nodebeacon-current` remains the accepted v1.1.15 checkout used by
  nightly backups. The user's local `AGENTS.md` edit was preserved and excluded.

If notification behavior regresses, restore prior active revision 17 on RS1000:

```sh
helm --kubeconfig /etc/rancher/k3s/k3s.yaml rollback monitoring 17 \
  --namespace monitoring --wait --timeout 5m
install -m 0600 \
  /root/monitoring-stack/evidence/20261003-alert-routing/before-values.yaml \
  /root/monitoring-stack/values-monitoring.yaml
```

Confirm the rollback succeeded before replacing the host file. Recheck Pod
readiness, effective routing, inhibition and application acceptance. The matrix
will intentionally return to 23/26 because the three missing routes are restored.
Do not restore `original-host-values.yaml`: it was stale before this change.
Revert/update the Git overlay and expectations before the next routing rollout.
