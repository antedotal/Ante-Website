# Hosted account JWT acceptance design

27 September 2026. Design and read-only hosted preflight only. No accounts, sessions, application rows, Auth settings, provider configuration or code were changed. No test run is claimed.

## Decision and boundary

Run a small standalone Node acceptance runner against `yxilmwxptfnebnjsikwo` using the installed Supabase JS 2.106.0. Create at most two synthetic Auth users, obtain genuine sessions without sending email, and exercise the already deployed name/preset RPCs through public-key PostgREST clients. Cloudflare login is independent of this step.

Only the two owned Auth users, their trigger-created profiles, sessions/identities, preset rows and name quota rows may change. Never create tasks, relationships, notifications, Storage objects, photo operations or payment records. Never call a payment endpoint, send email, change Auth settings, deploy code, disable a trigger, or use SQL role impersonation as JWT evidence. The existing broad backend test authorization covers this bounded test; missing technical prerequisites below are not requests for additional approval.

Owner: implementing agent. Proposed runner: `scripts/acceptance/hosted-account-jwt.mjs`; proposed sanitized receipt: `docs/superpowers/audits/2026-09-27-hosted-account-jwt-results.md`. Neither exists as part of this design. Keep credentials out of arguments, command history, output, Git and the receipt.

## Verified current state

Read-only Supabase MCP catalog queries inspected live trigger bodies, foreign keys, the four account RPC bodies, `profile_photo_state_v1(uuid)`, and effective profile column grants.

- `on_auth_user_created` calls `handle_new_user()`: insert one profile with `standard` status, unless the exact email matches `public.waitlist`; a match also updates that waitlist row. `on_profile_sync_email` fills the new profile email from Auth. Both triggers are enabled. Therefore an exact and case-normalized waitlist collision check is a prerequisite, not merely a probabilistic assumption.
- `profiles.id` references `auth.users.id` with NO ACTION. Name quota and preset owner rows reference Auth with ON DELETE CASCADE. Delete the owned profile before calling Auth admin deletion.
- Protected profile children include `tasks.user_id`, `"tasks to verify"."sent by"`, both `"friend pairs"` endpoints, `payment_methods.user_id`, and `payment_holds.user_id`. The latter two cascade on profile deletion. `notifications` has two cascading Auth-user references. A cleanup that checks only blocking foreign keys is unsafe.
- Name RPCs require an existing profile and raise `P0002` if it is absent. Preset RPCs require `auth.uid()` and their Auth-user FK; they do **not** require a profile. This is the current contract boundary, not a new claim of a common deleted-profile guard.
- Both name and both preset RPCs allow `authenticated` and deny `anon` execution. `profile_photo_state_v1(uuid)` denies both roles. Clients cannot directly UPDATE `full_name`, `email`, `updated_at` or privileged profile columns. `avatar_url` still has authenticated UPDATE permission; do not claim every profile column is locked down.

These facts must be rechecked immediately before execution. This catalog evidence does not replace the HTTP assertions.

## No-email session method

Preferred minimal path: for each owned address, admin `createUser({ email, password, email_confirm: true, app_metadata: { acceptance_run: runId } })`, then a **separate public-key client** calls `signInWithPassword({ email, password })`. Use a fresh high-entropy password per user, held only in memory. Creation confirms that individual user; it does not change project confirmation settings. Do not use signup, invite, OTP-send, reset, recovery or email-change APIs. The official examples document [admin confirmation](https://supabase.com/docs/reference/javascript/auth-admin-createuser) and [password session acquisition](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

Alternative if selected before the run: create the confirmed users without passwords, admin `generateLink({ type: 'magiclink', email })`, then public client `verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' })`. Link generation leaves delivery to the caller; this runner never sends or follows the link. Confirm the user already exists with the journaled ID before generating, and assert the returned user ID is identical: generateLink must never become an unbounded account-creation fallback. Keep the token hash, OTP and action URL in memory only. See [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), the explicit [no-send description](https://supabase.com/docs/reference/swift/auth-admin-generatelink), and [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

Choose one method; do not cycle methods or alter settings to overcome provider rejection. An unavailable email provider, domain rejection, CAPTCHA/hook requirement, or credential failure stops setup and initiates owned-fixture cleanup. Session acquisition proves Auth issued a JWT for the fixture, not mailbox ownership or email delivery. Current changelog checked; no relevant Auth API breaking change was identified in the recent index.

The admin client must never receive `signInWithPassword`, `verifyOtp` or `setSession`. A, B and anonymous clients each use only the public project key; A/B have their own genuine JWTs. Disable persistent storage, automatic refresh and URL session detection. Verify each session with `getUser(accessToken)`, require the journaled UUID and `authenticated` role, and keep the admin credential absent from all assertion requests. JWT payload decoding alone is insufficient.

## Bounded runner and ownership journal

1. Refuse an unresolved journal for this project. Use a private durable directory outside Git, for example `~/.local/state/ante-acceptance/hosted-account-jwt/`, mode 0700; journal mode 0600, exclusive creation and an exclusive run lock. Flush every mutation intent and acknowledgement to disk. A temporary file alone is insufficient after a crash.
2. Generate one random run UUID and two random addresses ending `@example.invalid`. Before **any** creation, prove both addresses absent from Auth, profiles and waitlist using exact/case-normalized comparisons; emit counts only. Record project, run ID, addresses, intended labels A/B and start time before creating either. Any collision stops this run; do not claim ownership of a pre-existing account.
3. Recheck create/update/delete trigger definitions, Auth hooks relevant to setup, foreign keys, profile defaults, effective grants and allowed endpoint origins. Stop for an unexpected side effect, new protected relation, or schema drift. Verify admin credential availability without printing it. This design did not inspect project Auth configuration or establish that an admin credential is available to the runner.
4. Before each create, flush `create_pending`; on success, immediately record returned UUID, creation timestamp and ownership marker. No blind create retries after timeout. An ambiguous result is reconciled by exact intended email plus server-set run marker and creation window, returning at most one candidate. Zero candidates remain unresolved until absence is established; multiple/mismatched candidates stop. Never replace fixtures to exceed two creations.
5. After each create, require exactly one matching profile, `standard` status, expected email and no protected children. Snapshot fixture values needed for assertions. Setup failure still enters cleanup.
6. Run at most 40 account/Data API assertion requests and 16 Auth/session requests, with a 10-second request deadline, no automatic mutation retries, and a five-minute active-test deadline. The two creates and two admin deletes have their own fixed cap. Cleanup remains required after the test deadline. No rate-limit saturation or concurrency stress in this slice.

Journal fields are limited to run/project IDs, synthetic addresses/UUIDs, timestamps, method, allowed endpoint names, request counters, stage/cleanup state, sanitized status/code assertions and preservation fingerprints. Never persist passwords, JWTs, refresh tokens, token hashes, OTPs, action links, cookies, raw provider errors or user records. The run marker helps recover an ambiguous creation; it is never an authorization claim used by application code.

## Acceptance assertions

| Check | Action and required observation |
| --- | --- |
| Real identity | A and B get genuine, distinct sessions; public-client `getUser` returns each owned UUID. No service credential on their HTTP calls. |
| Name round trip | A sets `  Fixture Alpha  ` and reads normalized `Fixture Alpha`; B independently sets/reads `Fixture Beta`. Assert exact public result shape and valid timestamp, then reread A unchanged. |
| Preset round trip | Fresh A/B GETs return unset; A sets 100/2500/5000, B sets 200/300/400, and both reread their own values/currency/timestamp. No task or payment is created. |
| Caller ownership | RPCs accept no owner selector. A request adding B's UUID as an extra owner argument must fail function dispatch, then B remains unchanged. This checks these four RPCs only, not unrelated profile read policies. |
| Direct write denial | A public client attempts an exact-UUID UPDATE of A's name and a separate exact-UUID UPDATE of B's name. Require denied/no changed rows and confirm both canonical values unchanged using legitimate owner reads. Probe direct private preset-table access with A; require schema/permission denial and unchanged presets. |
| Privileged photo denial | Call the existing nonmutating `profile_photo_state_v1({p_owner: A.id})` as A and anonymous. Require permission denial, not a malformed-call error or an application success envelope. Do not invoke reserve/publish/clear. Catalog-check all seven photo RPC grants, but report HTTP evidence only for state. Photo ledger fingerprints must remain unchanged. |
| Anonymous denial | Call both account GET RPCs using public key with no user JWT; require denial and no fixture value changes. |
| Missing profile | During guarded cleanup, delete only A's profile while A Auth user still exists. Same A JWT name GET and SET must yield `P0002` without recreating profile/quota state. Preset denial is expressly not expected or claimed for this condition. |
| Revoked session | Before deleting B's profile, keep B's session only in memory, sign B out with local scope, then attempt `getUser` and refresh with the retained credentials. Record actual statuses and allowlisted codes; refresh must fail. Do not manufacture `session_not_found` or treat a generic refusal as that classification. |

Supabase access JWTs can remain usable until expiry after logout; direct PostgREST acceptance of an old JWT is not by itself a failed revocation test. See [signOut semantics](https://supabase.com/docs/reference/javascript/auth-signout). If real Auth emits `session_not_found`, an optional bounded installed-SDK test can pass that live failure through the existing `createAuthFetch`/SSR cleanup path with an in-memory cookie adapter. That would establish live-provider plus local-adapter behavior only. If Auth returns a different code or still accepts the access token, report that result and leave revoked-cookie acceptance open. Do not broaden the sanitizer during acceptance.

## Cleanup and failure recovery

Cleanup is part of every exit path. Stop further assertions; journal cleanup intent. For each exact journaled UUID, revalidate Auth ID/email/server marker and profile ownership. Check zero protected references across **all** catalog-discovered application children, including cascading references; also check both notification references, photo heads/operations, and Storage owner/key references that have no Auth FK. Return counts, never real records. Unknown relation semantics or any protected row blocks deletion and retains the journal for diagnosis.

Delete each fixture profile in a guarded DB transaction after locking that exact profile row and repeating the protected-child checks; require zero or one affected row and a match to journaled ownership. Never delete a protected child to make cleanup succeed. Profile absence then permits exact `auth.admin.deleteUser(id, false)` hard deletion, with a fresh protected-reference check immediately before it. The two API/DB stages are not one atomic transaction: no fixture work may run concurrently, and unexpected changes stop cleanup. Never disable triggers, alter foreign keys, delete by email suffix, or bulk-delete fixture-like users.

If profile deletion succeeds but Auth deletion fails, record `profile_removed_auth_pending` and retry only exact-ID cleanup after read-only reconciliation. If deletion times out, query exact-ID existence before retrying. Existing absence is success; mismatched ownership is a stop. Let Auth delete its own session/identity/token children and cascade only the owned preset/name-limit rows. Verify exact absence of both users/profiles/private owner rows plus no owned photo/Storage/protected rows before marking cleanup complete. A blocked cleanup is a failed acceptance run, with exact synthetic IDs and reason reported; retain the journal and do not start another run.

## Preservation receipt and proof limits

Take one consistent read-only baseline and a post-cleanup snapshot of nonfixture profiles, waitlist, tasks/proof tables, friend pairs, payment methods/holds, notifications, preset/name-limit rows, photo ledger, and Storage metadata. Compute counts and stable ordered row-content SHA-256 fingerprints inside the DB; export only aggregate counts/digests, not existing user data or provider secrets. Fingerprint relevant trigger/function bodies, grants and policies too. Compare pre/post before success. Limit scans with a statement timeout; if a complete baseline is too large or unavailable, stop instead of substituting counts alone. Do not hash Auth passwords, token columns, or vault secrets. Auth audit logs and ordinary Auth session bookkeeping are expected provider effects, not promised rollback targets.

Concurrent real activity can change a fingerprint legitimately. A mismatch prevents an unchanged-data claim and calls for read-only diagnosis; it never authorizes restoring a baseline or editing unrelated rows. The fixture-only request allowlist and zero protected-child checks are separate evidence of run scope.

Passing this plan establishes hosted Auth-issued JWT ownership and denial for the named Data API surfaces, with verified fixture cleanup. It does **not** establish the deployed website `/api/account/*` path, visitor admission, Cloudflare ingress, server-key transport, browser cookie refresh/cleanup, frontend behavior, email templates/delivery, OTP entry, Google identity, private-photo serving, task authority, payment safety, or production release readiness. Those remain the gates described by `2026-09-25-account-api-acceptance.md` and `2026-09-25-shared-auth-transport-acceptance.md`.

Execution blockers still to resolve: implement/review the bounded runner and recovery journal; verify available server/public credentials and current Auth method/hook configuration; complete the immediate trigger/FK/default/grant and preservation baseline. Cloudflare authentication is not a blocker for this direct hosted backend test. No user clarification is required for the design.

## Implemented runner — source and local verification, 27 September

`scripts/acceptance/hosted-account-jwt.mjs` implements explicit `preflight` (default), `run --reviewed`, and `cleanup --run-id UUID` modes. Implementation work performed only read-only hosted catalog/configuration/preservation queries. It did not create an Auth account, issue a session, change a profile, execute a hosted cleanup, or establish hosted JWT acceptance.

Runtime inputs are `ANTE_ACCEPTANCE_PUBLIC_KEY` and `ANTE_ACCEPTANCE_SECRET_KEY`, or their `_FILE` alternatives containing only the key. File inputs must be regular owner-private files. Only modern `sb_publishable_`/`sb_secret_` pairs are accepted; no key is taken from command-line arguments. Supply these from the controller's server-only environment. The fixed origin is `https://yxilmwxptfnebnjsikwo.supabase.co`; the fixed CLI is `/opt/homebrew/bin/supabase` version 2.118.0. Installed Supabase JS is 2.106.0.

```sh
node scripts/acceptance/hosted-account-jwt.mjs preflight
# After independent review, controller only:
node scripts/acceptance/hosted-account-jwt.mjs run --reviewed
# Exact journal recovery; never starts another account or resumes assertions:
node scripts/acceptance/hosted-account-jwt.mjs cleanup --run-id RUN_UUID
```

Default durable state is `~/.local/state/ante-acceptance/hosted-account-jwt/` (0700), with exclusively created append-only per-run journals (0600), fsynced before/after mutations, and an exclusive run lock. `ANTE_ACCEPTANCE_STATE_DIR` may point to another private directory outside the checkout. A normal exit releases only the lock; journal history is retained. `cleanup --recover-lock --run-id RUN_UUID` can reclaim a lock only when its same-host PID is definitely absent. Torn journals, live/unknown locks, uncertain ownership, unresolved earlier runs and schema drift fail closed. A torn journal requires controller diagnosis rather than automatic truncation or replacement.

A create request is dispatched at most once per intended address. An uncertain result is reconciled only by exact address, server-set run marker, ID and the five-minute creation window. Zero matches after an uncertain create retain an unresolved journal; the runner does not interpret immediate absence as proof that an in-flight create cannot complete. Recovery never replaces the account. Successful admin responses are acknowledged durably before subsequent SQL.

Each recovery invocation permits at most one further exact-ID Auth deletion per fixture, only after fresh ownership, profile-absence, catalog and protected-reference checks. It resets that invocation's delete counters in a new journal entry; previous attempts remain in the append-only history. Creation counters are never reset. An ambiguous delete response is resolved by exact absence, and a still-present user retains a failed cleanup state.

Auth configuration preflight writes only inert local sentinels in a private temporary directory and runs `config pull --dry-run --output-format json`. It requires explicit remote `false` for all six CLI-known Auth hooks and CAPTCHA, plus explicit remote `true` for email authentication. It never treats a missing diff field as disabled. Raw remote configuration stays in memory; only the resulting pass/fail is used. No configuration is pushed. A read-only admin lookup of a DB-proven absent UUID verifies the server credential without listing users.

The runner pins the reviewed catalog SHA-256 `6ecb70845fc10d9d80ba6f43b2810300d934fb6889fe880fde2146ff5d6799a5`. The fingerprint covers relevant schema/table/column ACLs and defaults, functions and trigger definitions, policies, role inheritance, and every foreign key to Auth users/profiles from any schema. Explicit effective-grant checks cover all four account RPCs, all seven photo RPCs, and direct profile name/email/timestamp writes. A change requires read-only review and a source update; there is no runtime override or automatic repinning.

Preservation scans compute ordered complete-row SHA-256 hashes and counts inside PostgreSQL for all 22 currently discovered public/private application and Storage metadata tables. They never scan Auth password/token records. The guarded profile DELETE rechecks the catalog fingerprint, locks the exact Auth/profile rows, verifies exact ownership and all reviewed protected references, and deletes only the exact owned profile in one transaction. Protected references include cascading payment/notification FKs, photo heads/operations and Storage owner/key paths without Auth FKs. The final Auth delete has a fresh protected-reference check after its catalog check. No protected child is deleted.

All SDK traffic has a fixed-origin endpoint/body allowlist and separate public/admin credentials. Request bodies and tokens remain in memory. The 10-second request deadline includes response-body consumption; account requests are capped at 40, Auth/session requests at 16, creates/deletes at two per invocation. SDK retries cannot dispatch repeated Auth mutations. CLI calls have a 20-second process deadline, SQL an eight-second statement timeout and three-second lock timeout. The five-minute active deadline never exempts cleanup.

The fixed JSON stdout receipt contains only project/run IDs, fixture identity/state, counters, sanitized assertion status/code/pass values, outcome and journal path. Preservation fingerprints remain in the private journal. Unknown provider codes are recorded as `unclassified`; raw messages, stacks and provider records are never included. A failed assertion remains a failed run even when cleanup succeeds. A recovered cleanup is labelled `recovered`, never JWT acceptance. A successful revoked-access `getUser` remains an observation; refresh must yield an Auth refusal. No revoked-cookie or SSR-adapter proof is claimed.

Local validation: `node --test scripts/acceptance/hosted-account-jwt*.test.mjs` passes 19 tests, including actual PostgreSQL cleanup SQL on the existing `colima-ante-website-tests` helper. `pnpm typecheck` and targeted ESLint pass. The retained recovery environment was not accessed. Remaining execution gates are independent review, fresh complete runtime preflight with supplied credentials, and the controller's explicit reviewed run.
