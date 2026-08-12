# Authentication UI endpoints

`GET /api/auth/session` is the public, no-store session probe used by shared
page chrome. It always returns HTTP 200:

```json
{ "user": null }
```

With a valid signed server session it returns the same public account object as
`/api/auth/me`. It never creates a session and never returns secrets.

`GET /api/auth/me` keeps its strict authenticated semantics and returns 401
without a valid session. Login, second factor and logout remain under
`/api/auth/*`.
