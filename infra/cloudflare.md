# Cloudflare edge policy for `monitor.liucf.com`

NodeBeacon does not require a Worker. Keep the edge policy small and make the
origin headers authoritative: every `/api/*` response is `Cache-Control:
no-store`, content-hashed `/assets/*` files are immutable for one year, and SPA
HTML is `no-cache`.

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

References:

- [Cloudflare Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Cloudflare Origin Cache Control](https://developers.cloudflare.com/cache/concepts/cache-control/)
- [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare HSTS requirements](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)
- [Cloudflare Web Analytics CSP requirements](https://developers.cloudflare.com/web-analytics/faq/#what-do-i-need-to-add-to-my-content-security-policy-csp)
