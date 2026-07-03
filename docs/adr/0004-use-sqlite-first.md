# ADR-0004: Use SQLite First for NodeBeacon State

- Status: Accepted
- Date: 2026-07-03

## Context

NodeBeacon needs a small amount of application state:

- Users and password hashes.
- Sessions.
- Incident history received from Alertmanager webhooks.

The project monitors five servers and is expected to run as a personal SRE learning project, so local embedded state is enough for the first version.

## Decision

Use SQLite first, stored on a k3s PersistentVolumeClaim.

## Consequences

Benefits:

- Simple backup and restore.
- Low operational overhead.
- Good fit for a single small service.

Costs:

- Multi-replica writes are not a first-version goal.
- The deployment should start with `replicas: 1`.
- Backups need to be designed before production use.

## References

- [Development Plan](../development-plan.md)
