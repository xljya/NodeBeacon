# ADR-0005: Ship Web and API in One Container First

- Status: Accepted
- Date: 2026-07-03

## Context

NodeBeacon has two major runtime surfaces:

- The web UI.
- The Fastify API that queries Prometheus and manages auth.

The first production target is a single RS1000 k3s service behind `monitor.liucf.com`.

## Decision

Ship the first version as one container:

- Build the frontend into static assets.
- Serve static assets from the Fastify service.
- Serve API routes from the same Fastify process.

## Consequences

Benefits:

- One image, one Deployment, one Service, one ingress path.
- Easier first deployment and rollback.
- No cross-origin auth or cookie complexity in the first version.

Costs:

- Frontend and backend share one release path in the first version.

## References

- [Development Plan](../development-plan.md)
