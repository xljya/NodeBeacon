# Admin latency probes

Owner-only endpoints for central Blackbox probes. The browser never submits
PromQL. Targets are either a single validated URL/host or an allow-listed
nationwide China ISP TCP catalog. Probes run from RS1000 Blackbox Exporter,
not from per-node agents.

## List and single-target CRUD

- `GET /api/admin/probes` returns stored tasks (`http`, `tcp`, `icmp`).
- `POST /api/admin/probes` creates one task. `protocol` must be `http`, `tcp`,
  or `icmp`. `target` is at most 240 characters.
- `PATCH /api/admin/probes/:id` updates name, target, interval, or enabled.
- `DELETE /api/admin/probes/:id` removes one task.

Enabled TCP targets are reconciled onto fixed Probe resources:

- IPv4 TCP → `nodebeacon-managed-tcp` (`tcp_connect_ipv4`)
- IPv6 TCP (`-v6.` hostname or `[IPv6]:port`) → `nodebeacon-managed-tcp6`
- at most 100 enabled targets per IP family

## China ISP TCP catalog

`GET /api/admin/probes/catalog` returns the allow-listed provinces, carriers,
IP families, default 20-province selection, and `zstaticcdn.com:80` hostname
template. The server builds targets as
`{province}-{carrier}-{v4|v6}.ip.zstaticcdn.com:80`.

`POST /api/admin/probes/batch` accepts `{ provinces, carriers, ipFamilies,
intervalSeconds?, enabled? }`, skips existing `tcp` targets, and rejects a
batch that would exceed the per-family cap.

`POST /api/admin/probes/batch/delete` removes stored TCP tasks whose targets
match the same selection.

## Live results

`GET /api/admin/probes/results` aggregates `probe_success`, duration, HTTP
status, 24h success rate, and TLS expiry for the public `PROBE_JOB` plus the
managed Probe jobs. `GET /api/latency` remains the public HTTP-job summary and
does not include the China ISP catalog.
