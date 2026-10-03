# Website AUD preset API

> REQUIRED: subagent-driven-development and test-driven-development.

## Spec and prerequisites

Website backend goal, confirmed user choices: shared Supabase, all user-selected Easy/Medium/Hard values from A$1 to A$50 per task. No defaults or imposed tier ordering. Shared SQL contract is independently reviewed at Ante c8046ec and deployed as 20260925101013; actual JWT integration remains a later acceptance gate. This implements Task 2 of Ante's docs/superpowers/plans/2026-09-25-ante-presets-backend.md. The narrow profile ACL implementation/review runs first; only one implementation agent at a time.

## Global constraints

No UI/marketing/mobile, finance/consent/settlement, dependency upgrades, real email, hosted mutation or deployment. Public request-scoped Supabase SSR client only; no service key. No caller-selected owner, currency, quota or clock. Preserve Google/email auth, private responses and HTTPS cookie policy. These are saved preferences; do not claim spending/task-creation enforcement from this API.

## Task 1: GET/PUT /api/account/ante-presets

Create app/api/account/ante-presets/route.ts, lib/server/ante-presets.ts, tests/ante-presets.test.ts, docs/contracts/ante-presets.md. Update .guidelines/design.md. Mark route force-dynamic and nodejs runtime. Extract only genuinely shared origin/body/response boundary code from email-auth into a small server-only helper if useful; preserve its admission-before-body/Auth ordering and tests. Do not duplicate bounded JSON parsing or canonical-host checks.

Both actions use configured canonical URL/Host; reject hostile origin/forwarded-host/proto before Auth. GET may omit Origin but rejects a supplied foreign/null Origin. PUT requires exact Origin and Host. Reject query parameters; endpoint has no owner selectors. Invalid public configuration returns 503 with private headers/Retry-After 60. GET and PUT only. All responses private,no-store.

PUT accepts exactly `{easy_cents:integer,medium_cents:integer,hard_cents:integer}` with integers 100..5000 inclusive. Reuse bounded 4096-byte streaming JSON parsing, MIME/UTF-8/plain-object/extra-key checks from email implementation. Do not coerce strings, bools or fractions. Validate Origin/body before Auth/network work; malformed input returns 400, oversize 413 and unsupported Content-Type 415. No caller amount can reach RPC without validation.

Construct the existing callback-style request/response SSR client and verify identity with auth.getUser(); never authorize from getSession or unverified cookie metadata. Missing/invalid user returns 401 and no RPC. Network/unavailableAuth returns 503; provider 429 returns 429/Retry-After 60. Do not forward caller Authorization/host headers or service credentials. The owner quota is enforced atomically inside the RPC: 60 reads/30 writes per 60 seconds. This protects direct authenticated Data API calls as well as these routes.

GET calls get_my_ante_presets with no arguments; PUT calls set_my_ante_presets with exactly p_easy_cents,p_medium_cents,p_hard_cents. Validate strict response shape before returning: `{ok:true,presets:null}` allowed onlyGET; configured response exactly `{ok:true,presets:{currency:"AUD",easy_cents,medium_cents,hard_cents,updated_at}}` with amounts 100..5000 integers and a bounded valid timezone-bearing timestamp string. Reject extra keys/owner/provider fields and malformed/null successful PUT with 503. Successful GET/PUT returns 200 and same DTO. Rate reply exactly `{ok:false,error:"rate_limited",retry_after_seconds:N}` integer 1..60 maps 429 with matching Retry-After. SQL 22023 maps 400; SQL 28000 maps 401, unexpected/transport/provider failures map 503 with Retry-After 60. Safe fixed responses/logs only, no provider messages/tokens/emails.

Cookie handling: after successful verified getUser, propagate refreshed SSR cookies on both success and subsequent RPC failure/rate-denial responses, so token rotation does not log out the user. If identity verification fails, do not return provisional session cookies. Canonical origin/input failures construct no Auth client. Preserve Secure HTTPS/Lax/path cookie policy from existing factory; don't copy incoming cookies wholesale.

Write RED tests against actual routes with only external Auth/RPC mocked. Cover canonical boundary before Auth, missing configuration, exact/malformed/oversized inputs and integer edge cases, missing/invalid identity, transport/provider throttle, exact RPC arguments/no owner forwarding, unset/configuredGET,100/5000 bounds/arbitrary tier order, malformed RPC shape, denied response/retry mapping, refreshed cookies on verified success and RPC errors, no cookies on failed identity, token-free bodies/logs. Any common helper extraction must keep existing email andcallback tests green.

Run focused RED/GREEN, full website tests, typecheck, ESLint, Next and Worker builds, diff check. Build final Worker with synthetic public config https://localhost.invalid / sb_publishable_localtest / http://localhost:8787 and no private credentials for controller denials-only smoke. Do not send real Auth requests. Update contract/design and exact evidence/report, self-review, commit and independent review. Hosted positive identity/preset integration and actual browser UI remain unproven by mocks.
