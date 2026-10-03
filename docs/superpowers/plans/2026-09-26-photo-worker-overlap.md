# Photo Worker Overlap Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Establish fail-fast scope sharing and recovery in the actual local OpenNext Worker under a deterministic overlapping request.
**Architecture:** Extend existing synthetic temporary probe with optional overlap mode. A temporary control handler acquires the real production processing scope and waits on an explicit bounded barrier; the existing probe calls the real raw validator while it is held. Distinct route modules must return the same per-isolate diagnostic identity. No shipped diagnostic endpoint.
**Tech Stack:** Existing Node/Wrangler/OpenNext/Vitest; no dependencies.
**Spec:** docs/superpowers/audits/2026-09-26-photo-processing-scope-design.md and docs/superpowers/audits/2026-09-26-photo-processing-scope-review.md.

## Global Constraints

- No production route/validator/codec/store edits, providers, credentials, network services, deployment, Docker, UI or activation.
- Existing synthetic allowlisted environment, temporary HOME, dotenv refusal, owned process-group lifecycle, busy-port refusal, nonce readiness and clean rebuild apply to both temporary routes and shared diagnostic module.
- Distinct route modules: real withProfilePhotoProcessing holder, real validateProfilePhoto contender; no mocked processing flag.
- Barrier is explicit, per-run authenticated by random nonce, bounded to 5 seconds, released in finally. Readiness must indicate holder acquired the actual slot before contender begins. No sleeps as proof, Promise.all alone insufficient.
- Client and server work bounded by existing overall signal/deadline. Run at most two controlled rounds; no stress/performance certification.
- Report exactly what was tested: local shared scope across diagnostic routes and raw pipeline, not hosted or full authenticated production route overlap. No CPU/peak memory claims.
- Reports ignored, explicit files committed; leave main checkouts/live site untouched.

## Review Focus

- Different isolate/module identities invalidate the experiment rather than proving contention.
- Busy contender503 must have decoder_unavailable and no read/pull/decode; instrument synthetic zero-prefetch body inside diagnostic handler, no production instrumentation.
- Holder failure and normal release both permit subsequent maximum-area image200.
- Any failed assertion releases barrier and cleans every temporary source/artifact and owned process.
- Production bundle after clean rebuild has no diagnostic URLs/control/identity artifacts.

### Task 1: Actual local Worker overlap probe

**Files:** scripts/check-profile-photo-worker.mjs; optional scripts/profile-photo-worker-overlap.mjs for testable diagnostic source/protocol; tests/profile-photo-worker-overlap.test.ts; .guidelines/design.md; docs/superpowers/audits/2026-09-26-photo-worker-overlap-results.md.

- [ ] Write a focused RED test of the protocol orchestrator using a synthetic fetch double: holder readiness before contender, exact nonce/isolate equality, wrong503code fails, busy body counters remainzero, release always called after assertion failure. Test wrong-isolate response and stuck barrier bounded cleanup. Keep tests behavioural, not literal source substring assertions.
- [ ] Add `--overlap` mode mutually exclusive with --boundary. Generate a temporary shared diagnostic-state module with isolate UUID, holder stage, bounded release callback and counters. It holds no image data. All control calls require run nonce; never include real keys.
- [ ] Holder handler uses the production `withProfilePhotoProcessing` and marks acquired only inside its callback. Contender handler creates a request with a highWaterMark0 stream around a synthetic valid fixture; raw production validator must503 without pulls, then nonblocking cancellation observed. A separate scoped contender must503 without entering its callback. Verify distinct route modules share diagnostic isolate ID and processing scope.
- [ ] Round1 normal holder release; round2 callback failure after acquisition. Each uses explicit status polling with bounded request deadline, then contender checks, then release; await terminal holder response and a subsequent max-area PNG/JPEG200 with exact dimensions. Failure-path holder error must be fixed/sanitized, not raw thrown text. Test must fail if any holder leaks capacity.
- [ ] Reuse lifecycle helpers rather than inventing cleanup. Create both temporary routes/module only after refusing preexisting paths; remove all before final clean build, also on failure. Capture one actual `node scripts/check-profile-photo-worker.mjs --overlap` run; fix failures without weakening expectations.
- [ ] Run focused tests/typecheck/lint. Inspect cleanup source/artifacts and listener shutdown. Record SHA/runtime versions, run/isolate IDs, outcomes/counters, expected warning and limitations; explicit commit/report. No whole unrelated suite or previous boundary rerun absent concrete need.
