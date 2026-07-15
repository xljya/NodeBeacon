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
