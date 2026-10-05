# Worker and email hosted acceptance — 1 October 2026

The user authorizes deployment and acceptance of the website backend while the existing Pages site stays live. This is controller-owned operational work against independently reviewed application source `c32417f1fda7ab12b426ad3f4664bab13a9322d0`, with documentation checkpoint `cf79985fd25c7a75a94a4db8ec885d872d47a74c`. No application implementation is implied by a deployment failure: any required source change gets a fresh Superpowers implementer, meaningful verification, task review and final review.

Spec: `docs/WEBSITE_BACKEND_GOAL.md`, `docs/contracts/email-auth.md`, `docs/CLOUDFLARE_BACKEND_READINESS.md`, and the user's latest deployment authorization and test recipient `daniel@antedotal.com`.

## Constraints and interfaces

- Target only Havish account `5af41de7e4953ebc3d99f3ec07803736`, Workers Free and a separate `ante-website-backend-preview.walihavish.workers.dev` origin. No custom domain, production route, Pages setting, DNS or paid-plan change. A missing platform allowance is a result, not permission to buy it.
- Use the shared Supabase project `yxilmwxptfnebnjsikwo`. Keep server credentials and random HMAC values in private mode0600 deployment files or runtime secrets, never command arguments, tracked configuration, static assets, logs or receipts. Build with public configuration only; the build and runtime canonical origin must match.
- Profile-photo serving/publication, email change and financial activation modes remain unset. Preserve existing users, profile data, objects, task history and payment containment. No cleanup of unrelated provider resources.
- Trust direct Cloudflare ingress only. Retain origin validation, no-store responses, durable visitor/subject admission before Auth, generic request responses, strict input bounds and existing SSR cookie behavior.
- Published receipts contain status, exact source/bundle identities, cookie attributes/counts and aggregate provider observations only. No code, token, cookie value, SMTP credential or raw Auth payload is recorded.
- A regular build or deployment acknowledgement is not hosted acceptance. Any platform failure or incomplete browser/provider journey stays explicitly unaccepted.

### Task 1: Operational preflight and reproducible final-source artifact

Read the entire auth/config/entrypoint and relevant accepted contracts. Independently review the proposed staging boundary before deployment. Verify current Wrangler identity and account access, target absence, Pages configuration and route preservation. Retrieve installed CLI options/schema and current primary platform documentation. Build the unchanged ordinary Worker with only public Supabase URL/key and the chosen staging origin; no temporary acceptance routes or private build values. Run deployment dry-run and retain compressed size and bundle hashes. Inspect browser assets for server credential/HMAC contamination. If Workers Free cannot hold this artifact, stop that deployment path and prepare a separately reviewed implementation decision; do not silently omit routes or enable billing.

### Task 2: Separate hosted Worker and ingress acceptance

After preflight, deploy only the reviewed final-source artifact with explicit account/name, no custom routes, preview version URLs disabled and the intended workers.dev origin. Use CLI secrets-file support and no-secret output. Confirm exact deployed identity, canonical runtime configuration and unchanged Pages/routes. Exercise marketing/static assets, missing and malformed-session protected paths, hostile/missing-origin email requests, malformed input, invalid code, fixed throttling and closed photo/email-change modes. Check actual response status, private/no-store and absence of provisional session cookies. Bound requests and wait for legitimate quota expiry rather than resetting shared state or retrying uncertain provider effects.

### Task 3: Actual email delivery and authenticated session acceptance — deferred to the user

The user has explicitly taken over email testing. Do not send test codes, access an inbox, or request an inbox handoff. The original acceptance criteria below are a manual release checklist, not an instruction for this agent to perform email testing. The corrected source is `9e17e91e9811e1f836942d65d157a1ca8da08ff7`, deployed as version `60629d28-85b3-476a-b5c3-0cb15bb7cd0a`; [the current checkpoint](../audits/2026-10-01-worker-correction-and-next-steps.md) supersedes the initial source/failed-admission observations. Visible code templates and the exact staging callback are already applied and independently verified. Task 2 has passed the documented anonymous/closed-mode subset; real authenticated sessions and resource/subrequest acceptance remain open.

Inspect hosted Auth settings without exposing SMTP secrets; confirm the applicable signup/magic-link template includes the token. Request a real code only for the authorized recipient `daniel@antedotal.com`. Receiving a generic 202 is not proof of delivery. Obtain the actual delivered message and code through an authorized inbox/browser handoff, without committing it. Verify via the Worker, inspect secure same-site path-limited session cookies, then make a protected read with the resulting cookie jar and verify identity privately. Check a replay/invalid-code denial without provisional cookies. Record what was observed, not inferred. Same-account Google/email linking and browser session refresh need actual authorized provider/browser journeys; if those are unavailable, retain them as explicit remaining gates. Do not add an email UI or change account email settings to make this check pass.

Finish with independent evidence review, a durable deployment/remaining-gates checkpoint and reviewed source/docs integration to develop using a fresh unchanged-upstream guard. The wider private-photo/proof pipeline remains separate work.
