# RS1000 egress probes

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
