# ADR-0004: Use SQLite First for NodeBeacon State

- Status: Accepted
- Date: 2026-07-03

## Context

NodeBeacon needs a small amount of application state:

- Users and password hashes.
- Sessions or refresh tokens, depending on auth implementation.
- Incident history received from Alertmanager webhooks.
- Optional UI preferences.

The project monitors five servers and is expected to run as a personal SRE learning project. A full PostgreSQL deployment would work, but it adds operational weight before the product needs it.

Alternatives considered:

- SQLite on a k3s PVC.
- PostgreSQL.
- Cloudflare D1.
- In-memory storage.

## Decision

Use SQLite first, stored on a k3s PersistentVolumeClaim.

PostgreSQL remains a future option if incident history, multi-user access, or querying needs grow beyond SQLite.

## Consequences

Benefits:

- Simple backup and restore.
- Low operational overhead.
- Good fit for a single small service.

Costs:

- Multi-replica writes are not a first-version goal.
- The deployment should start with `replicas: 1`.
- Backups need to be designed before incident history becomes important.

## References

- [Development Plan](../development-plan.md)
