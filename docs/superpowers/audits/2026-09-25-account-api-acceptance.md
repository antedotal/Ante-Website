# Account API local acceptance

25 September 2026. Website feature branch only; this is not a hosted website release.

## Accepted implementation

- Account visitor admission `5207248`, packaging cleanup `63cb48d`: fixed 60/minute durable account namespace before server Auth, protected account proxy admission, public static sign-in path, shared limiter transport without callback/email quota changes.
- Canonical name GET/PATCH `49b89c4`: bounded exact input, Unicode name validation, owner-derived public-key RPCs, strict response data, private errors and verified refresh-cookie preservation. Shared session helpers preserve preset behavior.
- RPC throttle correction `91de31f`: actual PostgREST envelope status controls HTTP429 for name and preset requests, with realistic regression fixtures.
- SDK compatibility `0c84f8b`, fixture correction `1bfc28a`: exact Supabase JS2.106.0, SSR0.8.0 unchanged, actual installed SDK response parsing exercised with synthetic transport. Original installed version was2.93.3; earlier proposal2.104.0 was stale. No session is issued by the first confirmation response. Completed fixture uses the target address with pending state cleared.

Each task passed independent specification and quality review after its corrections. The whole account plan and SDK dependency delta received a final independent review over `b8f5f57..fafe187`: approved, no actionable cross-file findings.

## Verification evidence

Profile/preset HTTP429 fixtures failed503 before correction and passed429 afterward. Last full website suite passed102/102, typecheck and lint passed. The later SDK fixture/documentation-only correction passed focused4/4 and typecheck. Next and synthetic-public Worker builds passed after the SDK change. Earlier account/profile local Worker smoke verified private failures before Auth, hostile/malformed requests, unsupported methods and static sign-in; no private ingress credentials were configured and no provider call was made. OpenNext's experimental Node middleware warning remains.

The SDK regression first failed on the old installed library because the message-only success was cast to a user, then passed on2.106.0. SDK null user/session does not itself establish that a particular code was accepted; future email-change endpoints require authoritative same-user pending-state checks.

## Boundaries still open

The underlying name, preset and admission SQL releases were reviewed/deployed separately in Ante. Website server-key PostgREST access, direct Cloudflare ingress, hosted JWT owner isolation, browser refresh/session behavior, OTP templates/delivery and Google/email identity behavior remain external acceptance gates. Current antedotal.com Pages hosting was not changed. Profile-name UI/mobile canonical-read integration is outside this backend slice. Email editing, private avatars, authoritative task/private-proof dependencies and consent/customer-ownership work remain unfinished; settlement and live money stay closed.
