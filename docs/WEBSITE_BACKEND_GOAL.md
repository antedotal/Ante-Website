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

Local authentication preparation is implemented and independently reviewed: durable callback admission, Workers build/runtime refusal checks, and email one-time-code request/verification endpoints. Website implementation head `30aef8b` passes 68 tests, typecheck, lint and both production builds. Shared SQL implementation is in the Ante backend repository through `9c373b4`; its separate PostgreSQL integration test passes. Neither is a hosted release claim.

Next steps:

- Confirm the shared Supabase limiter store, then satisfy its hosted migration, permissions, API and cleanup scheduler gates.
- Authenticate Cloudflare and confirm staging domain/ingress before hosted verification; current Pages remains live.
- Verify OTP templates, SMTP, same-account Google/email linking and successful provider session cookies. A recipient must be authorized before sending test codes.
- Resolve initial profile editing scope and AUD preset bounds. Source audit found mobile self-display uses auth metadata while friend-facing names prefer profiles.full_name; agree on synchronization before adding website edits. Shared preset schema/RPCs are not implemented yet. Details are recorded in the Ante backend audit `docs/superpowers/audits/2026-09-25-website-account-contract-readiness.md`.
- Continue account/preset, authoritative task/private-proof and consent/customer-ownership work in the goal order. Financial settlement and reviewer-silence charging remain closed.

Email account creation is enabled in the backend contract, matching Google signup; if invitation-only signup is desired, revise this before enabling the routes. No UI, real-email delivery, hosted mutation or deployment was part of this email slice.
