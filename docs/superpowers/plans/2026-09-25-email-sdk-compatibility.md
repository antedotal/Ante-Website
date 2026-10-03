# Email-change SDK compatibility prerequisite

Required: subagent-driven-development and test-driven-development.

## Specification

The accepted website goal includes authenticated email editing. The contract proposal in docs/superpowers/audits/2026-09-25-email-change-contract-proposal.md requires distinguishing a successful first secure-email confirmation (no user/session) from completed sign-in. Supabase's upstream fix https://github.com/supabase/supabase-js/pull/2378 shipped in 2.106.0; current lock resolves 2.104.0. This slice prepares that dependency, not email-change routes or provider acceptance.

## Constraints

Website worktree only. No UI, backend SQL, hosted/provider calls, email delivery, Cloudflare changes, secrets, or unrelated dependency upgrades. Keep @supabase/ssr 0.8.0. Tests instantiate the real installed SDK with synthetic transport and disable auto-refresh/persistence; no network or real identities. SDD reports remain ignored, never force-add them. Preserve all existing route security and sign-in requirements.

## Task 1: Pin compatible SDK and verify actual response parsing

Create tests/supabase-email-change-compatibility.test.ts using the public createClient API and a fake fetch returning realistic Auth HTTP responses. Before changing dependencies, demonstrate a failing assertion that verifyOtp({email: synthetic, token: numeric string, type: 'email_change'}) against HTTP200 {msg,code} returns exactly null user/session and no error. Confirm transport sent the correct type and original token; no issued session or sign-in event is installed after that first confirmation. Add realistic completed user/session response, rejected/expired response, and getUser response with current email and pending new_email; assert parsing retains pending field as provider data, not proof that hosted configuration exposes it. Avoid importing private SDK internals or merely testing hand-written mocks. Inspect current source/types for fixture validity.

Pin @supabase/supabase-js exactly 2.106.0 and regenerate pnpm lock narrowly, preserving existing unrelated versions and @supabase/ssr. Verify registry metadata and official release evidence before installation; if unavailable/incompatible, report rather than use an arbitrary latest version. Run focused RED/GREEN, full website tests, typecheck, lint, Next build and synthetic-public Worker build; no repeated smoke needed unless changed runtime behavior warrants it. Use public synthetic environment and unset private admission credentials; do not accidentally load real provider configuration into tests.

Update design and email-change proposal with exact pinned version, test evidence and remaining hosted two-inbox/config/session gates. A null user/session success is pending-only for future email-change; existing sign-in must still require user and session. Commit explicit files, report RED/GREEN, dependency delta, commands/results and remaining gates. Independent spec/quality review follows.
