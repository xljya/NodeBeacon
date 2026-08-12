# `/api/status` Contract

`GET /api/status` is the first stable frontend/backend contract for NodeBeacon.

The browser must call this endpoint instead of querying Prometheus directly. The
backend owns PromQL, caching, error handling, and node metadata mapping.

## Response

```json
{
  "generatedAt": "2026-07-03T08:30:00.000Z",
  "cache": {
    "ttlSeconds": 30,
    "stale": false
  },
  "summary": {
    "total": 5,
    "online": 5,
    "degraded": 0,
    "offline": 0,
    "regions": 3,
    "groups": [
      { "group": "Core", "total": 1, "online": 1 }
    ]
  },
  "nodes": [
    {
      "id": "rs1000",
      "name": "RS1000",
      "provider": "netcup",
      "group": "Core",
      "region": "EU",
      "countryCode": "US",
      "location": "United States",
      "displayOrder": 10,
      "public": true,
      "tags": ["k3s", "prometheus"],
      "online": true,
      "status": "online",
      "os": {
        "name": "Debian",
        "arch": "amd64"
      },
      "metrics": {
        "cpuPercent": 11.8,
        "memoryPercent": 42.4,
        "memoryUsedBytes": 3650722201,
        "memoryTotalBytes": 8589934592,
        "diskPercent": 31.6,
        "diskUsedBytes": 27165638656,
        "diskTotalBytes": 85899345920,
        "load1": 0.38,
        "uptimeSeconds": 16250400,
        "networkRxBytesPerSecond": 9500,
        "networkTxBytesPerSecond": 4200,
        "networkRxBytesTotal": 440401920,
        "networkTxBytesTotal": 325058560
      },
      "updatedAt": "2026-07-03T08:30:00.000Z"
    }
  ]
}
```

## Error Shape

All API errors should use the same JSON envelope:

```json
{
  "error": {
    "code": "status_unavailable",
    "message": "Status data is temporarily unavailable.",
    "details": {
      "requestId": "optional-debug-id"
    }
  }
}
```

## Field Notes

- `group` is a manual display group from `config/nodes.example.yaml`; it is not
  inferred from metrics.
- `region` is a broader display/filtering region. `countryCode` is an optional
  ISO 3166-1 alpha-2 country code used to render the national flag; it must not
  be inferred from `region` (for example, `EU` is not a country).
- `displayOrder` controls stable ordering on the public page and later in the
  admin node table.
- `/api/status` contains public nodes only. Prometheus `labels`, private or
  internal IP addresses, client versions, private notes, billing metadata and
  detail policy are explicitly excluded by a server-side whitelist serializer.
- Prometheus labels remain available only to authenticated owner routes. They
  are never needed by the public browser because PromQL execution is
  server-only.
- `generatedAt` describes when the response was produced. `updatedAt` is per
  node and will later reflect the last successful scrape or adapter update.
- `cache.stale=true` means the API returned previous cached data or fixture
  fallback because Prometheus was unavailable. The frontend should keep showing
  the page and surface the stale state instead of treating it as a hard crash.
- When `PROMETHEUS_URL` is configured, `/api/status` uses server-side whitelisted
  PromQL for `up`, CPU, memory, root filesystem disk usage, load, uptime, and
  network throughput. Browsers never submit PromQL.
- `networkRxBytesPerSecond` and `networkTxBytesPerSecond` are current rates.
  `networkRxBytesTotal` and `networkTxBytesTotal` are the physical-interface
  counters since the current host boot; they reset when the host or counter
  resets. Container, bridge, tunnel and WireGuard interfaces are excluded to
  avoid counting the same traffic twice.

## Public Node Detail V2

`GET /api/public/nodes/:id/detail` returns the public-safe system profile,
capabilities, and current metrics for a public node whose detail view is
enabled. It returns `404` for hidden, disabled, or authenticated-only nodes and
`503 node_detail_unavailable` when the server-side metric query fails.

`GET /api/public/nodes/:id/series` is the batched trend endpoint. Supported
query parameters are:

- `metrics`: comma-separated whitelist of at most eight values from
  `cpu,memory,swap,disk,network,latency,connections`.
- `range`: `realtime`, `1d`, `7d`, `30d`, `60d`, or `custom`.
- `from` and `to`: required ISO timestamps for `custom`; the server enforces the
  allowed retention window.
- `aggregation`: `avg`, `min`, `max`, `first`, `last`, `stddev`, `p70`, `p95`,
  or `p99`; default is `avg`.

The response includes `nodeId`, requested/data coverage timestamps,
`stepSeconds`, the selected aggregation, and a list of typed series. Network
returns separate rate (`rx`, `tx`) and cumulative (`rxTotal`, `txTotal`)
series. Disk series carry `mountpoint`/`device` labels. Latency series use the
`ping` key and carry the real `peer` or `vantage` label discovered from the
server-owned `blackbox-tcp-wireguard` query; clients must display those labels
instead of inventing probe names.

Both endpoints preserve the BFF boundary: the browser may choose only the
documented enums and never submits PromQL, selectors, or arbitrary labels.

### Public RIPE Atlas latency statistics

`GET /api/public/nodes/:id/latency-stats?vantage=<key>` returns a public-safe,
on-demand aggregate of the last 24 hours of raw RIPE Atlas ping results. The
node and vantage must exist in the server-owned registry/configuration. Hidden,
disabled, and authenticated-only nodes preserve the same `404` boundary as the
other public detail endpoints. Requests are limited to 30 per minute.

The response includes the public measurement/probe identity, measurement
window, configured interval and ICMP type, plus packet loss, min/max/average,
latest, P50, P99, population standard deviation, mean absolute change between
consecutive successful measurement averages, actual measurement counts, and
received/sent packet counts. Nullable statistics use `null` when no valid raw
packet RTT exists. NodeBeacon caches each node/vantage response for 5 minutes.

This endpoint reads only public RIPE data and never returns the target address,
probe source address, API UUID, Prometheus credentials, or arbitrary query
access. It is requested only after the user opens a latency-series information
panel; chart rendering continues to use the existing server-side Prometheus
series endpoint.
