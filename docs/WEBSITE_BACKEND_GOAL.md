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

Existing code supports Google sign-in only. The workstream also mentions email sign-in; its intended mechanism must be resolved before adding that flow. This does not block hardening the existing Google path.

## Acceptance and safeguards

- Use bounded subagent implementation, behavior-first tests and independent specification/quality review.
- Run relevant tests, type checks, ESLint and production build; update `.guidelines/design.md` for technical changes.
- Test limit concurrency, isolation, expiry, failure handling and request ordering, plus identity/authorization boundaries for each new endpoint.
- Reuse the same Supabase project as mobile; verify deployed behavior separately from local source checks.
- Preserve existing financial history, deployed paused financial endpoints and retained local database recovery evidence.
- Do not make UI changes, invent financial consent or describe undeployed work as live.

## Goal registration status

The app's create-goal tool rejected registration because this task still contains an unfinished paused cross-project goal. That old goal was not falsely marked complete. This document records the requested replacement scope; app-level replacement remains pending.
