# Canonical account profile name API

`GET /api/account/profile` reads the signed-in owner's canonical `full_name`. `PATCH /api/account/profile` changes that one field. The website calls `get_my_profile_name()` without arguments or `set_my_profile_name({p_full_name})`; the SQL functions derive ownership from `auth.uid()` and enforce rolling 60-second owner quotas of 60 reads and 30 writes. An absent profile returns 404. This endpoint never creates one.

Both methods require valid public account configuration, the configured canonical URL and Host, matching forwarded host/protocol headers, one account visitor admission, and a user verified by `auth.getUser()` before the public-key SSR client calls an account-data RPC. GET permits an absent `Origin`; any supplied Origin must match the site. PATCH requires that Origin. Query parameters are rejected. Invalid requests are rejected before admission or Auth. All other supported methods, including HEAD and OPTIONS, return bodyless private 405 with `Allow: GET, PATCH` before admission.

PATCH requires `Content-Type: application/json` and at most 4096 actual body bytes. The JSON must be an ordinary object with exactly one string field:

```json
{"full_name":"Ari Example"}
```

The website trims only ASCII spaces at each edge. The result must contain 1–120 Unicode code points and no C0/C1 controls or unpaired UTF-16 surrogate. Punctuation, non-Latin scripts and emoji are valid. The setter independently applies the same rules and updates only `full_name` and `updated_at` on the existing owner profile. It never writes Auth metadata, email, avatar or other profile fields.

Successful GET/PATCH returns exactly `{"ok":true,"profile":{"full_name":"Ari Example","updated_at":"2026-09-25T10:00:00+00:00"}}`. GET also permits a null name and/or null timestamp, and preserves existing provider-created names verbatim even when they predate the setter length limit. PATCH requires a nonnull timestamp and a returned name identical to the normalized input. The website validates the complete RPC reply and timestamp before sending this narrow JSON response; extra provider, email, Stripe or owner fields fail closed.

The exact SQL quota denial `{"ok":false,"error":"rate_limited","retry_after_seconds":N}` with integer `N` from 1–60 returns 429 and matching `Retry-After`. Other fixed outcomes are 400 for invalid input or SQLSTATE `22023`; 401 for failed Auth or SQLSTATE `28000`; 403 for invalid origin/host; 404 for SQLSTATE `P0002`; 413 for excessive body; 415 for other MIME; 429 for account visitor admission denial or provider throttle; and 503 with `Retry-After: 60` for unavailable configuration, admission, Auth, transport or malformed RPC data. Provider throttles also return `Retry-After: 60`. Every response is private/no-store. Refreshed cookies are forwarded only after successful identity verification, including later RPC errors; provisional cookies are discarded on failed identity.

The service-only key is used only by the fixed account visitor admission RPC. Account-data reads and writes use the request-scoped public-key SSR client and never a service key, direct `profiles` table write, or caller-selected owner. The shared SQL release and hosted postconditions are documented in `Ante/supabase/releases/profile-name/README.md`. Local website tests mock external Auth/RPC; hosted JWT owner isolation, browser session refresh and direct Cloudflare ingress still need acceptance before public release. The mobile companion must switch its canonical name read to `get_my_profile_name()`; provider metadata or a local copy cannot remain authoritative. Email and private-avatar work are separate, incomplete slices.
