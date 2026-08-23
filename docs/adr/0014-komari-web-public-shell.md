# ADR 0014: Use a pinned Komari Web fork as the public shell

## Status

Accepted for v1.1.0; owner-route cutover amended for v1.1.3; node-detail
cutover amended for v1.1.9; React 18 leftover shell retired in v1.1.10.

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

- `/` uses the Komari-derived public shell;
- `/instance/:id` is a server 308 to `/nodes/:id`; public-shell node links
  navigate directly to `/nodes/:id` so the public layout is not painted first;
- `/login` and `/admin/*` use the reviewed Komari-derived NodeBeacon Owner shell;
- `/login-v2` and `/admin-v2/*` permanently redirect to the official paths;
- `/nodes/*` uses the same Komari-derived React 19 shell as `/` from v1.1.9;
- leftover React 18 assets and `apps/web` were removed in v1.1.10; Fastify now
  serves only the React 19 `apps/status-web` bundle, using the same Fastify BFF,
  authentication, Prometheus and SQLite.

`apps/status-web` remains excluded from the pnpm workspace and is built from
its upstream npm lock, isolating the React 19 runtime from the API workspace.

## Consequences

- Public status uses actual Komari Web component source while NodeBeacon keeps
  its existing data plane and security boundary.
- Unsupported public fields (IP, billing, client version, private notes,
  labels, process counts and fabricated hardware data) remain absent.
- An old root-scoped Komari PWA worker is explicitly retired because it could
  otherwise intercept navigation intended for the owner shell.
- Upstream synchronization is deliberate: update the Web fork first, run its
  build/lint gates, then vendor a reviewed fixed commit into this repository.
- Owner pages moved in v1.1.3 and node detail moved in v1.1.9; RPC2
  compatibility endpoints remain out of scope.
