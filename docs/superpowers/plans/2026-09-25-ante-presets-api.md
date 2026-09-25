# Website AUD preset API

> REQUIRED: subagent-driven-development and test-driven-development.

## Spec and prerequisites

Website backend goal, confirmed user choices: shared Supabase, all user-selected Easy/Medium/Hard values from A$1 to A$50 per task. No defaults or imposed tier ordering. Shared SQL contract is independently reviewed at Ante c8046ec and deployed as20260925101013; actual JWT integration remains a later acceptance gate. This implements Task2 of Ante's docs/superpowers/plans/2026-09-25-ante-presets-backend.md. The narrow profileACL implementation/review runs first; only one implementation agent at a time.

## Global constraints

No UI/marketing/mobile, finance/consent/settlement, dependency upgrades, real email, hosted mutation or deployment. Public request-scoped Supabase SSR client only; no service key. No caller-selected owner, currency, quota or clock. Preserve Google/email auth, private responses and HTTPS cookie policy. These are saved preferences; do not claim spending/task-creation enforcement from this API.

## Task1: GET/PUT /api/account/ante-presets

Create app/api/account/ante-presets/route.ts, lib/server/ante-presets.ts, tests/ante-presets.test.ts, docs/contracts/ante-presets.md. Update .guidelines/design.md. Mark route force-dynamic and nodejs runtime. Extract only genuinely shared origin/body/response boundary code from email-auth into a small server-only helper if useful; preserve its admission-before-body/Auth ordering and tests. Do not duplicate bounded JSON parsing or canonical-host checks.

Both actions use configured canonical URL/Host; reject hostile origin/forwarded-host/proto before Auth. GET may omit Origin but rejects a supplied foreign/null Origin. PUT requires exact Origin and Host. Reject query parameters; endpoint has no owner selectors. Invalid public configuration returns private503/Retry-After60. GET andPUT only. All responses private,no-store.

PUT accepts exactly `{easy_cents:integer,medium_cents:integer,hard_cents:integer}` with integers100..5000 inclusive. Reuse bounded4096-byte streaming JSON parsing, MIME/UTF8/plainobject/extrakey checks from email implementation. Do not coerce strings, bools or fractions. Validate Origin/body before Auth/network work; malformed input returns400, oversize413 and unsupportedContent-Type415. No caller amount can reach RPC without validation.

Construct the existing callback-style request/response SSR client and verify identity with auth.getUser(); never authorize from getSession or unverified cookie metadata. Missing/invalid user returns401 and noRPC. Network/unavailableAuth returns503; provider429 returns429/Retry-After60. Do not forward caller Authorization/host headers or service credentials. The owner quota is enforced atomically inside the RPC:60 reads/30 writes per60seconds. This protects direct authenticated DataAPI calls as well as these routes.

GET calls get_my_ante_presets with noarguments; PUT calls set_my_ante_presets with exactly p_easy_cents,p_medium_cents,p_hard_cents. Validate strict response shape before returning: `{ok:true,presets:null}` allowed onlyGET; configured response exactly `{ok:true,presets:{currency:"AUD",easy_cents,medium_cents,hard_cents,updated_at}}` with amounts100..5000 integers and a bounded valid timezone-bearing timestamp string. Reject extra keys/owner/provider fields and malformed/nullsuccessfulPUT with503. SuccessfulGET/PUT returns200 and sameDTO. Rate reply exactly `{ok:false,error:"rate_limited",retry_after_seconds:N}` integer1..60 maps429 withmatchingRetry-After. SQL22023 maps400,28000 maps401, unexpected/transport/provider failures map503 withRetry-After60. Safe fixed responses/logs only, no provider messages/tokens/emails.

Cookie handling: after successful verifiedgetUser, propagate refreshed SSR cookies on both success and subsequent RPC failure/rate-denial responses, so token rotation does not log out the user. If identity verification fails, do not return provisional session cookies. Canonical origin/input failures construct noAuthclient. Preserve SecureHTTPS/Lax/path cookiepolicy from existing factory; don't copy incoming cookies wholesale.

Write RED tests againstactualroutes with only externalAuth/RPC mocked. Cover canonicalboundary beforeAuth, missingconfig, exact/malformed/oversized inputs and leadinginteger edgecases, missing/invalididentity, transport/providerthrottle, exactRPCarguments/noownerforwarding, unset/configuredGET,100/5000bounds/arbitrarytierorder, malformedRPCshape, deniedresponse/retrymapping, refreshedcookiesonbothverifiedsuccessandRPCerror, no cookiesonfailedidentity, tokenfreebodies/logs. Any commonhelperextraction must keep existingemail andcallback tests green.

Run focusedRED/GREEN, fullwebsite tests, typecheck, ESLint, Next and Worker builds, diffcheck. Build finalWorker with synthetic public config https://localhost.invalid / sb_publishable_localtest / http://localhost:8787 and no privatecredentials for controller denials-only smoke. Do not send realAuthrequests. Updatecontract/design and exactevidence/report, selfreview, commit and independentreview. Hosted positive identity/preset integration and actual browser UI remain unproven by mocks.
