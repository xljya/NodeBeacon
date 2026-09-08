# Upstream review through 2026-09-04

## Scope

This review covers Komari Web changes from the NodeBeacon fork point
`d859bcdd6dafb712baa0958cbc4dfa208e1013d7` through upstream commit
`abaaa4ec8fffaa67c8dbafcbdaa654f47794f8b3`.

The `radix` tracking branch was fast-forwarded to the reviewed upstream commit.
The `nodebeacon` product branch remains a selective adaptation and must not be
treated as a drop-in Komari frontend.

## Accepted

- Upstream commit `aa4e78bb40c2fc5569af065b7999a33e1bab1374` was adapted to replace large PNG
  preview, PWA icon and selected OS logo assets with WebP files.
- Runtime references, the static manifest and theme packaging metadata were
  updated to match the new asset names.
- The NodeBeacon Vite configuration intentionally keeps PWA generation disabled;
  the retired root-scoped service worker was not restored.

## Rejected from the product branch

- Plugin configuration and plugin/theme market changes: NodeBeacon does not load
  executable plugins or ZIP themes.
- Terminal, remote file browser, editor, upload and download changes: NodeBeacon
  does not expose WebSSH, arbitrary commands or remote file access.
- RPC2 and Komari Agent changes: the browser only uses the documented NodeBeacon
  REST gateway.
- Komari EULA handling and SSRF setting changes: these belong to the Komari Go
  server and its API, not the NodeBeacon Fastify owner contract.
- Upstream route and sidebar restructuring: NodeBeacon owns a reduced route table
  and an Owner menu limited to implemented NodeBeacon capabilities.
- File-editor-only dependencies such as Monaco and encoding detectors.

## Future reviews

The next upstream review should start after
`abaaa4ec8fffaa67c8dbafcbdaa654f47794f8b3`, inspect each change against
`docs/NODEBEACON_GATEWAY.md`, and continue to run the forbidden-endpoint scan
before any source is vendored into the NodeBeacon product repository.
