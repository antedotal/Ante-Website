# Ante release status

Verified 6 October 2026, Australia/Sydney. Shared app/backend/website handoff for humans and agents; supersedes older deployment claims, including “production Pages unchanged.”

**Production website routing is repaired and anonymously verified; the complete release remains unfinished.** The new task/proof/photo system is still closed. Phone source is reviewed and an unsigned iPhone Release archive built successfully; signing/device acceptance, publication, runtime acceptance and coordinated backend cutover remain open. Required web payments are being implemented under the active release goal; live settlement remains paused.

## Required web payment release scope

**Stripe web payments, including payment holds, are required for this release and are not postponed.** Implement card setup/management, versioned consent, web financial settings, short-task authorization holds and release/capture, long-task definitive-failure collection, durable settlement/reconciliation, notices, review/disputes and financial evidence retention. Include the documented web premium subscriptions as a separate billing flow. The [required payment scope](WEBSITE_BACKEND_GOAL.md#required-web-payments--scope-confirmed-6-october-2026) defines the lifecycle and acceptance requirements and supersedes older funding-deferral wording.

Existing paused financial handlers describe current deployment state, not an exclusion from implementation. Nonfinancial cutover is an intermediate milestone; the full web release requires verified payment implementation. Live settlement remains held until its financial acceptance and activation gates pass. The connected `ante-test` sandbox is available; account discovery alone does not verify payment behavior. Prices and caps remain configurable, Australia is the initial market and the US is next. Consent and refund/dispute wording remain drafts pending review.

## Source and publication

| Work | Local and GitHub state | Hosted state |
| --- | --- | --- |
| Website | Local/GitHub `main` both `3fa81ef`; PRs [37](https://github.com/antedotal/Ante-Website/pull/37), [38](https://github.com/antedotal/Ante-Website/pull/38), [39](https://github.com/antedotal/Ante-Website/pull/39) merged. Reviewed release source `9572173` in `codex/release-readiness` is not yet published | Active Worker deployed from `9572173`; Pages still has the earlier `3fa81ef` asset deployment |
| Earlier website fixes | Old `codex/shared-web-account` worktree at `93abe0a`: all three apparently local commits have equivalent patches in `main` | Do not reapply them |
| Published app/backend foundation | Local `d57d5c6` and GitHub `develop` at `b036ddd` have identical trees (`7afd4689…`) despite different commit IDs | Supporting SQL partly deployed; closed proof ledger absent |
| New task/proof integration | `codex/task-proof-photo-integration` at `9efabe2`: **20 additional committed changes**, absent from GitHub branches | Gateway, ledger, photo service and new retention jobs not installed/activated |
| Phone-prepared proof photos | `e027884` and `ffdea3a` commit prepared-byte ownership/integrity fixes; independent review is clean. `c9f2c69` adds iPhone-only native source selection. Branch remains unpublished; separate Cloudflare trial files remain untracked | Exact `c9f2c69` unsigned Release archive succeeded; no signed distribution or physical-device acceptance |

Continue photo work in `/Users/daniel/dev/ante/.worktrees/phone-prepared-proof-photos`. The normal `/Users/daniel/dev/ante/Ante` checkout is still the older `website_database_backend` at `4d2b85e`; app `main` is `15f7df8`. Neither is the latest implementation. Preserve unrelated untracked files: website `hi.json`, app `brag-output/` and `package-lock.json`, and other worktrees' dependency/plan directories.

## Cloudflare now

- **Workers Paid is active**, confirmed in the [account dashboard](https://dash.cloudflare.com/5af41de7e4953ebc3d99f3ec07803736/workers/plans).
- Reviewed release source `9572173` built successfully with actual public account configuration. Worker version `f5209a7b-9389-48c9-b7d6-4fc3e91deefa`, deployment `73ef6532-9cbd-4763-ad6f-eaecd7562103`, reached **100% at 17:08 AEDT on 6 October**. Explicit apex/www routes reach the Worker. Previous `a79ce667` is retained for rollback. workers.dev remains enabled but private account ingress rejects it; version-preview URLs remain disabled.
- [Pages deployment](https://dash.cloudflare.com/5af41de7e4953ebc3d99f3ec07803736/pages/view/ante-website/6b635802-5861-4cb7-9004-531efa555c3b) `6b635802…` succeeded at 14:54 AEDT from the same commit. Automatic production deployments remain enabled. It runs `pnpm run build:worker` but publishes only `.open-next/assets`.
- **Routing repair verified:** apex homepage, assets and sign-in return `200`; private account navigation redirects to sign-in, and anonymous profile/preset APIs return `401`. Recognized www GETs redirect `308` to fixed `https://antedotal.com` with path/query preserved. Private workers.dev requests and hostile origins return `403`; private responses retain no-store headers. The exact production Auth callback is saved and visibly verified in Supabase's allowlist. Authenticated browser/session and email-delivery acceptance remain open; account navigation remains unlinked.
- Future Cloudflare Builds public variables were entered, but their save is **unverified**. Complete this before relying on a future hosted build; the deployed local build already used verified public configuration.
- Runtime bindings contain existing Auth/Supabase secrets, assets and self-service binding; no photo/email-change mode binding. Source keeps profile writes closed. No proof-photo Worker appears in the inventory; the Containers dashboard reports **no Containers**. The synthetic trial is local. Paid status alone does not establish remaining quota or hosted codec acceptance.

## Supabase now

Project [Ante `yxilmwxptfnebnjsikwo`](https://supabase.com/dashboard/project/yxilmwxptfnebnjsikwo) is healthy. There are **37 migrations**, latest `20260930153540_task_difficulty_presets`. Actual catalog, policies and deployed handler source were also checked.

| Area | Verified live state |
| --- | --- |
| Deployed prerequisites | Internal RPC restrictions; website callback/account limits; presets/difficulty; profile/friend write restrictions; profile name/email sync; private profile-photo authority and mediated-reader prerequisites; retention containment |
| Missing release | New proof/ledger/release/asset-retention schemas and task/proof gateway. Older authenticated task/proof writers remain available and must close during cutover |
| Storage | `Verification Images`: private, 10 MiB, 16 objects; legacy format allowance still includes HEIC/HEIF/WebP. `profile-photos`: private, 2 MiB, JPEG/PNG, empty. Proof owner/verifier policies remain; ordinary direct profile reads are restrictively denied |
| Payments | `create-payment-intent`, `manage-payment-hold`, `check-failed-tasks` v12 use `financial_operations_paused`. The last checks the service bearer despite `verify_jwt=false`. Card setup/management endpoints remain deployed |
| Cleanup/jobs | `purge-deleted-tasks` v11 returns `proof_retention_paused` before dependency access. Both payment schedules remain active; purge runs every **30 seconds**, despite its “hourly” name. New deadline/retention jobs are absent. Scheduling does not imply active charging/deletion |

Literal release preflight found one concrete predecessor mismatch: installers expect only public default ACLs, while hosted postgres has six public/storage entries. All 177 checked artifact pins and scoped routines/tables/indexes/memberships match. Prepare a versioned six-entry successor and regenerate descendant pins; preserve storage grants and strict drift refusal. No closed installer has run. Full later-package catalogs, migration-history handling and coordinated writer cutover still require acceptance.

Advisors still flag seven [mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), callable security-definer routines and disabled leaked-password protection. Triage applicable findings during cutover; callable routines are not automatically authorization bypasses. Stripe-provider behavior, Auth delivery and App Store/TestFlight state remain unverified.

## Photos and first iPhone release

Current requirement: prepare orientation, 1080p fit and metadata removal on the phone; upload/store/retry only prepared bytes. Server checks format, size, dimensions and full decoding before exact-byte publication. Preserve private owner/friend access and retention. Delete app-created raw temporary copies, never the user's Photos-library original. Proof resizing no longer belongs on the server.

Reviewed source implements JPEG/PNG, the existing 10 MiB cap, and a 1920×1080 landscape / 1080×1920 portrait fit without upscaling. The pinned `expo-image-manipulator@57.0.18` patch owns and cleans native output. Centralized Expo SDK57 autolinking now explicitly builds this package from source; the package-local setting alone did not force Swift compilation. Exact `c9f2c69` native regeneration and an unsigned arm64 Release archive succeeded, including patched Swift source and iPhone-only device family. This is build evidence, not device acceptance or a distributable signed build.

Focused checks passed: 41 unit, 33 native, 60 Deno and 16 real pinned-codec tests, plus the real Swift ownership harness. The broad lanes remain red: 3 unit and 37 native failures. A captured pre-fix snapshot reproduces all 40 exact failure names/error families with identical test configuration; there are no new/missing failure names. Baseline ESLint also has 19 errors; repair is required before final acceptance.

Daniel confirmed **iPhone only, no previously released app**, and cannot connect a phone now. Use the first accepted rebuilt iOS binary as the minimum build. `app.json` says `1.0.0`, has no `ios.buildNumber`, and EAS uses remote versioning; the local archive's generated build `1` is not an accepted minimum. `supportsTablet` is now false. Local Xcode27/iOS27 is available; EAS is logged out and no simulator runtime is installed. Signing, installation and physical orientation/metadata/cleanup/cancellation/recovery checks remain open.

## Next work in order

1. Finish future hosted-build public configuration, source publication and authenticated browser/email acceptance. Anonymous production routing has passed.
2. Repair baseline ESLint errors; sign and physically accept the reviewed rebuilt iPhone source when a device is available. Publish integration/photo work without recreating the equivalent published foundation. Git CLI authentication is unavailable; connected GitHub repository tools are available.
3. Correct the trial's strict quota-receipt schema finding. Verify actual remaining included quota, permission and lifecycle bounds before its one-use capped run. Implement/verify the separate serving runtime; the synthetic trial is not serving acceptance. Normal Wrangler OAuth lacks Containers authority; no trial or permission expansion occurred.
4. Prepare/review the exact hosted ACL successor and release runner/history semantics. Install coordinated nonfinancial packages only after client/runtime prerequisites pass. Verify owner/friend/stranger denials, publication/recovery and rate limits; set the accepted build/origin, close old writers and activate together. Keep destructive cleanup paused without its separate acceptance.
5. Implement and verify the required full Stripe web lifecycle under the [execution plan](RELEASE_EXECUTION_PLAN.md). Task6 is drafting the shared contract and existing app `docs/legal.md`: immutable amount after task start; appeals to original reviewers; proposed configurable 24-hour appeal window; unselected reviewer deadline and 2–3-day short-hold cutoff; silence escalates to Ante without collection. Expiry options and refund/dispute/consent drafts remain unapproved. Finish ownership/consent, cards, commitments/jobs, task funding, holds/collection, recovery/webhooks/disputes and separate Premium billing, then sandbox/hosted acceptance.

Evidence: [release progress](superpowers/audits/2026-10-06-release-progress.md), reviewed source/reports, exact native archive, captured baseline comparison, Supabase MCP catalog and literal artifact pins, Cloudflare deployment receipts and bounded anonymous HTTP matrix. Root deployment and callback configuration were explicitly authorized. No Auth email/test account, cloud codec trial, backend installer or live financial operation was performed during this execution. The active goal remains incomplete.
