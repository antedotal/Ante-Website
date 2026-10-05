# Worker admission runtime fix — 1 October 2026

Spec: `docs/contracts/callback-admission.md`, `docs/contracts/account-admission.md`, `docs/contracts/email-auth.md`, and the account-origin/session contracts in `docs/WEBSITE_BACKEND_GOAL.md`. Application baseline `c32417f1fda7ab12b426ad3f4664bab13a9322d0`, documentation HEAD `cf79985fd25c7a75a94a4db8ec885d872d47a74c`.

## Global constraints

Preserve direct Cloudflare ingress, canonical origin checks, private/no-store fixed failures, actual service-only durable admission before Auth, fixed quotas, bounded response/abort handling, secret isolation and public-only builds. Keep photo/email-change/payment modes closed, Pages/main and routes untouched, and all unrelated client/schema work unchanged. Never make a deployed denial pass by bypassing admission, accepting user-supplied IP, exposing credentials or relaxing identity/authorization. A required product/contract change goes to the controller before dependent work. Existing hosted version remains explicitly unaccepted until corrected artifact/provider acceptance.

### Task 1: Establish root cause and correct ordinary admission

Read the contracts, actual application and installed adapter code. Current final-source staging version `f5251860-ba3d-457f-a406-eb2bcef4402f` returns 200 for marketing/static/image fallback, 403 for hostile/missing Origin, but canonical email and account admission return private 503 without cookies. Direct shared Supabase server-key Auth settings and both fixed admission RPCs return 200 and the exact allowed/zero-retry record; credential shape/HMAC bounds are valid. Ordinary local workerd with the same private runtime values and canonical upstream also returns 503. Establish the exact failed boundary using bounded private diagnostics; no new public diagnostic endpoint or invented Auth call.

Record a meaningful failing regression for the evidenced cause, implement the smallest source correction and verify the relevant routes with the ordinary generated Worker locally. Preserve all denied paths and transport limits. Inspect the exact build output and any adapter/runtime assumptions rather than guessing. No broad test repeats until a source change justifies them. Update factual `.guidelines/design.md` details, self-review and commit only declared application/test/design files. Report exact commands, RED/GREEN, source changes, temporary process cleanup and remaining hosted gates to this plan workspace. Root owns provider actions, secrets, deployment, operational evidence and Git integration.

Independent task review followed by whole-plan review is required before root rebuilds/deploys corrected ordinary source.
