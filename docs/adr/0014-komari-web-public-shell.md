# ADR 0014: Use a pinned Komari Web fork as the public shell

## Status

Accepted for v1.1.0.

## Context

ADR 0013 delivered an independently implemented Komari-like visual system.
The project owner subsequently created and explicitly selected three GitHub
repositories for a source-based migration:

- `xljya/NodeBeacon`: product, release and deployment repository;
- `xljya/NodeBeacon1`: retained infrastructure/backend source history;
- `xljya/NodeBeacon-Web`: fork of `komari-monitor/komari-web`.

The Komari Web repository still does not display a license file at the time of
this decision. Repository forking, attribution and technical provenance are
preserved here, but this ADR is not a legal conclusion about redistribution.

## Decision

The public `/` status page is built from the pinned `nodebeacon` branch of
`xljya/NodeBeacon-Web`. Its source is vendored at `apps/status-web`; the exact
source commit is recorded in `apps/status-web/NODEBEACON_WEB_COMMIT`.

The frontend uses a narrow NodeBeacon Gateway rather than emulating Komari's
backend. It reads `/api/status`, `/api/site-config`, `/api/auth/session` and
the whitelisted public node-series endpoint. It does not call `/api/rpc2`,
does not connect to Prometheus directly and does not implement Komari Agent,
Metric Store, WebSocket, plugins, WebSSH, terminal or executable themes.

Migration is staged inside the existing single container:

- `/` and `/instance/*` use the Komari-derived public shell;
- `/instance/:id` redirects to `/nodes/:id`;
- `/nodes/*`, `/login` and `/admin/*` use the existing NodeBeacon React shell;
- both shells use the same Fastify BFF, authentication, Prometheus and SQLite;
- the legacy shell's assets are assembled under `/legacy/assets` to prevent
  filename and React-runtime collisions.

The two applications intentionally keep their native stacks: React 19 for the
public shell and React 18 for the owner shell. `apps/status-web` is excluded
from the pnpm workspace and built from its upstream npm lock, isolating both
the runtime and TypeScript dependency graphs.

## Consequences

- Public status uses actual Komari Web component source while NodeBeacon keeps
  its existing data plane and security boundary.
- Unsupported public fields (IP, billing, client version, private notes,
  labels, process counts and fabricated hardware data) remain absent.
- An old root-scoped Komari PWA worker is explicitly retired because it could
  otherwise intercept navigation intended for the owner shell.
- Upstream synchronization is deliberate: update the Web fork first, run its
  build/lint gates, then vendor a reviewed fixed commit into this repository.
- Moving node detail or owner pages onto the source-based shell requires a
  separate contract review; RPC2 compatibility endpoints remain out of scope.
