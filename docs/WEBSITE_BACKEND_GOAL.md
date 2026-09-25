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

Local authentication preparation is implemented and independently reviewed: durable callback admission, Workers build/runtime refusal checks, and email one-time-code request/verification endpoints. The subsequent preset API at `b9128cd` passes 77 tests, typecheck, lint and both production builds; independent review is in progress. Review identified implicit HEAD handling and default method-response cache headers for correction before acceptance. Local website checks do not establish hosted provider or authenticated browser acceptance.

Next steps:

- Shared Supabase is confirmed. The limiter migration and cleanup scheduler are deployed and checked; verify the website server-key connection before enabling hosted routes.
- Target antedotal.com in Havish's Cloudflare account. Plugin Workers/domain reads and direct ante-website Pages project reads work; account-level Pages listing and Workers-subdomain reads still fail. Confirm staging ingress and upload credentials before hosted verification; current Pages remains live.
- Verify OTP templates, SMTP, same-account Google/email linking and successful provider session cookies. A recipient must be authorized before sending test codes.
- Implement all three profile edits: display name, email and avatar. Avatars must be owner/friend-only. Presets are user-selected A$1..A$50 per task. Shared preset SQL/RPC implementation passed independent review and was deployed as 20260925101013; the website route is undergoing review. Narrow profile permissions were deployed as 20260925101749, preserving existing rows and policies while removing direct sensitive-field writes. A separate friendship grant correction is being implemented before private avatars: the current owner INSERT policy permits direct accepted-pair creation. Source audit found mobile self-display uses auth metadata while friend-facing names prefer profiles.full_name; preserve canonical profile edits from OAuth overwrites and document the mobile consumer dependency.
- Continue account/preset, authoritative task/private-proof and consent/customer-ownership work in the goal order. Financial settlement and reviewer-silence charging remain closed.

Email account creation is enabled in the backend contract, matching Google signup; if invitation-only signup is desired, revise this before enabling the routes. No UI, real-email delivery, hosted mutation or deployment was part of this email slice.

## Confirmed decisions and hosted progress

User confirmed all profile fields (name, email, avatar), user-selected presets from A$1 to A$50, shared Supabase, and private avatars visible only to owner/friends. Defer real email delivery tests until Google Workspace is ready; no test recipient is authorized yet. Existing site is antedotal.com in Havish's Cloudflare account.

Limiter deployed to shared Supabase as migration 20260925095113. All ten permission postconditions passed. Live public API rejects anonymous calls; actual database service role admitted five requests and denied the sixth. The once-per-minute cleanup job ran successfully and removed expired synthetic entries. Both deployed function bodies match reviewed source hashes. Actual website service-key-to-PostgREST acceptance still remains; SQL SET ROLE evidence does not replace it.
