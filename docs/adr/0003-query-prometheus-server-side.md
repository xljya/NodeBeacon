# ADR-0003: Query Prometheus Only from the Server Side

- Status: Accepted
- Date: 2026-07-03

## Context

The status page prototype currently uses mock data. Real data is available in Prometheus through node_exporter and blackbox_exporter metrics.

The browser could technically call Prometheus HTTP APIs, but that would expose:

- Prometheus endpoint details.
- Basic Auth credentials or proxy auth assumptions.
- Arbitrary PromQL query surface.
- CORS and caching complexity.

## Decision

The browser must not query Prometheus directly.

NodeBeacon API will query Prometheus server-side through a fixed set of metric services and whitelisted PromQL templates. The frontend will call NodeBeacon APIs such as `/api/status`, `/api/nodes/:id`, and `/api/nodes/:id/range`.

## Consequences

Benefits:

- Prometheus remains private.
- The frontend receives stable product-shaped JSON instead of raw Prometheus responses.
- API responses can be cached for 15-30 seconds to reduce Prometheus load.
- PromQL changes do not require UI rewrites.

Costs:

- The backend must own metric mapping and error handling.
- More backend tests are needed around Prometheus response parsing.

## References

- [Development Plan](../development-plan.md)
- [Monitoring Setup](../../monitoring-setup.md)
