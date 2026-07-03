# ADR-0002: Use Fastify as the Backend-for-Frontend API

- Status: Accepted
- Date: 2026-07-03

## Context

NodeBeacon needs a backend layer between the browser and Prometheus.

The backend needs to:

- Expose stable JSON APIs for the UI.
- Query Prometheus and normalize metric results.
- Hide Prometheus credentials and PromQL details from the browser.
- Handle auth, sessions, caching, and incident history.

Alternatives considered:

- Plain Node.js HTTP server.
- Express.
- Fastify.
- A Python backend.
- Let the frontend query Prometheus directly.

## Decision

Use `Node.js + TypeScript + Fastify` for the NodeBeacon API.

Fastify will act as a backend-for-frontend, not as a second monitoring database. Prometheus remains the source of metric truth.

## Consequences

Benefits:

- Fastify is small, structured, and suitable for a focused API service.
- TypeScript gives safer Prometheus response mapping and API contracts.
- The API can later expose health checks and metrics for Prometheus.

Costs:

- We need a Node.js build pipeline and container image.
- Fastify plugins and validation patterns should be chosen consistently early.

## References

- [Development Plan](../development-plan.md)
