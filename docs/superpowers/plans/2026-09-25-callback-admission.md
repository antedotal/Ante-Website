# Callback admission implementation plan

**Hosting decision:** Cloudflare Pages remains the live static site; the user chose to prepare a Cloudflare Workers deployment for account backend routes. The Worker adapter/runtime deployment and email one-time-code flow are separate slices.

**Goal:** Enforce the website side of durable callback admission before any authentication processing, failing closed until its shared database service is installed and configured.

**Architecture:** A server-only admission module requires explicit direct Cloudflare ingress configuration, identifies the visitor from one `CF-Connecting-IP` value and sends an HMAC digest to a service-only Supabase RPC. The database owns time and atomic sliding-window admission; the website never maintains process-local counters. This plan implements the website integration against an explicit RPC contract; the database implementation and deployment are a required subsequent slice in the Ante repository.

**Tech Stack:** Existing Next.js 16, Node crypto/net, fetch and Vitest; no new runtime dependencies unless server-only needs an explicit dependency.

**Spec:** `docs/plans/2026-09-23-shared-account-session.md`, outstanding callback gate, and `docs/WEBSITE_BACKEND_GOAL.md`.

## Global constraints

- No UI, email-auth, marketing, financial or shared database edits in this slice.
- Cloudflare Workers is the selected deployment target, while the shared Supabase RPC is still a proposed contract. No deployment or new secret provisioning in this slice.
- No in-memory production fallback. Missing identity, configuration, network response or valid admission result returns private/no-store 503.
- Never log IPs, digests, credentials, OAuth codes, request URLs or provider error details.
- The shared database RPC remains undeployed: document this and keep account routes unlinked.

## Review focus

1. A caller-controlled forwarding header cannot select a different identity outside verified ingress.
2. Equivalent IPv6 textual forms and IPv4-mapped IPv6 cannot create extra buckets.
3. A redirect, hung store, bad JSON or malformed admission record cannot allow authentication or expose a secret.
4. Proxy execution and malformed callback handling cannot bypass the admission gate.
5. The new secret-bearing module cannot enter a client bundle; existing server session/cookie behavior stays intact.

## Task 1: Website admission integration

**Files:** Create `lib/server/callback-admission.ts`, `lib/server/callback-limit-store.ts`, their focused tests and `docs/contracts/callback-admission.md`; modify `app/auth/callback/route.ts`, `proxy.ts`, `tests/account-session.test.ts`, `.guidelines/design.md` and the package lockfile for `server-only`.

**Interfaces:** Export `admitCallback(request: NextRequest): Promise<NextResponse | null>`; null means admitted, response means stop. Use explicit server-only environment names `ANTE_AUTH_INGRESS=cloudflare`, `ANTE_AUTH_LIMIT_HMAC_SECRET` (minimum 32 bytes), and `SUPABASE_SECRET_KEY` (sb_secret_ format) or legacy `SUPABASE_SERVICE_ROLE_KEY` (service_role JWT). Use the existing configured Supabase URL, with no caller override. Only the REST limiter request is permitted before admission, never an Auth request.

The stable RPC contract is `public.consume_website_callback_limit(p_visitor_hash text) returns jsonb`, with one object `{ "allowed": boolean, "retry_after_seconds": integer }`. Allowed requires retry=0; denied requires retry 1..60. Database policy is at most five admissions per rolling 60 seconds per HMAC identity, using server time and atomic serialization; callers cannot set capacity or time. Website sends only the lowercase SHA-256 HMAC digest; HMAC input is `website-auth-callback:v1:` plus canonical IP. Public/authenticated execute must be revoked by the backend implementation.

- [x] Write behavior-first RED tests for host/config gating, absent/invalid/list headers, IPv4 and canonical IPv6 identity, unrelated forwarding header spoofing, and secret-free requests/logs. Use only `CF-Connecting-IP` when the operator sets `ANTE_AUTH_INGRESS=cloudflare`; reject `CF-Worker`, the cross-zone sentinel and zone suffixes; normalize equivalent IPv6 and mapped IPv4. No arbitrary-header or localhost bypass.
- [x] Write RED adapter tests using mocked external fetch only: allowed/denied, HTTP failure, invalid JSON/result bounds, thrown/aborted request, redirect refusal, no credentials in body/query, no incoming cookie/auth forwarding. Use `cache: 'no-store'`, `redirect: 'error'`, a bounded five-second abort, POST JSON and apikey. Opaque secret keys go in apikey only; legacy service JWT also goes in Authorization. Do not read/log failed response bodies.
- [x] Write RED integration tests around the actual callback: denied/unavailable admission prevents code validation and client construction/exchange, admitted existing callbacks preserve behavior, malformed callbacks still consume admission. Remove callback from proxy matcher and guard direct proxy invocation for that path, testing no createServerClient/getClaims call occurs. Preserve host rejection before any external request.
- [x] Implement the minimum production code. Denied returns 429 and validated Retry-After; unavailable returns 503 and Retry-After 60. Both have private/no-store. Log only fixed reason labels. Include purpose comments. Declare callback Node runtime for crypto/net.
- [x] Update the seven existing session tests to use a mocked external limiter response/config rather than mocking away the admission integration. Add a deterministic external-store test double to prove the sixth request is denied, independent visitors are isolated and two module instances use the same external store. Explicitly state these tests do not prove database atomicity.
- [x] Run focused tests, then `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`. Update design docs with deployment configuration, Cloudflare ingress limitations, secret isolation, and remaining actual-database/provider acceptance gates. Commit the implementation and report exact RED/GREEN evidence.

References checked 25 September 2026: Cloudflare documents single-client `CF-Connecting-IP`, Worker subrequest behavior, the cross-zone sentinel and Pseudo IPv4 overwrite behavior (https://developers.cloudflare.com/fundamentals/reference/http-headers/). Supabase API key documentation requires secret keys in backend components and distinguishes opaque keys from JWT bearer tokens (https://supabase.com/docs/guides/getting-started/api-keys).
