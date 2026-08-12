# ADR 0013: Independently implement the Komari visual system

## Status

Superseded by ADR 0014 for the v1.1.0 public interface. The independent
implementation remains the owner/login/node-detail shell during the staged
migration.

## Context

NodeBeacon has long used Komari as an information-architecture and interaction
reference. The current Komari server repository is MIT licensed, while the
separate `komari-web` repository did not publish a license file when this
decision was recorded. Forking the server would also replace NodeBeacon's
Prometheus/Fastify/SQLite contracts with Komari's Agent, RPC2 and metric-store
contracts.

## Decision

NodeBeacon keeps its existing data and control planes and independently
implements the observed layout, density, responsive behavior and interaction
quality of Komari's default Radix interface. The implementation uses
`@radix-ui/themes` directly and NodeBeacon-owned React components and CSS. It
does not copy Komari frontend source, assets, branding, text, theme packages or
compiled output.

The same versioned appearance provider wraps public status, node detail, login
and owner pages. Public status remains a server-whitelisted contract and never
exposes registry selectors or owner metadata.

The visual reference is pinned to the public `komari-web/radix` branch at
commit `d859bcdd6dafb712baa0958cbc4dfa208e1013d7` (observed 2026-08-13).
Later upstream changes are not part of this decision unless reviewed and
recorded separately.

## Consequences

- NodeBeacon may visually track a pinned Komari reference without inheriting
  its Agent, RPC2, WebSocket, plugin, terminal or theme-execution surfaces.
- Unsupported Komari fields such as public billing, process counts and partial
  IP addresses are omitted rather than fabricated.
- Upstream visual changes are reviewed deliberately; they are not merged or
  pulled automatically.
