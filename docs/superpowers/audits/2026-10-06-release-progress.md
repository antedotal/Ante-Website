# Release execution evidence — 6 October 2026

This is a progress receipt, not complete release acceptance. Daniel authorized remaining release execution, production website routing/deployment and verified nonfinancial cutover. Required web payments are implementation scope; live settlement remains paused. All dispatched agents use GPT-6.1 Sol.

## Website

- Reviewed source: `9572173d81abc4f51131aabe5385a79afe05f2ce` in `/Users/daniel/.codex/worktrees/release-readiness/Ante-Website`. Source reviews and scoped persistent-ingress re-review are clean. Focused runs passed 67 and 44 tests, plus lint, typecheck, build and dry run.
- Actual public-config Worker build passed. Generated `.open-next/worker.js` SHA256: `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`. Build log: `/private/tmp/ante-release-real-build.log`.
- Normal Wrangler deployment activated version `f5209a7b-9389-48c9-b7d6-4fc3e91deefa`, deployment `73ef6532-9cbd-4763-ad6f-eaecd7562103`, at `2026-10-06T06:08:31.858Z` (17:08 AEDT), 100%. Log: `/private/tmp/ante-release-deploy.log`. Explicit apex/www routes replaced the incomplete wildcard arrangement. Prior version `a79ce667-3559-4b8c-b8bf-efe6c1f2a56d` remains available for rollback.
- GET matrix passed for apex homepage/assets/sign-in, private navigation/API denial, www canonical redirects, workers.dev private denial, hostile Origin denial and invalid callback handling. Receipt: `/private/tmp/ante-release-website-hosted-matrix-audit-client.json`. Default Python user agent hit Cloudflare1010; the documented audit client completed the matrix. This is anonymous HTTP acceptance only.
- With separate explicit user authorization, exact `https://antedotal.com/auth/callback` was added and visibly verified among eight Supabase redirect entries. Site URL already used the apex. Public Auth settings return200 with email/Google enabled, email autoconfirm false and anonymous sign-in false; receipt `/private/tmp/ante-release-public-auth-settings.json`.
- Source publication, authenticated browser/session/email acceptance and saved future Cloudflare build public variables remain open. No Auth email/test account was created. Photo and email-change serving modes remain unset.

## Phone preparation and native build

- Reviewed preparation commits: `e027884efb98226720deb8eea9e120d1ddf0347b` and `ffdea3a14ca6a843d9c6dadf50d1c61ca3e89a19`. Source and scoped re-review are clean. Prepared output has explicit ownership, pre-adoption cleanup and retired-callback protection; authority and legacy fallback send the captured verified bytes. Failed exclusive creation preserves a pre-existing path.
- Focused verification:41 unit tests,33 native tests,60 Deno tests,16 real pinned-WASM codec tests with no skips, real Swift ownership harness including rejected stages/collision/unrelated-file/success cases. Full lanes remain red:3 unit and37 native failures. `/private/tmp/ante-phone-baseline-comparison.md` confirms all40 exact failure names/error families reproduce in the captured initial dirty snapshot with identical configurations and no new/missing names.
- Native-selection commit `c9f2c695c43bc5647fc634fa5360c54588a0d79c`, tree `04f966617be41e5d87d3fbecd18d19f38c8c7000`, explicitly selects `expo-image-manipulator` source via SDK57 autolinking and `supportsTablet=false`. Independent config review is clean. The predecessor's centralized Pods selection had used a precompiled XCFramework; package-local selection alone was insufficient.
- Exact disposable regeneration at `/private/tmp/ante-ios-native-c9f2c69` passed frozen install, prebuild and Pods. Actual Pods source phase includes `OwnedImageOutput.swift` and `ImageManipulatorUtils.swift`, with no ImageManipulator XCFramework.
- Xcode27/iOS27 unsigned generic-device Release archive succeeded at `/private/tmp/Ante-c9f2c69.xcarchive`. Patched Swift compiled arm64; app `UIDeviceFamily=[1]`, version1.0.0, locally generated build1. Executable SHA256: `5d92970f0a2448c9512ad5727ca75ed704eab7b4ee27625ec7d2d27bc8ffc07c`. Evidence: `/private/tmp/ante-ios-native-build.md` and `/private/tmp/ante-ios-native-c9f2c69-archive.log`.
- Lock SHA256: `04bc9ce804a5e0adf491e599125b220decaa1f9e9c881ac2d19212e567a86373`; patch SHA256: `22ed7d0927a2ca007b63e1582617955252de1a7da4a699dbf7faf3054ba346df`.
- No signature/provisioning profile, EAS build, installation or physical behavior acceptance. Daniel cannot connect a phone now; known phones are unavailable, EAS is logged out and no simulator runtime is installed. Local build1 is not an accepted minimum. Baseline ESLint19 errors remain a tracked repair unit.

## Runtime and backend

- Trial independent review: `/private/tmp/ante-cloudflare-trial-source-review.md`. One P2 requires exact plain-object own-key validation for quota receipt and remaining-budget fields;12 local policy tests pass. Trial source remains untracked, not serving source acceptance. No actual quota, image, provider lifecycle or codec run is claimed.
- Normal Wrangler Containers inventory refuses absent `containers:write`; required Containers/cloudchamber scopes are identified but were not added. Paid account status is not remaining included-quota evidence. No trial ran. Separate serving design is recorded in `/private/tmp/ante-serving-runtime-design.md`; listener/ingress implementation and real acceptance remain open.
- Live literal preflight: `/private/tmp/ante-backend-literal-preflight.md`. All177 artifact/transitive pins match. Scoped15 routines,6 tables, indexes, schema ACLs and memberships match. Hosted postgres has public/storage S/f/r defaults; the literal difficulty predecessor expects public-only. Strict complete six-entry successor and regenerated descendant pins are required. Existing storage grants must remain preserved.
- PostgreSQL17 isolated test prerequisite is available through explicit Docker context `colima-ante-website-tests`; global context remains unchanged. Existing recovery profiles/fixtures are preserved.
- No closed package installer, gateway deployment, accepted release row, legacy-writer cutover or destructive cleanup activation occurred. Physical accepted client/runtime and exact runner/history semantics remain prerequisites. Financial containment stays deployed.

## Payment decisions and gates

Current scope is the full required web payment lifecycle in `WEBSITE_BACKEND_GOAL.md`, not only card setup. Connected discovery confirms `ante-test`, `acct_1SqmnNEAli8BdYI6`, `livemode=false`; no payment object was created and provider behavior is unverified.

Prices and caps remain variable. Australia is initial launch; US is next. Amount cannot change after task start. Appeals go first to original reviewers;24 hours to submit is a proposed configurable window, reviewer response deadline unselected. Approval releases/no charge; denied appeal or expired appeal window may permit collection only under accepted definitive authority. Reviewer silence escalates to Ante and remains pending. Proposed short-task hold cutoff is below2–3days; authorization timing/expiry policy is unselected. `docs/legal.md` in the app repository is being updated with unapproved consent/refund/dispute drafts and conservative expiry options. No draft establishes customer consent or provider/legal approval.

Implementation proceeds with missing policy denying enrollment/dispatch. Exact ownership/consent, cards, commitments/jobs, task admission, holds/long collection, webhook/reconciliation/dispute/notice and separate Premium units remain to be implemented and independently reviewed, then verified in sandbox and hosted flows. Live settlement is separately held.

## Execution constraints

Git SSH authentication fails; normal HTTPS reads work for the public website but private app credentials are unavailable. Connected GitHub reads verify website main3fa81ef and app developb036ddd. App foundationd57d5c6 has the same tree as developb036ddd; do not duplicate it when publishing later source. Publication is still pending.

Automatic approval review rejected a helper attempting manual Wrangler token decryption; it never ran and was removed. Normal Wrangler/dashboard replaced that approach. Approval review also rejected an initial HTTP matrix containing Auth POSTs; it never ran and was replaced by GET-only checks. Neither rejection is release acceptance or a reason to bypass the reviewed boundary.

The active goal and SDD ledger remain open at `/Users/daniel/.codex/worktrees/release-readiness/Ante-Website/.superpowers/sdd/RELEASE_EXECUTION_PLAN/progress.md`. Temporary logs/raw receipts above should be retained with final acceptance artifacts before cleanup; this concise receipt records exact identities and limitations now.
