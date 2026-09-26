# Website backend goal

Updated 26 September 2026. Requested scope: Ante-Website backend only.

## Objective

Build and verify the server-side foundation for the website account portal, sharing the mobile app's Supabase identity and authoritative data. Continue the existing `codex/shared-web-account` worktree; preserve its completed sign-in scaffold rather than rebuilding it. UI, marketing and unrelated mobile implementation are outside this goal.

## Execution order

1. Harden shared authentication and sessions. Add durable, race-safe per-visitor abuse limits before callback processing or authentication network calls; enforce trusted client identity, safe redirects, private responses and safe logging. Verify shared-project configuration and distinguish local tests from actual provider acceptance.
2. Define and implement server-side account/profile and AUD difficulty-preset contracts with validation, ownership checks and appropriate limits. Keep shared schema migrations in the Ante backend repository; do not create a competing website schema history.
3. Add website server-side task and private proof-upload integration when the authoritative shared RPC contracts are ready. Enforce ownership/verifier permissions, current proof attempts, permitted object formats/sizes and replay protections. Do not bypass blocked backend authority by writing legacy tables directly.
4. Prepare Stripe sandbox card setup only after consent and customer-ownership contracts are established. Keep settlement, capture and live-money activation closed. Short-task holds and long-task definitive-failure charges are the selected future direction; delayed holds remain an alternative. Reviewer silence and any possible 50% charge remain undecided.
5. Complete independent review, relevant integration checks and handoff documentation. Record configuration and external acceptance gaps explicitly.

## First implementation slice

Shared account sign-in hardening and durable authentication rate limiting. Confirm the actual hosting/trusted-IP boundary and shared store before choosing the limiter. An in-memory counter is insufficient across server instances. Return 429 with Retry-After on exhaustion, avoid logging credentials or raw personal data, and do not let the proxy perform authentication work before the callback limit.

Existing code supports Google sign-in only. The user has now requested email sign-in as well; the user selected email one-time codes. Harden Google and add the confirmed email backend flow without UI changes. The user confirmed Cloudflare Pages hosting; the user authorized preparing Cloudflare Workers while the existing Pages site stays live. A real Workers build and runtime acceptance are required before release.

## Acceptance and safeguards

- Use bounded subagent implementation, behavior-first tests and independent specification/quality review.
- Run relevant tests, type checks, ESLint and production build; update `.guidelines/design.md` for technical changes.
- Test limit concurrency, isolation, expiry, failure handling and request ordering, plus identity/authorization boundaries for each new endpoint.
- Reuse the same Supabase project as mobile; verify deployed behavior separately from local source checks.
- Preserve existing financial history, deployed paused financial endpoints and retained local database recovery evidence.
- Do not make UI changes, invent financial consent or describe undeployed work as live.

## Goal registration status

The user removed the previous paused cross-project goal. The website-backend replacement goal was successfully registered as active on 25 September 2026, without a token budget. This document records its scope and acceptance gates.

## Current handoff — 26 September 2026

### Completion audit — current evidence, not a completion claim

| Goal requirement | Current evidence | Remaining requirement |
| --- | --- | --- |
| Shared Auth and durable visitor admission | Implemented routes and reviewed local tests; shared limiter SQL deployed | Real server-key/JWT, ingress and browser/Worker acceptance |
| Profile, AUD presets, email editing | Source routes and local review accepted; shared prerequisite SQL deployed | Hosted ownership/JWT checks; SMTP/two-inbox configuration and authorized recipients |
| Private photos | Reviewed source; maximum-boundary and controlled same-isolate local Worker evidence | Full authenticated route/hosted checks, CPU characterization and defensible total-memory acceptance; serving disabled |
| Task/private-proof contracts | Fresh 26 September public function-catalog query returned no four planned task-authority RPCs | Authoritative backend contracts must be ready; no legacy-write fallback |
| Stripe sandbox setup | Workstream mandates versioned consent/server-owned customer IDs; current goal conditions setup on approved contracts | Approved consent/customer-ownership implementation contract; no settlement or live money |
| Reviewable commits/handoff | Current isolated branch commits and acceptance receipts | Entire objective is not achieved; no deployment or whole-project completion claimed |

A fresh key-type-only scan of expected local files found public legacy anon credentials only, not a server key. No values were displayed. The file-path clarification and Workers-plan question remain unanswered. The current route inventory has no task/proof or card-setup routes, consistent with the explicit dependency gates above.


The goal remains active. Work is committed on the existing website `codex/shared-web-account` and shared backend `codex/web-first-foundation` branches. Main checkouts and the current antedotal.com Pages site remain untouched.

### Accepted locally

- Google callback, email OTP sign-in, private request/session boundaries and durable callback/account admission.
- A$1..A$50 independent Easy/Medium/Hard preset GET/PUT, and canonical name GET/PATCH. See [account acceptance](superpowers/audits/2026-09-25-account-api-acceptance.md).
- Authenticated email-change request/confirm endpoints, isolated cookie stages, per-user/action admission and exact SDK 2.106.0. Both task reviews and final review are accepted through `a58c993`; 135 website tests, typecheck, lint, Next and Worker builds pass. See [email-change acceptance](superpowers/audits/2026-09-25-email-change-api-acceptance.md). The operator activation gate remains unset.

- Shared server Auth transport is independently reviewed through `b2b1083`: safe SDK errors across callback/server/proxy/isolated clients, preserved RPC/Storage behavior and revoked-session cookie cleanup. 159 tests, typecheck, lint and Next/Worker builds pass. See [Auth transport acceptance](superpowers/audits/2026-09-25-shared-auth-transport-acceptance.md).

### Deployed shared prerequisites

Callback limiter 20260925095113; account visitor limiter 20260925111932; preset contracts 20260925101013; narrow profile write permissions 20260925101749; friendship mutation protection 20260925103930; canonical profile names 20260925105731; confirmed-email synchronization 20260925120526; private-photo bucket/download authorization 20260925132728 (empty bucket, six postconditions and eight preservation groups verified). Each release has its own reviewed source, hosted metadata/postcondition receipt and preservation evidence in the paired Ante repository. Local source and SQL-role tests do not substitute for website server-key/real-JWT acceptance.

### Next work

1. Implement private profile photos using the [selected minimal contract](superpowers/audits/2026-09-25-private-avatar-contract.md): private canonical object, server-only validated mutations and authenticated owner/current-friend reads. No public/signed links or silent changes to legacy avatar_url/mobile consumers. The empty private bucket and SQL download policy are deployed. Actual isolated Storage HTTP acceptance now passes through `1f0565f`, including owner/friend bytes, denied signing/listing/mutations and revocation controls. Server-only image validation is implemented through5c16b8f with14 focused tests, lint/typecheck and actual local Worker checks after review fixes; the preceding full suite passed170 tests. Task and final independent reviews accepted the dormant local slice; production resource and hosted acceptance are not complete. The fixed-key provider adapter is accepted through `b8d5b2c`, with exact real Storage HTTP protocol coverage in paired backend `83affa4`. Closed-by-default photo endpoints are implemented through `ee2478e`, with Auth error-classification fixes in `32d39bc`. Task and whole-plan independent reviews are accepted; see [final review](superpowers/audits/2026-09-26-private-photo-endpoints-review.md). The initial 201 website tests and synthetic Worker build passed; after the fix, 18 focused route tests, typecheck and lint passed. Target-plan CPU/peak-memory acceptance and hosted Storage/CDN/JWKS acceptance remain incomplete; local transform RLS is untested because that route was disabled.
2. Continue authoritative task/private-proof integration when its shared contracts are independently accepted. A 26 September hosted metadata check confirms `create_zero_stake_friend_task_v1`, `update_zero_stake_friend_task_v1`, `archive_zero_stake_friend_task_v1` and `restore_zero_stake_friend_task_v1` are absent. Legacy proof submission/response functions exist, but do not establish acceptance of the planned authority contract; do not bypass that gap through legacy table writes or disturb retained recovery fixtures.
3. Prepare Stripe sandbox card setup only under an approved consent and customer-ownership contract. Settlement, reviewer-silence charging and live money remain closed.

### Hosted and configuration gates

- Shared project is confirmed. Verify actual website server-key PostgREST access and real JWT ownership/session flows; database SET ROLE evidence is a different layer.
- Target antedotal.com in Havish's Cloudflare account. Direct Pages project/domain and Workers reads worked; account-level Pages listing and Workers-subdomain reads failed. Upload credentials and direct staging ingress remain unverified. A26September read-only account subscription lookup returned Cloudflare10000 Authentication error; the Workers plan is still unknown, and the user has been asked whether it is Free or Paid. No billing or deployment changed. Keep the Pages site live while preparing Workers.
- Verify OTP/Change-email templates, SMTP, secure two-inbox settings, fresh Auth pending-email exposure, Google/email same-account behavior and browser/Worker cookies. No real recipient is authorized until Workspace setup. Local preparation has sent no emails.
- OpenNext reports experimental Node middleware support; hosted runtime acceptance remains required before release.

## Confirmed decisions

All three profile edits (name, email, avatar); shared Supabase; user-selected A$1 minimum/A$50 maximum presets; owner/friend-only photos; email sign-in and editing use OTP; no UI/mobile implementation in this goal. Canonical names live in profiles, not mutable OAuth metadata; mobile self-name readers remain a separate compatibility dependency. Email signup matches existing Google signup. No paid image infrastructure or live-money activation has been selected.

### Current bounded slice

Private photo validator source and fixes:9660a22 and5c16b8f. The independent reviewer found and the implementer corrected incomplete-entropy JPEG acceptance/raw decoder warnings, early upload-body cancellation, the raw codec server-only boundary and legal empty PNG IDAT handling. The local runner now excludes inherited private environment and refuses local dotenv files. Task review and final independent review accepted the local-only slice through8cc748e;2055b02 clarifies the pre-fix test evidence. See [validator evidence](superpowers/audits/2026-09-26-profile-photo-validator-local-acceptance.md) and [endpoint preparation](superpowers/audits/2026-09-26-private-photo-endpoint-preparation.md). The subsequent endpoint slice is implemented through `32d39bc`, with task and whole-plan reviews accepted; see [route evidence](superpowers/audits/2026-09-26-private-photo-route-local-acceptance.md). Product serving remains closed via the unset `ANTE_PROFILE_PHOTOS_MODE` gate, and no hosted photo was created.

### Next verification slice

Read-only resource design identified that body buffering and PNG inflation occur before the codec concurrency guard. Current tiny/wide image checks cannot establish whole-pipeline resource safety. The [resource acceptance design](superpowers/audits/2026-09-26-private-photo-resource-acceptance-design.md) specifies maximum-area/byte-boundary fixtures, observed same-isolate overlap and separate local profiling. Start with the existing runner and deterministic maximum-boundary corpus; keep profiling labels honest (wall time is not CPU, snapshots are not peak isolate memory). A potential whole-validator admission change requires its own behavior tests and review, not an incidental diagnostic edit. Local measurement can proceed while the server-key file path and Cloudflare Workers plan remain unanswered; neither hosted activation nor a paid plan is authorized by this next step.

Previous goal turn completed reviewed endpoint source and durable receipts. This continuation added resource evidence and clarified the next unblocked verification task; it did not claim hosted acceptance. A fresh key-name-only check still found no configured named server key in expected project environment files.

### Maximum-boundary verification progress

Local Worker boundary screening passed 16 exact outcomes in `9352e51`: maximum-area RGBA8/RGBA16 PNG and baseline/progressive JPEG, exact 2 MiB PNG, over-cap rejection, late malformed-filter rejection and recovery. The [receipt](superpowers/audits/2026-09-26-photo-boundary-worker-results.md) records deterministic hashes and wall observations. Diagnostic lifecycle fixes in `a656a18` passed 11 focused tests, typecheck and lint and independent task re-review. The [whole-plan review](superpowers/audits/2026-09-26-photo-boundary-worker-review.md) accepted the diagnostic slice without blocking findings. The Worker image run precedes those lifecycle-only fixes and was not repeated. No production photo implementation changed. CPU profiling, reliable same-isolate concurrent-load evidence, memory bounds and hosted acceptance remain incomplete.

### Shared photo processing admission

Source hardening in `6b6a418` places raw validation, GET download through response construction, and PUT validation through Storage acknowledgement under one fail-fast processing slot per module instance. The public validator preserves cheap input errors; overloaded eligible work returns the existing private 503 without queued image buffers. DELETE and pre-capacity Auth/ownership checks retain their behavior. All 223 tests, typecheck, lint and the synthetic Worker build passed at implementation. Recovery-test additions in `3c225bb` passed 43 focused tests, typecheck and lint; task and [whole-plan review](superpowers/audits/2026-09-26-photo-processing-scope-review.md) are accepted without remaining findings. See [acceptance](superpowers/audits/2026-09-26-photo-processing-scope-acceptance.md).

This changes admitted application concurrency, not total memory: response/runtime-retained bytes, prefetched bodies, canceled host work and multiple isolates remain outside that bound. Actual bundled same-isolate overlap, CPU profiling and memory acceptance remain the next local/runtime evidence gaps. Photo mode stays unset.

### Actual local Worker overlap evidence

`208a6af` adds a bounded overlap probe using the real processing scope and raw validator across distinct temporary route modules. The actual local Worker reported one matching isolate identity; both controlled rounds rejected raw/scoped contenders with decoder_unavailable503, zero raw body pulls and one cancellation invocation. Maximum-area PNG/JPEG recovered after normal holder completion and synthetic callback failure. The final clean build and listener cleanup passed. Twelve focused tests, typecheck and targeted lint passed. Task and [final review](superpowers/audits/2026-09-26-photo-worker-overlap-review.md) accepted with no blocking findings. See [runtime receipt](superpowers/audits/2026-09-26-photo-worker-overlap-results.md).

This narrows the local bundle-sharing gap for diagnostic/raw paths only. Full authenticated production route overlap, hosted behaviour, CPU and total memory remain unverified. Cancellation in the Worker probe resolves synchronously; stalled-cancellation safety is covered separately by source tests, not this runtime experiment.

### Profiling and remaining critical path

Two bounded local profiling attempts and one no-build inspector comparison produced no photo CPU samples. The header-capable installed WebSocket client connected, but application execution-context identification remained unresolved; the driver stopped before photo POSTs rather than attribute a profile to the wrong context. Both attempts removed their temporary source, rebuilt clean artifacts and closed owned listeners. See [inconclusive profiling receipt](superpowers/audits/2026-09-26-photo-cpu-profiling-attempt.md). No memory or hosted limit inference follows.

The goal is not complete. Next critical dependencies remain the server-key file location, target Workers plan/configuration and hosted acceptance, authoritative task RPC readiness, and approved Stripe consent/customer-ownership contracts. Existing nonblocking test follow-ups are not substitutes for those dependencies. Further profiling must retain exact CDP context/error evidence and choose the actual application target; do not repeat the unsuccessful driver unchanged.

### Stripe readiness recheck

On 26 September the connected Stripe documentation tool returned UNAUTHORIZED / requires reauthentication; no account or payment-object operation occurred. Public [Stripe SetupIntents guidance](https://docs.stripe.com/payments/setup-intents) confirms setup creates no charge, and off-session use requires express permission with frequency and amount-determination terms. Therefore successful card storage cannot be treated as Ante charge authorization. Existing workstream requirements for versioned consent and server-owned customer references remain unimplemented contract dependencies; no on-session-only substitute or guessed mandate was selected. Reconnect Stripe for later sandbox verification after the contract is approved.

### CPU characterization update

A context-aware follow-up successfully profiled five maximum-area RGBA16 PNG validations in the actual local Worker. All returned200. The 511.114 ms profile window contains324.295 ms active sampled attribution,33.638 ms GC,149.325 ms idle and3.856 ms not represented by sample deltas. This is a batch-window sample on one machine, not per-request CPU. The updated [receipt](superpowers/audits/2026-09-26-photo-cpu-profiling-attempt.md), retained raw artifacts and [independent evidence review](superpowers/audits/2026-09-26-photo-cpu-evidence-review.md) replace the prior inconclusive-only status.

Execution-context selection is now demonstrated for this local target. Broader inputs/JPEG/full authenticated routes, peak memory and hosted target-plan CPU acceptance remain open. No further implementation or activation follows automatically from a local profile.
