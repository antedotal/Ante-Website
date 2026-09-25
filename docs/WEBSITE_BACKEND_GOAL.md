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

## Current handoff — 25 September 2026

The goal remains active. Work is committed on the existing website `codex/shared-web-account` and shared backend `codex/web-first-foundation` branches. Main checkouts and the current antedotal.com Pages site remain untouched.

### Accepted locally

- Google callback, email OTP sign-in, private request/session boundaries and durable callback/account admission.
- A$1..A$50 independent Easy/Medium/Hard preset GET/PUT, and canonical name GET/PATCH. See [account acceptance](superpowers/audits/2026-09-25-account-api-acceptance.md).
- Authenticated email-change request/confirm endpoints, isolated cookie stages, per-user/action admission and exact SDK 2.106.0. Both task reviews and final review are accepted through `a58c993`; 135 website tests, typecheck, lint, Next and Worker builds pass. See [email-change acceptance](superpowers/audits/2026-09-25-email-change-api-acceptance.md). The operator activation gate remains unset.

### Deployed shared prerequisites

Callback limiter 20260925095113; account visitor limiter 20260925111932; preset contracts 20260925101013; narrow profile write permissions 20260925101749; friendship mutation protection 20260925103930; canonical profile names 20260925105731; confirmed-email synchronization 20260925120526. Each release has its own reviewed source, hosted metadata/postcondition receipt and preservation evidence in the paired Ante repository. Local source and SQL-role tests do not substitute for website server-key/real-JWT acceptance.

### Next work

1. Verify and close the older callback/proxy/server Auth adapters' SDK logging paths using an Auth-only shared transport boundary; preserve RPC error envelopes. The new isolated email client already covers rejected fetch, provider error and malformed JSON logging.
2. Implement private profile photos using the [selected minimal contract](superpowers/audits/2026-09-25-private-avatar-contract.md): private canonical object, server-only validated mutations and authenticated owner/current-friend reads. No public/signed links or silent changes to legacy avatar_url/mobile consumers. Bucket, validation and real Storage authorization/cache acceptance remain unimplemented.
3. Continue authoritative task/private-proof integration when its shared contracts are independently accepted. Hosted task create/update/archive/restore authority RPCs are still absent; do not bypass that gap through legacy table writes or disturb retained recovery fixtures.
4. Prepare Stripe sandbox card setup only under an approved consent and customer-ownership contract. Settlement, reviewer-silence charging and live money remain closed.

### Hosted and configuration gates

- Shared project is confirmed. Verify actual website server-key PostgREST access and real JWT ownership/session flows; database SET ROLE evidence is a different layer.
- Target antedotal.com in Havish's Cloudflare account. Direct Pages project/domain and Workers reads worked; account-level Pages listing and Workers-subdomain reads failed. Upload credentials and direct staging ingress remain unverified. Keep the Pages site live while preparing Workers.
- Verify OTP/Change-email templates, SMTP, secure two-inbox settings, fresh Auth pending-email exposure, Google/email same-account behavior and browser/Worker cookies. No real recipient is authorized until Workspace setup. Local preparation has sent no emails.
- OpenNext reports experimental Node middleware support; hosted runtime acceptance remains required before release.

## Confirmed decisions

All three profile edits (name, email, avatar); shared Supabase; user-selected A$1 minimum/A$50 maximum presets; owner/friend-only photos; email sign-in and editing use OTP; no UI/mobile implementation in this goal. Canonical names live in profiles, not mutable OAuth metadata; mobile self-name readers remain a separate compatibility dependency. Email signup matches existing Google signup. No paid image infrastructure or live-money activation has been selected.
