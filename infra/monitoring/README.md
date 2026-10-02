# RS1000 monitoring

## Kubernetes troubleshooting entry points

The installed `kube-prometheus-stack` chart already provisions dashboards and
rules from [kubernetes-mixin](https://github.com/kubernetes-sigs/kubernetes-mixin).
Do not install a second copy of the mixin. The following links use the existing
Grafana authentication and select the `nodebeacon` namespace:

| View | Use it for |
| --- | --- |
| [Workload](https://grafana.liucf.com/d/a164a7f0339f99e89cea5cb47e9be617?var-namespace=nodebeacon&var-type=deployment&var-workload=nodebeacon&from=now-1h&to=now) | Deployment CPU, memory, requests/limits and network usage |
| [Pod](https://grafana.liucf.com/d/6581e46e4e5c7ba40a07646395ef7b23?var-namespace=nodebeacon&from=now-1h&to=now) | Select the current Pod to inspect its containers; do not bookmark a rollout-specific Pod name |
| [Persistent Volumes](https://grafana.liucf.com/d/919b92a8e8041bd567af9edab12c840c?var-namespace=nodebeacon&var-volume=nodebeacon-data&from=now-1h&to=now) | Application PVC capacity, free space and inodes |

Start with Workload for resource pressure, then Pod for a particular container.
Check Persistent Volumes for SQLite/registry write failures or capacity alerts.
For restarts and scheduling failures also inspect `kubectl -n nodebeacon get
pods` and `kubectl -n nodebeacon describe pod <current-pod>`; these dashboards
do not replace container logs or Kubernetes events. Change the namespace to
`monitoring` to investigate the monitoring stack itself.

### Rule ownership and notification behavior

`sre-lab-rules.yaml` is the source of truth for the two existing public-endpoint
alerts. It preserves their expressions, labels and annotations. The redundant
5-minute `sre-lab.kubernetes/KubePodCrashLooping` rule was removed; the
Helm-owned `kubernetes-apps/KubePodCrashLooping` rule remains authoritative with
a **15-minute pending period** (plus evaluation and notification grouping time).
This deliberately favors the upstream noise tolerance over the old 5-minute
warning. Do not edit Helm-generated rules directly or reapply an old host copy.

The effective Alertmanager route matches `KubePodCrashLooping` by alert name,
not `team=infra`, and sends it to `telegram-primary`. Alerts in the `nodebeacon`
namespace also match the continuing NodeBeacon incident route. Removing the
custom `team` label therefore does not remove either route. Recheck routing
after future Helm/Alertmanager changes without printing receiver credentials.

For a rule-only change, render and validate before applying only that resource;
no application deployment or Blackbox restart is needed:

```sh
kubectl kustomize infra/monitoring > /tmp/nodebeacon-monitoring.yaml
kubectl apply --dry-run=server -f infra/monitoring/sre-lab-rules.yaml
kubectl apply -f infra/monitoring/sre-lab-rules.yaml
kubectl -n nodebeacon exec -i deploy/nodebeacon -- node --input-type=module \
  < scripts/verify-kubernetes-monitoring.mjs
```

Wait for Prometheus Operator to reload the rules before the final check. The
read-only script rejects duplicate/unhealthy rules and checks public-endpoint
alerts plus live Workload/Pod/PVC data. It does not send test notifications.
Keep `/root/monitoring-stack/sre-lab-rules.yaml` synchronized with the committed
manifest; back up both that file and the live resource before rollout. Restore
both from the same backup if rollback is necessary.

### k3s compatibility baseline

Verified on 2026-10-03: single-node k3s `v1.35.5+k3s1`, chart
`kube-prometheus-stack-86.3.1`, Grafana `13.0.2`. The existing Helm values keep
`kubeEtcd`, `kubeScheduler`, `kubeControllerManager` and `kubeProxy` disabled.
Retain these settings until the actual endpoints, certificates and scrape
permissions have been checked. A disabled standalone component scrape does not
prove that every related metric is absent: this k3s instance exposes scheduler
metrics through the API server scrape. Check real metric labels and targets
before enabling a component or relying on a dashboard.

The canonical Helm values remain `/root/monitoring-stack/values-monitoring.yaml`
(contains sensitive configuration; never commit or print it). This integration
does not change Helm versions, scrape cadence, retention, or application images.
Following a chart upgrade, verify the dashboard UIDs/variables, recording rules,
query results and notification routes again.

## Notification routing regression checks

[`alertmanager-routing.values.yaml`](alertmanager-routing.values.yaml) contains
the credential-free routing overlay for the existing monitoring Helm release.
It preserves the explicit Telegram allowlist and includes all four RS1000 egress
alerts. `Watchdog` and unlisted alerts remain on `blackhole`; namespace-scoped
NodeBeacon incident routing is injected separately by Prometheus Operator.
The existing `RS1000MonitoringEgressDown` inhibition rule still suppresses
secondary path alerts when the shared root cause is firing.

Run the regression matrix after any routing or Helm change on RS1000:

```sh
python3 scripts/verify-alert-routing.py
```

The 26 cases use the installed `amtool` against **running** Alertmanager config.
They check all 21 Telegram alert names, negative cases and NodeBeacon incident
fan-out. They do not create alerts, send messages or export receiver credentials.
A nonzero exit means a receiver mismatch or a failed check; investigate before
accepting the rollout. Add an explicit expectation to
`alert-routing-cases.json` when intentionally changing notification coverage.
This checks routing, not actual delivery to the user's device.

For a routing rollout, securely export the active Helm values, compare them
with `/root/monitoring-stack/values-monitoring.yaml`, and merge only this overlay
into the active baseline. Lists are replaced by Helm, so review the complete
route list. Keep receiver definitions, mounted secrets, templates and inhibition
rules from the active release. Pin the currently installed chart version and use
`helm upgrade --dry-run=server` before applying. Save any Helm values, rendered
Secrets and full dry-run results only in a root-only evidence directory; never
print them or commit them. Inspect a sanitized resource diff and require only
the intended Alertmanager config resource to change.

After successful rollout, verify the effective route matrix, monitoring health
and application acceptance, then synchronize the host values with the accepted
Helm values. Back up both the original host file and active release values first.
On 2026-10-03 the original host file's Alertmanager section lagged behind active
revision 17; using it directly would have reverted existing Telegram settings.
Rollback must restore the prior **active** values, not that stale host file.

## RS1000 egress probes

These manifests separate an RS1000 monitoring-path failure from independent
target failures. They add three Blackbox probe jobs:

- `blackbox-tcp-egress`: TCP connectivity to two fixed public IPs;
- `blackbox-dns-egress`: `liucf.com` A-record resolution through two resolvers;
- `blackbox-tcp-wireguard`: TCP connectivity to every WireGuard peer's
  `node_exporter` listener.

`RS1000MonitoringEgressDown` fires before the existing per-target alerts when
multiple public/DNS probes and multiple WireGuard probes fail together. The
more specific alerts preserve a clear diagnosis when only one path fails.

Apply and reload Blackbox Exporter:

```sh
kubectl apply -k infra/monitoring
kubectl -n monitoring rollout restart deployment/blackbox-exporter
kubectl -n monitoring rollout status deployment/blackbox-exporter
```

Verify the probe series:

```promql
probe_success{job=~"blackbox-(tcp-egress|dns-egress|tcp-wireguard)"}
```

All eight series should be `1` during normal operation: two public TCP, two
DNS, and four WireGuard peer probes.

## Managed China ISP TCP modules

Owner-created nationwide China ISP TCP tasks use the existing Blackbox Exporter
plus two managed Probe resources in the `nodebeacon` namespace:

- `nodebeacon-managed-tcp` → module `tcp_connect_ipv4`
- `nodebeacon-managed-tcp6` → module `tcp_connect_ipv6`

IPv6 probes stay empty until the owner selects IPv6 in `/admin/ping`. Apply the
monitoring kustomization and restart Blackbox before enabling IPv6 targets:

```sh
kubectl apply -k infra/monitoring
kubectl -n monitoring rollout restart deployment/blackbox-exporter
```

## Node detail fast scrape

The public node detail page can use a separate 5-second scrape job without
changing the existing 30-second historical job. The example configuration is
[`node-detail-fast.example.yaml`](node-detail-fast.example.yaml). It is not
part of this kustomization because Prometheus scrape configuration is owned by
the kube-prometheus-stack Helm release.

Deployment status (2026-07-15): the job is live through Helm release revision
`16` with all five targets healthy. Prometheus retention is `90d` with a
`40GB` size cap on the existing `60Gi` PVC. The verified rollout and rollback
evidence is recorded in
[`docs/node-detail-v2-implementation-plan.md`](../../docs/node-detail-v2-implementation-plan.md).

For a new environment or a future target change:

1. Verify the WireGuard targets and the `collect[]` collector names against the
   installed node_exporter version.
   The current live Prometheus check confirmed `10.77.0.2:9100` through
   `10.77.0.5:9100` for the four external VPS. RS1000 is **not** a static
   `10.77.0.1:9100` target: it is discovered from the Kubernetes
   `monitoring-prometheus-node-exporter` Service (the current endpoint was
   `152.53.171.134:9100` and may change after a rollout).
2. Merge the entry into the live monitoring Helm values; do not overwrite the
   existing `additionalScrapeConfigs` list.
3. Start with one target and inspect `up{job="node-detail-fast"}`,
   `scrape_duration_seconds`, and `scrape_samples_post_metric_relabeling`.
4. Roll out the remaining targets only after the sample rate is close to the
   estimate in `docs/node-detail-v2-implementation-plan.md`.

Keep retention changes in a separate Helm revision from fast-scrape changes.
For the current production release, the following restores the prior
`30d/40GB` retention while preserving the fast job:

```sh
helm -n monitoring rollback monitoring 15 --wait --timeout 10m
```

The NodeBeacon API queries this job by `job="node-detail-fast",node_id="..."`
and falls back to the normal node selector until the fast job is available.

## Sampling cadence versus RIPE Atlas

`node-detail-fast` is direct host telemetry: Prometheus scrapes the five
`node_exporter` targets every 5 seconds. The browser also refreshes real-time
detail charts every 5 seconds while visible, so CPU, memory, disk, load, network
and connection charts can receive a fresh underlying sample on each request.

RIPE Atlas latency is a separate external path. Four public probes execute an
ICMP measurement every 300 seconds, while NodeBeacon checks the public `latest`
API every 60 seconds. A 5-second browser refresh can repeat the most recent RTT;
it must not be counted as another latency measurement. The on-demand information
panel therefore computes its 24-hour statistics from RIPE raw results rather
than Prometheus scrape points. Operational details and formulas are documented
in [`docs/ripe-atlas-latency.md`](../../docs/ripe-atlas-latency.md).
