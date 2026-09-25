# Email one-time-code backend implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add rate-limited server endpoints for requesting and verifying email one-time codes, returning session cookies without exposing tokens in JSON.

**Architecture:** Two POST routes share bounded JSON parsing, canonical-origin checks and the accepted Cloudflare admission boundary. Each valid email also consumes a separate HMAC-keyed email bucket through the same fixed five-per-minute RPC. Supabase's ordinary public-key SSR client sends/verifies OTP; privileged credentials are used only by the limiter adapter.

**Tech Stack:** Existing Next.js/Workers, Supabase SSR and Vitest. No new dependencies or UI.

**Spec:** `docs/WEBSITE_BACKEND_GOAL.md` and the user's confirmed choices: prepare Cloudflare Workers while Pages stays live; add email one-time-code sign-in.

## Global constraints

- Execute after the current SQL task passes independent review; do not run simultaneous implementation agents.
- No real email, hosted provider configuration, deployment, database mutation or marketing/native UI changes.
- Reuse the shared Supabase project and cookie adapter. Never use a service key for Auth, and never return session/access/refresh tokens in JSON or logs.
- New and existing users may use this sign-in path, consistent with Google account creation; set shouldCreateUser explicitly rather than relying on an SDK default. Document this behavior.
- All store/network/configuration failures fail closed. Preserve the existing Google callback and account behavior.

## Review focus

- Cross-site login requests must fail before parsing sensitive data or contacting Auth.
- Oversized/chunked JSON and unexpected fields cannot consume unbounded memory or select provider options.
- An attacker cannot bypass the email quota by changing IP or spelling/case of the same email address.
- A successful verification sets SSR cookies but does not serialize provider tokens into the response body.
- Missing provider sessions, malformed/expired codes and provider/network failures cannot be reported as authenticated.

## Task 1: Request and verify routes

**Files:** Create `app/auth/email/request/route.ts`, `app/auth/email/verify/route.ts`, `lib/server/email-auth.ts`, `tests/email-auth.test.ts`, and `docs/contracts/email-auth.md`. Extend `lib/server/callback-admission.ts` with a small server-only email-subject admission helper reusing existing configuration, HMAC and response helpers; do not duplicate the store adapter. Update relevant existing tests and `.guidelines/design.md`.

**Interfaces:** Request accepts exactly `{email:string}`. Verify accepts exactly `{email:string,code:string}`. Both routes expose POST only and declare Node runtime for the already configured Workers Node compatibility. Success from request is generic HTTP 202 `{ok:true}`; successful verification is HTTP 200 `{ok:true}` with session cookies. Client navigation is a later UI task. Fixed generic errors use 400 for malformed inputs, 403 for untrusted origin, 413 for oversize input, 415 for unsupported content type, 429 for exhausted quota/provider throttle, 401 for invalid verification, and 503 for unavailable configuration/store/provider. All responses are private/no-store; 429 has Retry-After and 503 uses Retry-After 60.

- [ ] Write RED tests against the actual routes with external store fetch and Supabase Auth calls replaced. For example, a hostile Origin must return 403 with no store/Auth call; a denied quota must return 429 before body parsing; valid verification must set the test session cookie while `await response.json()` equals `{ok:true}` and contains no token.
- [ ] Implement canonical origin/Host validation using the configured site origin. Require the POST Origin header to match exactly; do not accept `null`, missing Origin, arbitrary forwarding headers, or client-supplied redirect destinations. Keep callback GET's existing contract intact. Invalid config returns the existing private 503 helper.
- [ ] After origin validation, consume the existing IP admission before reading the body. Parse only application/json, with an actual streamed-byte limit of 4096 (Content-Length alone is insufficient), fatal UTF-8 decoding and a plain JSON object. Cancel the reader on oversize. Reject unknown keys. Normalize email by trim/lowercase, require a bounded ordinary email address (maximum 254 characters, one @, no whitespace/control characters); do not reuse marketing's provider whitelist. Preserve the code as a string, including leading zeroes; require 6–10 ASCII digits and let the provider validate its configured exact length.
- [ ] Consume a separate email bucket using HMAC-SHA256 of `website-auth-email:v1:` plus normalized email. No raw email is sent to the limiter or logged. Both request and verify share this email quota; both also consume the existing IP quota. Same email with different IPs therefore cannot bypass the subject limit. Denied/unavailable subject admission must prevent Auth calls. Document that the service RPC's historical callback name is reused for fixed auth buckets; no new SQL policy or caller-controlled capacity is introduced.
- [ ] Request OTP using the public SSR client and `signInWithOtp({email,options:{shouldCreateUser:true}})`. Return the same generic 202 for accepted and ordinary provider rejections to avoid exposing account existence. Propagate provider 429 with safe retry guidance. Distinguish transport/unavailable failures as generic 503, without provider messages or supplied email. Never return `data.user` or `data.session`.
- [ ] Verify using `verifyOtp({email,token:code,type:'email'})`. Return success only with a non-null provider session and user identity; preserve SSR cookie writes on that success response. Provider invalid/expired-code errors return generic 401, throttle returns 429, unavailable transport returns 503. Failed or missing-session results cannot return provisional session cookies or success. Do not echo supplied code/email or provider details.
- [ ] Cover missing/hostile Origin, store ordering and failures, chunked oversize bodies, unknown fields, malformed JSON/UTF-8, leading-zero codes, email normalization, separate IP/email quotas, shared subject bucket across both actions, ordinary account-error non-enumeration, provider 429/unavailable behavior, no-session verification, successful cookie propagation, token-free bodies and logs. Use real route/admission code with external boundaries mocked, not mocks of the behavior being tested.
- [ ] Run focused RED/GREEN, full website tests, typecheck, ESLint, Next build and Worker build. Update contract/design docs with endpoint semantics and remaining provider acceptance. Commit and obtain independent review.

## Provider acceptance remains separate

Supabase's signInWithOtp sends a magic link by default unless the email template contains `{{ .Token }}`. Verify templates and delivery for both existing accounts and new sign-ups, the configured OTP length/expiry, SMTP delivery, same-account Google/email linking and actual Workers Set-Cookie behavior before enabling this flow. No real test email may be sent without an explicitly authorized recipient. Local mocks do not establish provider configuration or delivery.

Reference checked 25 September 2026: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://supabase.com/docs/reference/javascript/auth-signinwithotp.
