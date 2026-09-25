# Website backend goal

Updated 25 September 2026. Requested scope: Ante-Website backend only.

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

## Handoff status — 25 September 2026

Local authentication preparation is implemented and independently reviewed: durable callback admission, Workers build/runtime refusal checks, and email one-time-code request/verification endpoints. Preset API implementation `b9128cd` and review fix `8c839a3` passed independent specification/quality review, 79 tests, typecheck, lint, Next build and the final synthetic-config Worker build. Explicit private, bodyless 405 responses now cover unsupported methods, including HEAD; local built-server checks passed. Local website checks do not establish hosted provider or authenticated browser acceptance. OpenNext still warns that Node middleware support is experimental; hosted acceptance remains required.

Next steps:

- Shared Supabase is confirmed. The limiter migration and cleanup scheduler are deployed and checked; verify the website server-key connection before enabling hosted routes.
- Target antedotal.com in Havish's Cloudflare account. Plugin Workers/domain reads and direct ante-website Pages project reads work; account-level Pages listing and Workers-subdomain reads still fail. Confirm staging ingress and upload credentials before hosted verification; current Pages remains live.
- Verify OTP templates, SMTP, same-account Google/email linking and successful provider session cookies. A recipient must be authorized before sending test codes.
- Finish all three profile edits: display name, email and avatar. Avatars must be owner/friend-only. Presets are user-selected A$1..A$50 per task. Shared preset SQL/RPC implementation passed independent review and was deployed as 20260925101013; the website route is locally accepted through 8c839a3. Narrow profile permissions were deployed as 20260925101749, preserving existing rows and policies while removing direct sensitive-field writes. Friendship grant protection was reviewed and deployed as 20260925103930: all seven checks passed, preserving five existing relationships and invitation logic. Private avatar storage and email editing remain unimplemented. Canonical name GET/PATCH is implemented locally at 49b89c4, with independent review and corrections accepted through 91de31f. Source audit found mobile self-display uses auth metadata while friend-facing names prefer profiles.full_name; preserve canonical profile edits from OAuth overwrites and document the mobile consumer dependency.
- Continue account/preset, authoritative task/private-proof and consent/customer-ownership work in the goal order. Financial settlement and reviewer-silence charging remain closed.

Email account creation is enabled in the backend contract, matching Google signup; if invitation-only signup is desired, revise this before enabling the routes. No UI, real-email delivery, hosted mutation or deployment was part of this email slice.

## Confirmed decisions and hosted progress

User confirmed all profile fields (name, email, avatar), user-selected presets from A$1 to A$50, shared Supabase, and private avatars visible only to owner/friends. Defer real email delivery tests until Google Workspace is ready; no test recipient is authorized yet. Existing site is antedotal.com in Havish's Cloudflare account.

Limiter deployed to shared Supabase as migration 20260925095113. All ten permission postconditions passed. Live public API rejects anonymous calls; actual database service role admitted five requests and denied the sixth. The once-per-minute cleanup job ran successfully and removed expired synthetic entries. Both deployed function bodies match reviewed source hashes. Actual website service-key-to-PostgREST acceptance still remains; SQL SET ROLE evidence does not replace it.

## Account foundation progress

Canonical profile-name SQL was independently reviewed and deployed as `20260925105731_profile_name`: authenticated owner-derived reads/writes, validation, separate read/write quotas, and no direct name-column writes. Existing rows were preserved; anonymous calls were denied. Account visitor admission was reviewed and deployed as `20260925111932_website_account_limit`: 60 requests per minute before website session verification, with separate callback quota, concurrency checks and scheduled cleanup verified. Shared generated types now reflect these hosted contracts.

Website account visitor admission is independently accepted through `63cb48d`. Profile-name API `49b89c4` passed local tests, typecheck, lint, Next/Worker builds and local denial checks. Independent review correction `91de31f` now reads actual RPC HTTP429 status from the response envelope in profile and preset handlers; re-review approved it, with 102 website tests, typecheck and lint passing. The review also confirmed the shared session extraction preserved identity and cookie boundaries. These local checks do not establish hosted browser/JWT acceptance.

The bounded Supabase SDK update is independently accepted through 1bfc28a: exact2.106.0 and actual SDK response-parsing tests. The combined account milestone passed final review; see docs/superpowers/audits/2026-09-25-account-api-acceptance.md. Confirmed-email synchronization is reviewed and deployed as20260925120526, with13 hosted postconditions and19 preservation comparisons passing. Authenticated email-change endpoints are next; the contract/design audits record pending-address and isolated-cookie requirements. Hosted secure two-inbox configuration, pending-address binding and authorized real recipients remain acceptance gates. Do not reuse sign-in verification for account email changes. Private avatars remain a separate owner/friend Storage contract. The authority RPCs required for website task creation/edit/archive/restore are still absent from hosted Supabase; task/proof endpoints must not bypass that dependency.

The local authenticated email-change request/confirmation routes now implement the approved two-inbox OTP boundary with per-visitor and per-user/action durable admission, verified pending-address binding, fixed private responses and isolated cookie release. `docs/contracts/account-email-change.md` is the HTTP and operator contract. The server-only mode gate remains unset in Worker configuration. Hosted confirmations, Secure Email Change, exact OTP template delivery to two authorized inboxes, fresh `getUser().new_email`, browser/Worker cookie behavior and same-UUID identity still need external acceptance. No real recipient or deployment is authorized by this local implementation.
