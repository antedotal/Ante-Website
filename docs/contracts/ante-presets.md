# Account Ante presets API

`GET /api/account/ante-presets` reads the signed-in owner's saved task amount preferences. `PUT /api/account/ante-presets` replaces all three preferences. This endpoint stores preferences only; it neither creates tasks nor authorizes payments or enforces amounts in another product path.

Both routes require valid public account configuration, the configured canonical URL and Host, admission through the server-only account visitor limiter, and a verified Supabase user from `auth.getUser()`. A supplied GET `Origin` must equal the canonical site origin; PUT always requires that exact `Origin`. Host, forwarded host and forwarded protocol must agree with the configured site. Query parameters and malformed PUT bodies are rejected before admission. All other supported HTTP methods, including HEAD and OPTIONS, return bodyless HTTP 405 with `Allow: GET, PUT` and private/no-store headers without admission or Auth. Account data calls use the request-scoped public SSR client, never a service key or caller-selected owner. The server-only key is used only for the fixed admission RPC. The public data RPCs derive ownership from `auth.uid()`.

PUT requires `Content-Type: application/json` and a body of at most 4096 actual bytes. The entire JSON object must have exactly these three keys, with each value an integer from 100 to 5000 inclusive:

```json
{"easy_cents":100,"medium_cents":2500,"hard_cents":5000}
```

Amounts are independent AUD cents. No tier order or default is imposed. Strings, fractions, extra keys and malformed UTF-8 are rejected. GET calls `get_my_ante_presets()` without arguments. PUT calls `set_my_ante_presets(p_easy_cents,p_medium_cents,p_hard_cents)` with the validated integers. The deployed SQL RPCs enforce an atomic per-owner rolling quota of 60 reads and 30 writes per 60 seconds, including direct authenticated Data API calls.

An unset GET returns HTTP 200 with `{"ok":true,"presets":null}`. A configured GET or successful PUT returns HTTP 200 with this exact shape:

```json
{"ok":true,"presets":{"currency":"AUD","easy_cents":100,"medium_cents":2500,"hard_cents":5000,"updated_at":"2026-09-25T10:00:00+00:00"}}
```

The website validates the entire RPC reply, including field set, currency, amount bounds and a bounded timestamp with an explicit zone. A malformed reply fails closed. RPC rate replies of `{"ok":false,"error":"rate_limited","retry_after_seconds":N}` with integer `N` from 1 through 60 return HTTP 429 and matching `Retry-After`.

Other outcomes use fixed public messages: 400 invalid request or SQLSTATE 22023; 401 missing/invalid user or SQLSTATE 28000; 403 invalid origin; 413 body too large; 415 unsupported content type; 429 account admission denial with validated `Retry-After` from 1 through 60 or provider throttle with `Retry-After: 60`; and 503 unavailable admission/configuration/Auth/RPC or malformed provider reply with `Retry-After: 60`. Every response uses `Cache-Control: private, no-store`. Verified identity refresh cookies survive later RPC success, denial or failure; provisional cookies are discarded when identity verification fails. No provider details, credentials or tokens are returned in JSON.

The separate `public.consume_website_account_limit(p_visitor_hash text)` service-only SQL RPC uses an atomic rolling 60-second window with a 60-per-visitor ceiling. The website sends a SHA-256 HMAC of `website-account:v1:` plus the canonical direct Cloudflare IP, never the raw IP or request cookies. It accepts the same exact two-field admission reply as the callback limiter. The callback/email five-per-minute store remains unchanged. Local mock tests do not verify hosted ingress or SQL atomicity.

The shared SQL release is documented in `Ante/supabase/releases/ante-presets/README.md`. Local website tests use mocked external Auth/RPC calls. Actual hosted JWT acceptance, owner isolation through PostgREST and browser use require separate verification before public release.
