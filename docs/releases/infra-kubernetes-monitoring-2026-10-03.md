# Kubernetes monitoring acceptance — 2026-10-03

## Release decision

- Configuration commit: `68361dcf0703b8e1b95e4268a7b1cbe697cf7a08`.
- Scope: monitoring-only rollout of `monitoring/sre-lab-rules`; existing
  Workload, Pod and Persistent Volumes dashboards documented as troubleshooting
  entry points. No new dashboard or duplicate mixin installation was needed.
- Removed the custom 5-minute CrashLoop rule and retained the Helm-owned
  `kubernetes-apps/KubePodCrashLooping` rule with a 15-minute pending period.
  Notification will therefore start later than the previous custom warning.
- The two public-endpoint rules were preserved exactly. Their canonical source
  is now `infra/monitoring/sre-lab-rules.yaml`, included in the monitoring
  kustomization and mirrored to `/root/monitoring-stack/sre-lab-rules.yaml`.
- k3s-specific disabled component scrapes, Helm release, scrape cadence and
  retention remain unchanged. Scheduler metric series were found under both
  `apiserver` and `kubelet` jobs; disabled standalone scrapes do not imply every
  corresponding metric is missing.
- Application remains v1.1.15, image `nodebeacon:git-2d673e77eab0`, SHA
  `2d673e77eab020bc899d81b98438024350e05ba5`, Deployment revision `103`, 1/1 Ready.
  The application image and backup symlink were not advanced for this independent
  monitoring resource change.

## Validation completed

- Before implementation, `scripts/verify-kubernetes-monitoring.mjs` failed on
  production with `2 !== 1` for the loaded CrashLoop rule count.
- Confirmed the original host source and live PrometheusRule spec agreed.
  Compared the candidate against both: only `sre-lab.kubernetes` was removed;
  both public-endpoint rules remained byte-equivalent at the parsed spec level.
- Kustomize rendering, Kubernetes server-side dry-run, `promtool check rules`
  (two rules), Node syntax validation and `git diff --check` passed.
- Applied the single resource from a clean Git checkout at the configuration
  SHA. Host source and live resource were checked against that committed file.
- An immediate read still saw the old Prometheus rules during Operator reload;
  the subsequent run of the same regression check passed: **34 groups, 235
  healthy rules, exactly one CrashLoop rule with a 900-second pending period**.
- The same check found valid Workload CPU, Pod memory and application PVC
  available-space series. Grafana's API confirmed all three referenced dashboard
  UIDs exist and are provisioned. No dashboard UI was modified; this was API/data
  verification rather than a new browser layout acceptance.
- Inspected the effective Alertmanager route: the selected alert name reaches
  `telegram-primary` without a `team` matcher. NodeBeacon namespace alerts also
  match the continuing incident route. No synthetic incident or test notification
  was sent; delivery was checked at configuration level.
- `verify-production.sh` passed from the existing v1.1.15 release checkout,
  including application provenance/readiness, health, authentication boundary,
  five-node status, cache policy, backup freshness and required monitoring rules.
- Application lint/build/E2E gates were not rerun: application sources,
  dependencies and image did not change. Infra validation above covers the
  changed resource and its production effects.

## Evidence and rollback

- Configuration checkout:
  `/root/deploy/nodebeacon-monitoring-20261003-68361dcf0703`.
- Monitoring evidence:
  `/root/monitoring-stack/evidence/20261003-kubernetes-mixin/` contains source/live
  backups, the candidate, rendered manifests, dry-run/apply output, configuration
  SHA, before/after regression output, dashboard metadata, sanitized routing and
  application readiness results. Receiver credentials were not exported.
- Application verification:
  `/root/deploy/nodebeacon-v1.1.15-2d673e77eab0/artifacts/production-verification/20261002T162001Z-1.1.15-2d673e77eab0.txt`.
- `/root/deploy/nodebeacon-current` continues pointing to the accepted v1.1.15
  application checkout used by nightly backups.

To restore the previous monitoring behavior on RS1000:

```sh
backup=/root/monitoring-stack/evidence/20261003-kubernetes-mixin/sre-lab-source-before.yaml
kubectl apply --dry-run=server -f "$backup"
kubectl apply -f "$backup"
install -m 0644 "$backup" /root/monitoring-stack/sre-lab-rules.yaml
```

After rollback, confirm Prometheus has reloaded both CrashLoop rules and the
public-endpoint group remains healthy. The new deduplication check should fail
in that intentionally restored state. Revert the corresponding Git manifest
change before a later full monitoring apply to avoid reinstating it accidentally.
No application/PVC rollback or Helm rollback is needed.

The pre-existing local `AGENTS.md` edit was preserved and excluded from commits.
NodeBeacon-Web and NodeBeacon1 were not modified.
