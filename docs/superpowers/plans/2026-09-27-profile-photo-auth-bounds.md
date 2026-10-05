# Profile photo Auth bounds implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bound photo-session Auth network and body processing without changing other account flows or enabling photo serving.

**Architecture:** Inject a photo-only bounded raw fetch beneath the existing Auth sanitizer. The SSR cookie adapter and exact-token `getUser` authority remain unchanged; photo session operations also race an abort/deadline so SDK initialization or retries cannot hold the request indefinitely.

**Tech Stack:** Next.js 16.3.3, Supabase SSR 0.8.0 / JS 2.106.0, TypeScript, Vitest.

**Spec:** Paired backend `docs/superpowers/audits/2026-09-27-server-mediated-profile-read-design.md`, bounded Auth prerequisite only. Independent design review approved this slice. The mediated SQL/reader and admission whole-flow integration remain separate pending work.

## Global Constraints

- Work only in existing isolated website `codex/shared-web-account`; no provider calls, credentials, live fixtures, deployment, photo mode changes, or mobile changes.
- Preserve existing default `createAuthFetch` and `createCallbackClient` behavior for every non-photo caller.
- Photo Auth successful bodies: at most 65,536 bytes; each raw network+body operation at most 10,000 ms, with explicit races even if fetch/read/cancel ignores abort. Error-body recognition remains at most 2,048 bytes / 1,000 ms and preserves only existing `session_not_found` classification.
- Initial photo session work has one 30,000 ms absolute duration cap from verification entry, including SDK initialization/refresh and exact-token getUser; a supplied caller signal can expire sooner. This is NOT yet the route-entry whole-read cap. No phase resets this session cap.
- Redirects are rejected before following; malformed/oversized/stalled replies never leak provider text, tokens, request URLs or decoder details into errors/logs.
- No service credential participates in session verification. Preserve successful SSR refresh cookies and exact canonical verified identity. Failed initial verification exposes no provisional cookies.
- Abort is best effort for provider work; the returned result must be bounded even if provider promises ignore it. Cancel late bodies without awaiting hostile cancel promises, and do not permit SDK retries to issue fresh network calls after abort.

## Review Focus

- SDK refresh initialization/retries must not bypass the session cap or launch new I/O after abort.
- Revoked refresh replies must still remove cookies in the existing sanitizer/SSR flow.
- A late response or stream/cancellation that never settles must not keep the photo operation pending.
- Request-shaped fetch input and init signals must not lose cancellation or leak credentials through redirected requests.
- Default unrelated Auth flow behavior must remain unchanged with no injected transport.

### Task 1: Bound the photo session transport and SDK wait

**Files:**
- Create `lib/server/profile-photo-auth-fetch.ts` and `tests/profile-photo-auth-fetch.test.ts`.
- Modify `lib/supabase/auth-fetch.ts`, `lib/supabase/server.ts`, `lib/server/profile-photo-session.ts`.
- Create `tests/profile-photo-session.test.ts`; extend existing `tests/auth-fetch.test.ts` and `tests/account-profile-photo.test.ts` only where integration assertions belong.
- Update `.guidelines/design.md` with the actual transport boundaries.

**Interfaces:**
- `createAuthFetch(projectUrl: string, transport?: typeof fetch): typeof fetch`; omitted transport keeps existing behavior. All requests delegate to supplied raw transport, then retain current Auth-only sanitation.
- `createCallbackClient(request: NextRequest, response: NextResponse, transport?: typeof fetch)` injects raw transport through `createAuthFetch(url, transport)`; it never bypasses sanitation.
- `createProfilePhotoAuthFetch(projectUrl: string, signal: AbortSignal): typeof fetch` returns a raw transport restricted to configured HTTPS origin `/auth/v1` or descendants. Each call combines its input/init signals with the owning signal. Exact caps above; successful responses are completely buffered before return. Error responses remain within existing sanitizer bounds and retain status/classification when safely available. On oversize/stalled error bodies, preserve numeric status with an empty safe-to-sanitize body; never invent session_not_found. Reject redirects and partial/invalid successful responses. No arbitrary origin delegation in this photo-only wrapper.
- `verifyProfilePhotoSession(request: NextRequest, signal?: AbortSignal): Promise<PhotoSessionResult>` preserves existing result union; combines request/supplied abort and the session cap. It injects the bounded raw transport, observes abort before/after each awaited SDK operation, races SDK waits against one shared deadline and clears owned timers/listeners. Fresh `getUser(exactToken)` remains authoritative; aborted/timed-out work returns fixed503.
- The later mediated route will supply its route-entry 30s signal to this function and bound admission separately. Do not implement privileged reads, final re-verification or that route integration here.

- [x] **Step 1: Add failing behavior tests.** With fake timers and controlled streams, assert: 65,536-byte successful Auth JSON accepted; 65,537 bytes rejected without Content-Length; malformed/lying length rejected; 10s stalled fetch and stalled body terminate even ignoring signal; late response body cancelled; never-resolving cancel does not hang; redirects and foreign origins rejected; Request/init/owner abort stops I/O; raw network errors do not reach SDK text. Assert error-body 2KiB/1s bounds and revoked classification preservation. In session tests, stalled SDK getSession/getUser returns503 by the single30s cap; request/parent abort returns503 and prevents subsequent getUser; getUser receives exact extracted token; session.user is not authority; successful refresh cookies remain preserved. Retain existing revoked-session/default-transport tests.
- [x] **Step 2: Run red tests.** `pnpm exec vitest run tests/profile-photo-auth-fetch.test.ts tests/profile-photo-session.test.ts tests/auth-fetch.test.ts`; record actual intended failing assertions before implementation.
- [x] **Step 3: Implement the interfaces above.** Reuse existing sanitizer rather than copying its error classification. Keep transport resource handling focused; fixed errors only. Document any unavoidable SDK work retained after cancellation, without claiming cancellation retracts a provider request already sent.
- [x] **Step 4: Verify green.** Run the same focused tests plus `tests/account-profile-photo.test.ts`; run `pnpm typecheck` and scoped ESLint on changed TS files. Then run canonical `pnpm test` once. Fix concrete regressions, do not broaden provider acceptance or repeat unchanged suites.
- [x] **Step 5: Commit the source and guideline changes.** Report commit IDs, red/green evidence, exact counts, and any remaining limitations to the controller for independent task and final review.

## Follow-through boundary

After source review, update website goal/handoff with the completed local prerequisite and explicit remaining mediated manifest/SQL, bounded admission, two-pass authorization, cache cutover and hosted runtime/real-session acceptance. Source tests do not establish deployed behavior or compatibility with every real Auth payload. No photo gate is enabled by this plan.

## Completion record

Source task and independent final review complete at `d5a8018`; see [local acceptance](../audits/2026-09-27-profile-photo-auth-bounds-acceptance.md). Broader mediated-reader implementation and hosted activation remain pending, as scoped above.
