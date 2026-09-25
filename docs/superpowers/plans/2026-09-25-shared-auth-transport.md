# Shared server Auth transport privacy

Required: subagent-driven-development and test-driven-development.

## Specification

The website goal requires safe authentication logging. The email-change plan established actual SDK leaks for rejected fetch, provider error and malformed-success JSON, and accepted a narrow isolated-client fix. Older callback/server/proxy clients still construct the same SDK without that boundary. Close confirmed occurrences there without changing account RPC behavior. See docs/superpowers/audits/2026-09-25-email-change-api-acceptance.md.

## Constraints

Existing website worktree only. No UI/browser-client changes, SQL, provider calls/emails, dependencies, hosted settings or deployments. Preserve callback/admission/session/cookie semantics and all status/DTO contracts. No global console/fetch monkey patch. No eager buffering or reencoding of valid successful responses. Reports remain ignored. No subagents by implementer.

## Task 1: Shared Auth-only fetch boundary

First reproduce at least one secret-bearing SDK log through an older real SSR adapter using synthetic expired-session/provider failure fixtures; use actual installed SDK, not a mock of its Auth methods. Cover all three known classes as regression coverage: thrown transport, failed HTTP error body/statusText, and malformed HTTP200 JSON. Record RED before wiring the new shared helper.

Extract the accepted isolated transport behavior into a server-only helper, e.g. lib/supabase/auth-fetch.ts, parameterized only by trusted configured Supabase project URL. Intercept only requests whose exact URL origin matches that project and whose path is /auth/v1 or begins /auth/v1/. Parse string/URL/Request inputs correctly. Nonmatching requests must pass through unchanged (including Response identity, SQL error body/code/details/status/headers and original rejected value), so RPC/Storage behavior is not silently rewritten. Rejecting a malformed input must not expose a raw request/token through Auth logs; do not log it. No environment/client-selected policy flags.

For matched Auth requests: thrown transport becomes fixed Error without cause; non-success HTTP responses retain numeric status but fixed safe JSON/status text, with best-effort cancellation of the discarded original body without waiting on an untrusted cancellation promise; valid successful Response body/status/headers/stream remain untouched except its json() rejection becomes a fixed SyntaxError without cause. Do not consume the successful stream before the SDK asks. Preserve typed standard fetch signature. Keep existing SDK error classification by numeric status and do not alter normal user/session parsing. Preserve the installed SDK's revoked-session/PKCE cleanup by recognizing only an exact `session_not_found` code from a byte- and time-bounded failed Auth body, then synthesizing a fixed safe legacy `error_code`; all other codes and provider fields remain generic. Malformed, oversized and stalled bodies use the generic safe envelope. No raw provider headers or data need to enter errors.

Wire the helper into lib/supabase/server.ts createClient/createCallbackClient, proxy.ts server SSR constructor, and isolated-account-stage.ts; remove duplicated transport implementation. Do not change browser Supabase client. Existing visitors still admit before constructing Auth. Preserve refresh/cookie isolation and generic receipt behavior.

Tests: actual SDK failure/log regression through older adapter, per-constructor helper wiring (mock only external transport/SSR construction where useful), successful response parse/stream and normal session behavior; error numeric statuses400/401/429/503 preserved; non-Auth RPC P0002/22023 error envelopes and Storage responses untouched; hostile/lookalike origin or path not accidentally classified Auth; Request and URL input forms; cancellation of discarded failure body without reading it; current isolated and endpoint regressions. No network/provider request.

Run focused RED/GREEN, full website suite, typecheck/lint, Next and synthetic Worker builds. Local runtime smoke need only repeat if request routing/cookie behavior changes or a new concrete runtime concern arises. Update design, relevant acceptance notes and goal; distinguish library response/log tests from hosted provider/browser acceptance. Commit explicit task files, report commands/results and remaining gates for independent task and final one-task review.
