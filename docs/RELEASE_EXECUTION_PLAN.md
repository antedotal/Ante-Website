# Ante release execution, 6 October 2026

## Authority and specification

Execute the remaining work in `docs/RELEASE_STATUS.md`. Daniel explicitly authorized production website routing/deployment and the nonfinancial Supabase cutover after checks pass. He has not selected an iPhone/build workflow; discover the available tools and choose an evidence-supported workflow. Financial settlement stays paused. The 6 October payment requirements in `docs/WEBSITE_BACKEND_GOAL.md` are current implementation scope: full web payments must be implemented and verified, while live financial activation remains separately gated.

## Global Constraints

- Only GPT-6.1 Sol subagents; no Astra and no worker-spawned subagents.
- Use isolated website branch `codex/release-readiness`; preserve the original dirty release/design documents and unrelated `hi.json`.
- App photo work belongs in `/Users/daniel/dev/ante/.worktrees/phone-prepared-proof-photos`; preserve its existing changes and predecessor integration.
- Read each repository's AGENTS.md and design guide. Comment added code with purpose/function/implementation, avoid duplicate logic, update relevant design documentation after implementation, and run ESLint after each implementation.
- Query Supabase MCP for live database facts and Context7 MCP for current technical documentation. Never print/store live credentials in tracked artifacts.
- Preserve private photo owner/friend authorization, conservative retention, prepared-only proof bytes and financial containment. Local tests, simulation and builds do not establish hosted or physical-device acceptance.
- Check prerequisites before dependent hosted changes. Closed authority installation revokes legacy writes, so it requires coordinated cutover and a compatible accepted client.
- Do not send Auth emails or create test users without resolving existing manual-acceptance ownership. No inbox access or financial/provider settlement actions.
- Every implementation gets independent spec/quality review from a diff package and fixes through the original implementer. Document results and unresolved external gates; do not claim completion until the release scope is achieved.

## Task 1: Repair website production origin and account readiness

Read `/private/tmp/ante-release-website-audit.md` first. Fresh apex `/account` and `/account/sign-in` return 404; www returns configuration-gate 503. Inspect actual Cloudflare routes, build/runtime public configuration and Supabase redirect allowlist before selecting canonical origin. Prefer the existing configured accepted origin; if none is established, use HTTPS apex `https://antedotal.com` and document the choice. Implement explicit apex/www routing and a fixed-origin alternate-host redirect before account processing where necessary. Redirect only recognized production alternate host; preserve path/query and avoid unsafe POST replay or affecting local/acceptance/preview hosts. Validate required public account variables in the build and runtime without dumping credential values. Keep photo/email-change serving gates unset and account navigation unlinked until authenticated acceptance.

Run meaningful focused config/origin/auth/session/admission/redirect checks, ESLint, typecheck and Worker build. Inspect generated public origin configuration. Independent review must approve source before deployment. Then perform the authorized hosting correction and verify active deployment/routes plus anonymous homepage/sign-in/account/API matrix on both hosts, private denial/no-store headers and direct Cloudflare ingress. Auth email/session/browser acceptance remains a separate gate if user interaction is required.

## Task 2: Finish phone-prepared proof source and native patch

Read `/private/tmp/ante-release-photo-audit.md` and the existing phone preparation plan. Fix the specific acquired-output ownership gap in `app/verification/camera.tsx`: a newly prepared descriptor must be disposed on every failure before adoption, including old preview deletion failure, and never be adopted by a retired callback. Add a focused failure test covering that path. Review the complete dirty phone preparation and pinned manipulator patch against orientation, 1080p no-upscale fit, metadata stripping, source/output ownership and prepared-only retry/recovery requirements. Fix concrete findings, preserving the user's Photos original.

Also resolve both additional integrity/ownership findings in `/private/tmp/ante-phone-native-patch-review.md`: dispatch the exact verified bounded prepared bytes (or verify their expected digest on the captured dispatch buffer), with a same-length valid-image replacement test; and never delete an existing prepared/cache path when exclusive creation fails, with a collision-preservation test. Update missing phone-preparation design documentation. Keep the separate Cloudflare trial source uncommitted until Task 4 source review. Root owns publication/rebasing onto the equivalent published foundation after reviewed source commits; workers must not push or recreate foundation history.

Run scoped JS/native-mock tests, real Swift ownership helper where supported, typecheck, ESLint and applicable full-codec/publication/composition checks. Update app design guide. Obtain independent review, then commit the existing completed photo work and publish integration/photo branches through the verified repository workflow without recreating the already published foundation.

## Task 3: Rebuild and accept the first iPhone binary

Determine local Xcode versus EAS from real available tooling/project credentials. Prefer per-process Xcode developer directory over a persistent system switch. Reconcile launch configuration to confirmed iPhone scope. Rebuild from the patched lockfile with native source compilation; record exact version/build and provenance. Run simulator/native checks where useful, but obtain physical iPhone acceptance for orientation/metadata/cleanup/cancellation and prepared-only unknown-operation recovery before declaring the minimum accepted iOS build. If device access requires Daniel, provide concrete build/test instructions while completing independent work.

## Task 4: Verify and accept production photo runtime

Inspect the existing capped synthetic Cloudflare trial specification and implementation in the app photo checkout. Verify actual paid account quota, CPU/memory/container resource/lifecycle bounds and stopping/cleanup rules. Run only the reviewed capped trial after prerequisites are established, preserving exact receipts and lifecycle observations. Select and deploy the serving photo runtime only after codec/resource/byte equality acceptance; fixture success alone is not a production serving deployment. Verify authenticated transport, private publication and real origin/configuration with bounded resource limits.

## Task 5: Install and activate coordinated nonfinancial backend

Read `/private/tmp/ante-release-backend-audit.md`. Recheck complete live catalog/preflight pins and current reviewed source hashes. Follow the literal closed-package dependency chain and its exact postconditions, never fixture SQL or an inferred replacement. Keep financial handlers and destructive cleanup paused. Install authority/ledger/owner/publication/retention/transport/runtime/frontdoor packages only when cutover prerequisites permit; install/deploy the gateway and accepted photo runtime. Verify real owner/frozen-friend/stranger denials, immutable exact-byte publication, recovery, rate limits and conservative retention. Set accepted iOS minimum build and photo origin, close legacy writers, then activate the complete task-proof contract together using the narrow reviewed release interface. Recheck catalog/advisors, deployed source, scheduler state and denial behavior.

## Task 6: Freeze the shared web payment contract

Use `/private/tmp/ante-web-payment-scope-audit.md` and the current website/backend goal. Define a versioned customer/card/consent/quote/commitment/job/webhook/subscription interface. Preserve shared Supabase authority, existing containment and immutable proof finality. Record required unresolved commercial/consent/hold/amendment/finality configuration explicitly; absent configuration denies enrollment or dispatch. Do not invent terms, prices, support powers, automatic reauthorization or charge authority from silence. Closed source preparation proceeds while Daniel answers the four material questions.

## Task 7: Shared payment ownership and consent

Implement additive server-owned customer reservation/receipts, card tombstones/default protection, versioned consent and owner-derived action-limited RPCs in the app/backend repository. Test concurrent customer creation, duplicate retries, foreign identities, unknown provider outcomes and revoke/remove/default races with commitments. Preserve deployed paused financial entrypoints and all existing history. No caller-supplied customer can become authority.

## Task 8: Website cards and consent

Implement authenticated card setup/list/default/remove UI and narrow private routes using Task 7. Reuse origin/session/cookies/bounded JSON/admission primitives. Card storage and accountability consent remain separate operations; embedded provider card collection must never handle raw card data in application server. Closed-by-default provider adapter plus exact user recovery states; actual browser/provider acceptance remains required.

## Task 9: Financial ledger and jobs

Implement additive immutable commitments/amendments, durable provider operation/job/event receipts, financial evidence protection and separate subscription entitlements. Stable idempotency, explicit unknown outcomes, leases, audit and reconciliation are necessary. Do not weaken the existing forfeit=0 classifier. Define integration points to authoritative proof resolution and unconfigured-policy refusal.

## Task 10: Atomic financial task admission and web settings

After task/proof predecessor and payment interfaces are accepted, add separately versioned authoritative financial task quote/admission. Consent, exact amount/currency/terms/method snapshot and cap reservation are transactional. Draft/payment_pending tasks activate only on the required definitive provider authorization. Website financial defaults/task confirmation/edit flows use the same authority; never direct legacy task/hold writes or retroactively fund existing tasks.

## Task 11: Short-task holds and recovery

Implement confirmed authorization timing/eligibility, manual-capture provider state handling, capture_before expiry, requires_action, failed/expired truthful backing and definitive-success release. No automatic reauthorization or pending-proof capture. Tests include duplicates, unknown authorization outcomes, cancellation races, expiry with pending review and web recovery.

## Task 12: Definitive settlement and long-task collection

Transactional authoritative finality plus durable jobs governs short-hold capture and long-task off-session failure collection. Enforce appeal/dispute protections and confirmed policy. Implement customer-action/decline/unknown recovery and unique 72-hour escalation receipts without silent forfeiture. Live dispatch remains paused until separate financial activation.

## Task 13: Webhooks, reconciliation, review and disputes

Verify raw Stripe webhook signatures, deduplicate/out-of-order events and condition results on exact operations; reconcile lost responses with stable keys and bounded backoff. Add owner history/recovery/dispute UI and append-only decisions, notices and safe evidence retention. No actual email/notice transmission without existing authorization. Provider status or browser return alone is not collection authority.

## Task 14: Separate web Premium billing

Implement monthly/annual checkout and management using configured product/Price policy and provider-verified entitlement lifecycle. Preserve paid-period cancellation, downgrade commitments, account identity and cap enforcement; no invented prices/trials/countries. Subscription and forfeiture ledgers stay distinct, with no unrelated native billing implementation.

## Task 15: Financial source, sandbox and hosted acceptance

Independently review the complete payment implementation and fault/concurrency tests. Verify actual isolated Stripe sandbox and hosted browser setup/removal/consent, holds/release/expiry/capture, long collection/customer action, duplicate/out-of-order events, lost outcomes, disputes and subscriptions. Confirm business/configuration/consent and live pause separately. Provider tests do not by themselves authorize real-money activation.

## Task 16: Final review and release status evidence

Keep `docs/RELEASE_STATUS.md` and both relevant design guides consistent with observed source/hosted facts. Separate historical audit from current progress and cite durable test/build/runtime/cutover evidence. Include exact published commits, deployment/build IDs, accepted client/runtime, completed acceptance, preserved financial pause and any unfinished external gate. Obtain final independent review of the complete change and evidence. The active goal is complete only when the required website payment implementation/verification and authorized nonfinancial release acceptance are actually complete; live settlement remains paused until its separately authorized activation gates pass.
