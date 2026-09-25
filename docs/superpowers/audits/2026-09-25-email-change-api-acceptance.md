# Authenticated email-change local acceptance

25 September 2026. Accepted local backend implementation; hosted email activation remains disabled.

Task 1 (`d992226`, `454eb17`) adds independent SSR cookie stages, shared unchanged email validation, and action-specific fixed-five durable user admission. Task 2 (`449b967`) adds authenticated request/confirmation routes. Independent task specification/security/quality reviews approved both. Final whole-plan review found one P2: malformed successful JSON could leak body snippets through SDK refresh logs. Fix `a58c993` sanitizes that parse failure without eagerly reading/replacing the response stream or changing valid JSON/status/headers. Scoped final re-review approved it with no remaining actionable findings.

Real installed SDK tests reproduced and then closed rejected-fetch, provider 4xx expired-refresh, and malformed 200 expired-refresh log leaks on the isolated client. They also prove that rejected updateUser calls may stage a PKCE verifier and that the HTTP route discards it. Route tests cover verified current/pending target binding, both inboxes, pending/completed distinctions, wrong returned user/session identity, uncertain postflight, admission ordering, strict input and cookie release. The full suite passed 135/135 with typecheck, lint, Next build and synthetic Worker build. Earlier eight local Worker denial checks covered both new routes' 503/400/403/405 behavior, private responses and absence of cookies.

The HTTP contract is docs/contracts/account-email-change.md. `ANTE_EMAIL_CHANGE_MODE` stays unset until hosted confirmations, Secure Email Change, exact two-inbox OTP templates/delivery and authorized browser/Worker acceptance are verified. No real email, provider setting, deployment, SQL change, UI or mobile change was made by this plan. The confirmed-email database trigger was separately reviewed and deployed as 20260925120526.

Remaining authentication hardening follow-on: the older callback/proxy/server SSR adapters do not yet use the isolated client's log sanitization. Evaluate the same real-SDK failure paths there and share an Auth-only transport boundary if reproduced; do not blindly apply generic error-body replacement to RPCs, whose SQL error codes are needed by profile/preset routes. This accepted email-change scope is not a claim that every Auth client has that protection.

Task reports and review packages were temporary ignored plan artifacts. This committed audit, implementation/tests and contracts are the durable record.
