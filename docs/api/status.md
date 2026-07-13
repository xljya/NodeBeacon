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
      "location": "Germany",
      "displayOrder": 10,
      "public": true,
      "labels": {
        "job": "node-exporter",
        "instance": "10.77.0.1:9100"
      },
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
- `displayOrder` controls stable ordering on the public page and later in the
  admin node table.
- `labels` are the server-side Prometheus label mapping. The browser receives
  them for transparency in P0, but PromQL execution remains server-only.
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
