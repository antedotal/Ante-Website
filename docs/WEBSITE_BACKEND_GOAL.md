# Website backend goal

Updated 27 September 2026. Requested scope: Ante-Website backend only.

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

## Current handoff — 27 September 2026

### Latest: complete mediated photo reader accepted locally

Website source through `4df7141` and documentation `ee15081` complete the three-task mediated reader plan. Independent task reviews and a fresh whole-plan review approved. Final verification: **347 tests**, typecheck/scoped lint and the final-source Worker build passed. The unchanged historical local harness previously passed51/51. [Acceptance, exact test scope and open gates](superpowers/audits/2026-09-27-profile-photo-mediated-website-acceptance.md).

The paired backend manifest/direct-read-denial source is independently accepted through `de50586`, with6 focused package tests and15+14 adjacent checks. Its canonical preflight passed a read-only hosted applicability check, but the package remains **undeployed**. [Database acceptance](../../Ante/docs/superpowers/audits/2026-09-27-profile-photo-mediated-database-acceptance.md).

The [phase-one HTTP harness](superpowers/audits/2026-09-27-mediated-hosted-phase-one-source-acceptance.md) is implemented through `6251eae`. All five task reviews approve, including the durable 324-row response-evidence fix; fresh whole-package review found one additional uncertainty/cookie cleanup gap, now fixed and independently re-reviewed. Source acceptance is complete. Final affected local acceptance is **170/170**; unchanged application verification is **366/366**, with typecheck, scoped lint, ordinary Worker build and separate preparation dry-run passing. The shipped ordinary bundle excludes preparation code/operator names; non-deployed cache findings are documented in the audit. The runner preserves historical failed cache receipts, exact fixture ownership and 22 protected-table fingerprints. Its conservative ceiling is 1,184 run reservations plus 29 cleanup, not observed hosted traffic. No runner or preparation artifact has been deployed or run against providers. Phase traces/races, browser behavior, resource acceptance and caller/target deletion remain separate unaccepted gates even if phase-one HTTP later passes.

Wrangler4.139.0 again returned `loggedIn:false` on27September. The Cloudflare connector confirms the correct active zone and Pages project but still rejects the reviewed diagnostic Worker upload; post-attempt inventory is empty and no fixtures were sent. [Current access evidence](superpowers/audits/2026-09-27-cloudflare-images-probe-status.md#evening-access-refresh). The existing intended-account login request remains pending. The website photo mode remains unset, current Pages site unchanged, financial/retention containment preserved, and the full goal remains active and incomplete. Upload normalization/HEIC and cleanup are separate unfinished requirements.

The sections below retain historical evidence; the latest status above and the cache-transition failure below supersede earlier next-step statements. In particular the server-key location, Workers Free selection and Stripe reconnection were resolved later in the history; they are not current missing decisions.

### Latest task prerequisite: hosted-compatible guards accepted locally

The 27 September metadata refresh confirms that the four authority mutation RPCs remain absent, while current retention containment already denies service-role TRUNCATE on task/proof/review tables. The old authority file cannot be replayed: it targets an obsolete vote signature, restores destructive purge code and grants mutations immediately. The paired backend captured current metadata without reading application rows (`810aa27`) and implemented the six-routine compatibility candidate at `5bea623`. Task and fresh whole-package reviews approve with no findings. **14/14 focused PostgreSQL tests pass**, including five real lock races, with legacy behavior, enrollment exclusion and atomic rollback checked. [Durable acceptance, review and logs](../../Ante/docs/superpowers/audits/2026-09-27-task-authority-hosted-compatibility-acceptance.md). This is a local candidate, not a deployable migration or activation of website task/proof routes. Full authority, proof lifecycle and legacy cutover remain separate dependencies.

### Generation-aware profile readers — source and disposable acceptance

Latest: gateway compatibility is deployed as `20260927054952`; all eight final-state checks pass, all 22 table fingerprints are unchanged, and exactly one policy changed. Backend `a6ad9d1` and runner `34795a6` passed independent reviews. The hosted retry passed Auth and initial owner/friend downloads, then returned cached legacy bytes after G1 publication. Cleanup removed all fixtures and preserved the baseline. [Rollout evidence](../../Ante/docs/superpowers/audits/2026-09-27-profile-reader-gateway-rollout.md) and [failed cache-transition receipt](../../Ante/docs/superpowers/audits/2026-09-27-profile-reader-cache-attempt.md) are retained. Resolve this cache boundary before claiming hosted privacy acceptance or enabling photo serving; no blind retry or weakened assertion.

First hosted reader attempt: reviewed runner `6950758` passed read-only preflight and all three real Auth checks, then failed the legacy owner download. Cleanup removed every fixture and preserved all 22 table fingerprints and the catalog. Hosted Storage 1.77.5 checks `object.get_authenticated_info`, which the current download-only policy excludes. The [failed receipt and exact next step](../../Ante/docs/superpowers/audits/2026-09-27-profile-reader-hosted-attempt.md) are retained; an additive operation-policy compatibility correction is being designed before any retry. This is not hosted privacy acceptance. Website gates remain unset.

Hosted follow-through: paired backend `28f7c31` and `e200965` corrected the owner-role and retention-policy fixture mismatches. Migration `20260927040130_profile_photo_readers` is now applied. All six postconditions pass; all 22 table fingerprints and every catalog entry except the three expected reader functions are unchanged. The new authenticated-definer advisor notice is intentional and documented. See [SQL rollout evidence](../../Ante/docs/superpowers/audits/2026-09-27-profile-reader-rollout.md). Real-user Data API/Storage privacy tests are being prepared; they have not run, and website gates remain unset.

Backend `9b3d93a`/`1e6dde1` and website `7878848`/`523635e` now resolve the current private avatar with the exact verified caller JWT, then download with that same token. Owners and accepted friends can resolve only the current completed generation. Revision-zero reservations retain the legacy avatar; replacement or clear permanently removes legacy fallback. Pending and replaced keys remain unreadable. The new `generation-read-v1` mode permits only GET; `private-v1` is retired and PUT/DELETE remain closed. No deployment mode was set.

Independent task and final integrated reviews approved. Verification:22 focused backend SQL/real Storage tests,237 website Vitest tests,24 local Node acceptance tests, scoped/backend and website type/lint checks. The canonical test-runner mismatch was corrected: `pnpm test` runs Vitest; `pnpm test:acceptance:local` runs the Node acceptance files. See [reader acceptance](../../Ante/docs/superpowers/audits/2026-09-27-profile-photo-readers-source-acceptance.md).

Next reader release work: genuine caller-token Data API/Storage privacy/race acceptance using the reviewed bounded runner. The guarded SQL rollout and preservation checks are complete as recorded above. Applying SQL changes direct Storage authorization even while the website gate is closed. Rollback closes reads; never restore the old avatar policy after a committed revision. HEIC/runtime acceptance, upload publication orchestration and safe cleanup remain separate prerequisites; keep photo serving gated. The broader backend goal remains active.

### Completion audit — current evidence, not a completion claim

27 September follow-through: paired backend types now include the seven deployed photo RPCs (`16c6980`); compiler scope corrected (`fe0b2f8`) with app and separate Deno checks passing. The reviewed [hosted account JWT acceptance](superpowers/audits/2026-09-27-hosted-account-jwt-acceptance.md) now passes all 33 checks: two genuine sessions, independent names/presets, ownership denials, missing-profile and revoked-refresh behavior. Both fixtures were removed and 22 table fingerprints preserved. An initial harness status mismatch was corrected and its failed receipt retained. Cloudflare login remains needed for the image probe.

27 September independent photo progress: paired backend `d14e297` plus reviewed fix `871076c` adds create-only immutable profile Storage transport and complete exact-key MIME/size/hash readback. The amended 15 focused tests and Deno check/lint/format pass; task and final review approve source integration. That source slice activated no processor, publication flow, reader, cleanup job or route. See [source acceptance](../../Ante/docs/superpowers/audits/2026-09-27-profile-photo-storage-adapter-source-acceptance.md). The subsequent [hosted transport acceptance](../../Ante/docs/superpowers/audits/2026-09-27-profile-storage-http-acceptance.md) passes all four same-key cases through the modern server key, with exact fixture cleanup and all 22 tracked table fingerprints/catalog unchanged. Next coordinate the accepted normalizer, fenced metadata orchestration and generation-aware readers.

27 September: the Cloudflare image probe is implemented and reviewed, but connector upload was denied and local Wrangler is unauthenticated. No Worker exists and no hosted fixture ran. [Current probe status and resume steps](superpowers/audits/2026-09-27-cloudflare-images-probe-status.md).

Current status: server-key access works, Workers Free is confirmed, and Stripe sandbox discovery works. Photo retention containment is deployed. The current hosted image codec failed the HEIC CPU test; replacement processing, immutable photo integration and cleanup remain unfinished. Earlier dated entries below are historical evidence, not a list of current blockers.

| Goal requirement | Current evidence | Remaining requirement |
| --- | --- | --- |
| Shared Auth and durable visitor admission | Reviewed source and deployed SQL; actual opaque-server-key HTTP limits verified (5/6 and 60/61 admitted; anonymous calls denied) | Ingress and browser/Worker acceptance; direct hosted JWT checks now pass |
| Profile, AUD presets, email editing | Source routes and local review accepted; shared prerequisite SQL deployed | Name/preset hosted ownership/JWT checks pass; SMTP/two-inbox configuration and authorized recipients remain |
| Private photos | Retention containment/profile metadata authority deployed; immutable Storage transport separately accepted; complete mediated reader source reviewed with347 website tests; hosted HEIC failed CPU limit | Accepted normalizer, publication orchestration, mediated SQL cutover and hosted session/cache/resource acceptance, safe cleanup |
| Task/private-proof contracts | Fresh 26 September public function-catalog query returned no four planned task-authority RPCs | Authoritative backend contracts must be ready; no legacy-write fallback |
| Stripe sandbox setup | Workstream mandates versioned consent/server-owned customer IDs; current goal conditions setup on approved contracts | Approved consent/customer-ownership implementation contract; no settlement or live money |
| Reviewable commits/handoff | Current isolated branch commits and acceptance receipts | Entire objective is not achieved; no deployment or whole-project completion claimed |

The user has supplied a server key in the main app and website `.env.local` files, confirmed Workers Free, and reconnected Stripe. Server-key gateway and limiter checks pass. Separate real-user JWT name/preset ownership checks now pass; hosted website acceptance remains open. The current route inventory has no task/proof or card-setup routes, consistent with the explicit dependency gates above.


The goal remains active and incomplete. Shared photo authority work is progressing; external prerequisites still gate full acceptance. Work is committed on the existing website `codex/shared-web-account` and shared backend `codex/web-first-foundation` branches. Main checkouts and the current antedotal.com Pages site remain untouched.

### Accepted locally

- Google callback, email OTP sign-in, private request/session boundaries and durable callback/account admission.
- A$1..A$50 independent Easy/Medium/Hard preset GET/PUT, and canonical name GET/PATCH. See [account acceptance](superpowers/audits/2026-09-25-account-api-acceptance.md).
- Authenticated email-change request/confirm endpoints, isolated cookie stages, per-user/action admission and exact SDK 2.106.0. Both task reviews and final review are accepted through `a58c993`; 135 website tests, typecheck, lint, Next and Worker builds pass. See [email-change acceptance](superpowers/audits/2026-09-25-email-change-api-acceptance.md). The operator activation gate remains unset.

- Shared server Auth transport is independently reviewed through `b2b1083`: safe SDK errors across callback/server/proxy/isolated clients, preserved RPC/Storage behavior and revoked-session cookie cleanup. 159 tests, typecheck, lint and Next/Worker builds pass. See [Auth transport acceptance](superpowers/audits/2026-09-25-shared-auth-transport-acceptance.md).

### Deployed shared prerequisites

Callback limiter 20260925095113; account visitor limiter 20260925111932; preset contracts 20260925101013; narrow profile write permissions 20260925101749; friendship mutation protection 20260925103930; canonical profile names 20260925105731; confirmed-email synchronization 20260925120526; private-photo bucket/download authorization 20260925132728 (empty bucket, six postconditions and eight preservation groups verified). Each release has its own reviewed source, hosted metadata/postcondition receipt and preservation evidence in the paired Ante repository. Local source and SQL-role tests do not substitute for website server-key/real-JWT acceptance.

### Next work

1. Immutable profile-asset authority is deployed and verified (see receipt below). Evaluate a HEIC-capable normalization runtime using the retained failing fixture. The new [shared photo contract](../../Ante/docs/superpowers/audits/2026-09-26-shared-photo-upload-contract.md) supersedes the old fixed-object photo implementation as the target. Wire immutable uploads, exact readback, authorized readers and race-safe cleanup only after their respective acceptance gates. Current photo routes remain disabled.
2. Continue authoritative task/private-proof integration when its shared contracts are independently accepted. A 26 September hosted metadata check confirms `create_zero_stake_friend_task_v1`, `update_zero_stake_friend_task_v1`, `archive_zero_stake_friend_task_v1` and `restore_zero_stake_friend_task_v1` are absent. Legacy proof submission/response functions exist, but do not establish acceptance of the planned authority contract; do not bypass that gap through legacy table writes or disturb retained recovery fixtures.
3. Prepare Stripe sandbox card setup only under an approved consent and customer-ownership contract. Settlement, reviewer-silence charging and live money remain closed.

### Hosted and configuration gates

- Shared project and server-key PostgREST access are verified. Direct hosted JWT name/preset ownership, missing-profile denial and revoked-refresh rejection are verified by the 27 September receipt. Deployed website ingress, browser cookies, OTP and Google remain unverified; database SET ROLE evidence is a different layer.
- Target antedotal.com in Havish's Cloudflare account on Workers Free. Isolated connector calls now verify an empty Workers list and subdomain `walihavish`. Upload and staging ingress remain unverified; the Images usage API returned5403 (account/service access unavailable). That does not establish Images binding entitlement. See [candidate audit](superpowers/audits/2026-09-26-cloudflare-images-candidate.md). Keep the Pages site live; no paid upgrade selected.
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

### External dependency stop — 26 September 2026

The final recheck found a clean website worktree at `6cef4f2`, no named server key in expected app/website environment files, none of the four planned hosted task-authority RPCs, and Stripe still requiring reauthentication. All dispatched agents are terminal; no build or profiling job is being abandoned. The preceding turn made progress by retaining reviewed CPU evidence. The same missing configuration and contract dependencies have persisted across more than three consecutive goal continuations; the remaining goal cannot be completed by additional local test variants.

Resume with the server-key file path (never paste the key), target Workers plan/configuration, and Stripe reconnection. Hosted account/photo verification additionally needs actual runtime ingress/cookie/resource acceptance. Task/proof work waits for accepted shared authority contracts; sandbox card setup waits for approved consent and customer-ownership contracts. Profiling/resource limitations remain open, not passed. Do not reinterpret this stop as completion, erase the dependency gates, activate photos/email changes/payments, or disturb retained recovery fixtures. Branch/worktree and all reviewable commits are preserved.


### Configuration and photo policy update — 26 September 2026

The goal tool was freshly checked as **active** after the prior external-dependency stop. Continue the existing worktrees; the stop above is historical, not the current execution status.

- Server credential is present under `EXPO_PRIVATE_SUPABASE_SECRET_KEY` in the main app/website `.env.local`. Website runtime expects `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`); map the value only in a server process/deployment secret. No credential value is recorded or copied to client/build configuration.
- Hosted opaque-key requests successfully reached the profiles REST endpoint (zero-row limit) and private profile bucket metadata. Concurrent HTTP checks admitted exactly 5 of 6 callback requests and 60 of 61 account requests; anonymous requests returned 401. Synthetic limiter entries use the existing expiry cleanup. See the retained [HTTP receipt](superpowers/audits/evidence/2026-09-26-hosted-limiter-server-key.json). This is gateway/RPC evidence, not browser, JWT/RLS or deployed website evidence.
- Workers Free is the confirmed target. Stripe account discovery now succeeds and lists the `ante-test` sandbox; no payment object was created. Consent/customer ownership, real user acceptance and deployment gates remain open.
- Both proof and profile photos must be compressed to orientation-aware 1080p, preserving aspect ratio without cropping or enlarging. Keep only compressed bytes after verified storage success. The currently gated validator still returns original bytes and does not satisfy this new requirement.
- Delete nonfinancial proof photos seven days after authoritative final resolution. Protect pending reviews, resubmissions, unresolved disputes, financial evidence and unknown legacy classifications. Active avatars remain; profile cleanup concerns replaced/deleted assets.

The deployed metadata audit found a broad owner proof-image DELETE allowance and a task purge running every 30 seconds based only on archive age, with cascades into proof records/payment holds. Closing those paths is the first retention prerequisite. See [deployed audit](superpowers/audits/2026-09-26-photo-retention-deployed-audit.md).

The [photo lifecycle requirements and preflight](superpowers/audits/2026-09-26-photo-compression-retention-requirements.md) records the newly approved requirements, implementation conflicts and next bounded work. No photo normalization, retention migration, scheduled cleanup, image deletion or photo activation has been performed for this new slice.


### First deployed retention containment — 26 September 2026

The paired backend branch now contains reviewed source `b0cd235` and release evidence `08504e5`. The unsafe `purge-deleted-tasks` Edge handler is deployed as version5 with JWT verification preserved, returning a closed response before dependency access. Retrieved runtime files match reviewed source; live missing/anonymous bearer, unsupported-method and OPTIONS checks pass. Seven focused local tests and Edge typecheck passed, followed by independent task and final reviews. A trusted service POST has not been exercised because the available local opaque secret does not satisfy the existing legacy service-bearer contract. No authentication weakening, payment transition or image deletion was performed.

This closes only the reviewed Edge purge implementation. The every-30-second SQL task purge, broad client proof-image DELETE/UPDATE permissions and direct task/hold deletion/truncation remain the next containment work. Use `docs/superpowers/audits/2026-09-26-photo-retention-containment-design.md` and `docs/superpowers/audits/evidence/2026-09-26-retention-catalog-before.json` in the paired Ante worktree to implement a standalone, tested migration. Do not claim all proof retention is protected or seven-day cleanup is implemented. Normalization, immutable asset identity, protected final-resolution/hold state and generation-safe avatar cleanup still follow.


### Database preservation deployed — 26 September 2026

The paired backend release is now applied as `20260926023351_photo_retention_containment` (source `69e0c8c`, stronger role tests `61d1489`, hosted receipt `7dde9a5`). Independent task and final review approved. All nine hosted postconditions passed; row fingerprints, unrelated functions, non-destructive policies/grants, buckets and cron metadata were unchanged. Real server-key SQL purge RPC returned204 with unchanged data, and anonymous invocation returned401. This is separate from the still-unexercised trusted-service Edge POST.

The legacy SQL purge is a no-op. Task/payment-hold hard deletion, protected-table truncation, and client proof-object deletion/overwrite are held. Existing reads/new-object uploads and soft archive remain. No scheduled job was rescheduled, no image or financial row was deleted, and live-money endpoints remain paused. Some account hard-deletion flows are temporarily blocked.

Next required photo work: immutable proof/asset history and protected final-resolution/dispute/financial holds; generation-safe avatar replacement; server-normalized orientation-aware1080p compressed-only storage; bounded exact-key cleanup after seven days for definitively resolved nonfinancial proof. Current review/proof projections remain mutable and service-role Storage bypass still exists. The blanket hold is a precursor, not final retention or compression acceptance. Continue shared schema work in the paired Ante repository, and keep website photo activation closed pending the new contract and hosted acceptance.


### Photo policy and normalization research — 26 September 2026

Confirmed: JPEG ordinary photos, PNG for transparency, still photos only with normal HEIC auxiliary depth/thumbnail items accepted. Delete replaced/deleted profile generations as soon as safely unreferenced; current avatars never expire by age. Orientation-aware 1080p, compressed-only storage and seven days after final resolution for nonfinancial proof remain the targets.

Paired backend research is retained in `docs/superpowers/audits/2026-09-26-photo-normalizer-candidate.md` and `2026-09-26-shared-photo-upload-contract.md`. Synthetic local JPEG/PNG/HEIC processing succeeded; local HEIC process RSS exceeded 256 MiB, which requires a hosted measurement and does not prove hosted failure. Runtime selection and the full input envelope remain unaccepted. Supabase CLI 2.118.0 authentication now lists the expected Ante project; the temporary synthetic-image hosted probe is the next verification step.

Next bounded slice: finalize and test the normalizer plus immutable profile-generation reservation/publication contract, using readback verification, retry reconciliation and revision checks. Profile cleanup must serialize with publication. Keep current photo routes closed, preserve deployed containment, and do not wire proof publication through the legacy task path. No image processor, cleanup schedule or new photo route was deployed by this research.


### Hosted normalization result — 26 September 2026

The paired backend audit `docs/superpowers/audits/2026-09-26-photo-normalizer-hosted-probe.md` records actual hosted processing: synthetic JPEG/PNG passed, but the 6.36 MB HEIC fixture returned546 and provider logs identify CPUTime shutdown. Current magick-wasm configuration is not accepted for the full proof envelope; local success did not establish hosted suitability. JPEG handler wall time was1950ms; retained shutdown CPU telemetry is not uniquely correlated to requests, so per-request CPU headroom remains unproven. Do not activate photo routes, remove HEIC support, or retry CPU exhaustion as if transient.

The temporary function and operator secret were removed. Existing function bundle hashes/auth settings remain unchanged, though secret changes incremented their version counters. No database/Storage operations or user photos were involved. Next evaluate a faster codec/compute strategy against the failing fixture, while independently progressing immutable asset/profile authority. No paid service selected; containment remains active.


### Immutable profile metadata authority deployed — 26 September 2026

Paired backend implementation `f9a116c` and reviewed fix `c779275` are installed as `20260926034235_profile_photo_asset_authority`. Two private tables and seven service-only RPCs supply immutable generation identity, fenced leases, frozen manifests, revision checks and durable upload/delete receipts. Independent task/final review found and resolved one replay transaction guard;12 PostgreSQL tests passed. All12 hosted catalog checks passed; seven actual server-key requests correctly denied a nonexistent profile. Existing profile/task/payment/Storage fingerprints and grants matched; new tables remain empty.

See [backend acceptance](../../Ante/docs/superpowers/audits/2026-09-26-profile-photo-authority-acceptance.md). This does not enable photo processing, readers or cleanup. Next: accepted HEIC-capable runtime, immutable Storage/readback integration, coordinated readers and race-safe cleanup. Cloudflare Workers reads work, but Images stats returned5403; binding entitlement and upload permission remain unverified. The whole goal remains active; existing branches and worktrees are preserved.
