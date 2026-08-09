# Cloudflare edge policy for `monitor.liucf.com`

NodeBeacon does not require a Worker. Keep the edge policy small and make the
origin headers authoritative: every `/api/*` response is `Cache-Control:
no-store`, content-hashed `/assets/*` files are immutable for one year, and SPA
HTML is `no-cache`.

The origin also enforces a network boundary: nginx accepts the NodeBeacon
hostname only when the TCP peer is in Cloudflare's published IPv4/IPv6 ranges.
`CF-Connecting-IP` is used for the restored visitor address only after that
source check; the presence of the header alone is not an authentication signal.
The committed nginx copy is updated from Cloudflare's lists at
<https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>.

The commands below intentionally contain no account IDs or tokens. Create a
scoped API token only if these rules are later managed as code; the production
host and repository do not currently store Cloudflare credentials.

## Cache Rules

Create these rules for the `liucf.com` zone in this order. When multiple Cache
Rules set the same property, Cloudflare applies the last matching rule, so keep
the API bypass after any broad cache rule.

### 1. Cache NodeBeacon hashed assets

Expression:

```text
(http.host eq "monitor.liucf.com" and starts_with(http.request.uri.path, "/assets/"))
```

Settings:

- Cache eligibility: Eligible for cache.
- Edge TTL: Use cache-control header if present, bypass cache if not.
- Browser TTL: Respect existing header.

### 2. Never cache NodeBeacon API or auth paths

Expression:

```text
(http.host eq "monitor.liucf.com" and
 (starts_with(http.request.uri.path, "/api/") or
  starts_with(http.request.uri.path, "/auth/")))
```

Settings:

- Cache eligibility: Bypass cache.

The `/auth/` branch is defensive for future top-level auth routes; current auth
endpoints live below `/api/auth/` and already match the first branch.

## Login rate limiting

Fastify remains the authoritative control and allows five login attempts per
minute per process. Add one Cloudflare rate-limiting rule as a burst shield.

Free-plan-compatible expression:

```text
(http.request.uri.path eq "/api/auth/login")
```

Start with five requests per 10 seconds and a 10-second Managed Challenge. If
the zone plan supports method/host fields, narrow it to:

```text
(http.host eq "monitor.liucf.com" and
 http.request.method eq "POST" and
 http.request.uri.path eq "/api/auth/login")
```

Review Security Events after rollout before lengthening the mitigation window.
Cloudflare rate counters are distributed and are a perimeter burst control, not
a replacement for NodeBeacon's origin limiter.

## HSTS boundary

nginx sends `Strict-Transport-Security: max-age=15552000` for this hostname only.
Do not add `includeSubDomains` or `preload` until every `liucf.com` subdomain is
known to support HTTPS continuously. Cloudflare proxying, origin TLS and the
certificate renewal path must remain enabled throughout the max-age window.

## Web Analytics and CSP

Cloudflare currently injects its Web Analytics/RUM beacon automatically. The
CSP therefore permits scripts from `https://static.cloudflareinsights.com`;
automatic beacon uploads use the same-origin `/cdn-cgi/rum` endpoint, which is
already covered by `connect-src 'self'`. No other third-party script origin is
allowed. If Web Analytics is disabled later, remove this script source as well.

## Verification

```sh
curl -sSI https://monitor.liucf.com/ \
  | grep -Ei 'content-security-policy|strict-transport-security|x-content-type-options|referrer-policy|permissions-policy|cache-control|cf-cache-status'

curl -sSI https://monitor.liucf.com/api/status \
  | grep -Ei 'cache-control|cf-cache-status'

asset="$(curl -fsS https://monitor.liucf.com/ | sed -n 's/.*src="\([^"]*\/assets\/[^"]*\.js\)".*/\1/p' | head -1)"
curl -sSI "https://monitor.liucf.com${asset}" \
  | grep -Ei 'cache-control|cf-cache-status'
```

Expected results:

- HTML: `Cache-Control: no-cache` plus all security headers.
- API: `Cache-Control: no-store`; repeated requests never become a cache hit.
- Hashed asset: `Cache-Control: public, max-age=31536000, immutable`; repeated
  requests can become `HIT` after Cloudflare fills its cache.
- A direct request to the origin IP, even with a forged `CF-Connecting-IP`
  header, returns 404 because the source address is not a Cloudflare edge.

References:

- [Cloudflare Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Cloudflare Origin Cache Control](https://developers.cloudflare.com/cache/concepts/cache-control/)
- [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare HSTS requirements](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)
- [Cloudflare Web Analytics CSP requirements](https://developers.cloudflare.com/web-analytics/faq/#what-do-i-need-to-add-to-my-content-security-policy-csp)

## Production rollout record

The nginx source allowlist and real-IP restoration were applied to the origin
on 2026-08-09 (Asia/Shanghai) together with the NodeBeacon 1.0.43 release.
The same change added a default-drop host firewall with an explicit UDP 8472
deny for the single-node Flannel VXLAN path. See the release acceptance record
for the direct-origin and public-header checks.

Applied to the `liucf.com` zone for `monitor.liucf.com` on 2026-07-11
(Asia/Shanghai). Existing DNS, SSL, Tunnel, bot controls and managed WAF settings
were left unchanged.

### Active rules

| Order | Rule | Rule ID | Effective settings |
| --- | --- | --- | --- |
| 1 | `NodeBeacon - Cache hashed assets` | `6fca667180b048b0a7d3fa0de282b53b` | Eligible for cache; Edge TTL uses the origin Cache-Control header and bypasses when absent; Browser TTL accepts the origin TTL |
| 2 | `NodeBeacon - Bypass API and auth` | `3b4ce4fd7c3e4824b9eec0dd11b7980a` | Bypass cache for `/api/` and `/auth/` |

The active login burst rule is `NodeBeacon - Login burst protection` (rule ID
`0221c751f22f4fc0a166bd94ab94086c`). It matches the production hostname,
`POST`, and the exact `/api/auth/login` path, counting by IP. The Free plan
offered a 10-second period and `Block`, but not Managed Challenge, so the
deployed fallback is five requests per 10 seconds with a 10-second block.
Fastify's five-per-minute limiter remains the authoritative origin control.

### Acceptance evidence

Production header checks after deployment returned:

- `/`: `Cache-Control: no-cache`, `CF-Cache-Status: DYNAMIC`.
- `/api/status`, repeated: `Cache-Control: no-store`,
  `CF-Cache-Status: DYNAMIC`.
- `/assets/index-Db5Jxr4n.js`, repeated: `Cache-Control: public,
  max-age=31536000, immutable`, `CF-Cache-Status: HIT`.
- Invalid login burst: attempts 1-5 returned the normal application `401`;
  attempt 6 reached the Fastify `429`; attempt 7 was blocked at Cloudflare
  with error `1015` and `Retry-After: 10`.

Security Events sampling did not immediately show the test event, but the
Cloudflare-generated `1015` response confirms that the edge rate-limit action
executed. No real administrator credentials were used for the test.
