# Mediated phase-one operator contract

Source package only, pending independent whole-package review. No current hosted access, deployed artifact, SQL cutover, enabled serving mode or overall acceptance is claimed. Local synthetic tests are runner-safety evidence. A successful explicit run can establish only `phase_one_http_passed`; phase traces, controlled races, real browsers, resources, profile-deletion transitions and overall acceptance remain `not_accepted`.

## Independent prerequisites

An operator must independently approve/apply the mediated SQL release and all dependencies, confirm its 14 exact postconditions and post-cutover catalog, select the intended HTTPS origin and isolated Worker account/deployment, configure the exact `/api/profiles/*/photo` cache bypass, provision the separate preparation build with fresh run values, and attest exclusive fixture ingress plus stopped profile and other admission producers. Public Pages, production secrets and ordinary mode settings must remain unchanged. The runner does not install/rollback SQL, configure or deploy Workers, change cache rules, authenticate a CLI, rotate secrets, stop schedulers, reset sequences or enable serving.

The isolated preparation artifact requires independently supplied `ANTE_ACCEPTANCE_RUN_ID`, `ANTE_ACCEPTANCE_ORIGIN`, `ANTE_ACCEPTANCE_OPERATOR_TOKEN` (64 lowercase hexadecimal characters), a unique run `ANTE_AUTH_LIMIT_HMAC_SECRET` of at least 32 UTF-8 bytes, and `ANTE_AUTH_INGRESS=cloudflare`. The runner never loads that HMAC secret. Do not use preview URLs or a guessed hostname. Preparation and website calls use the same direct Node HTTPS pool; this does not prove stable ingress. Unknown admissions cause failure and are never adopted or deleted.

## Private inputs and exact pin schema

Use owner-only regular files (0600; no symlinks) outside Git for credentials, pins and receipts. State defaults to `~/.local/state/ante-acceptance/hosted-profile-photo-mediated` (0700 with 0600 journals/locks). Supply the publishable key, service secret key and operator token in separate files. No credential environment values or historical pin defaults are accepted. Operator examples below name shell variables that the operator must populate with file paths; they contain no hostnames or credentials.

The pins JSON has exactly these eleven fields, with no extras:

```text
websiteCommit                 40 lowercase hex; actual website HEAD
backendCommit                 40 lowercase hex; actual paired backend HEAD
adapterSha256                 SHA256 of supabase/functions/_shared/profilePhotoAssetStore.ts
releaseSha256                 SHA256 of supabase/releases/profile-photo-mediated-readers/postconditions.sql
catalog                       fresh post-cutover catalog SHA256
ordinaryBundleSha256          SHA256 of the selected ordinary local Worker entry artifact
acceptanceBundleSha256        SHA256 of the separate local preparation Worker entry artifact
origin                        exact intended HTTPS origin, with no slash/path/query
deploymentId                 exact isolated Worker deployment identifier
cacheReceiptSha256            SHA256 of original cache receipt file bytes
quiescenceReceiptSha256        SHA256 of original operational receipt file bytes
```

All SHA256 values are 64 lowercase hex. The backend location is the reviewed paired checkout `/Users/daniel/.codex/worktrees/ante-web-first-foundation/Ante`; the website source pin is checked against this runner's checkout. The adapter receives only `{catalog,backendCommit,adapterSha256}`. The release hash identifies the exact postconditions source; it does not claim SQL was applied. Bundle hashes identify local artifacts; deployment/configuration correspondence remains an explicit operator attestation.

Every ordinary receipt has exact base fields `{run_id,origin,deployment_id,issued_at}`. Bind the planned fresh run UUID, pinned origin and deployment; use a valid timestamp no later than verification time. The run UUID must be independently configured in the preparation artifact before running. Do not reuse it, even after cleanup.

The cache receipt additionally has exactly:

```text
website_commit, backend_commit, ordinary_bundle_sha256, acceptance_bundle_sha256,
release_sha256, catalog, installed_configuration_verified:true,
profile_photo_cache_bypass:true
```

These identity values must equal the pins. The operational quiescence receipt additionally has exactly:

```text
exclusive_fixture_ingress:true, profile_admission_producers_stopped:true,
other_admission_producers_stopped:true
```

Both original file hashes must equal their respective pins. The boolean attestations must be true. These are fresh run-bound operator assertions, not runner-observed provider proof; the runner checks schema, identity, timestamp and hash and then independently performs read-only inventories.

## Local source verification

Use the dedicated disposable PostgreSQL daemon only: `DOCKER_HOST=unix:///Users/daniel/.colima/ante-website-tests/docker.sock`, Docker context `colima-ante-website-tests`. The paired backend harness owns and removes its ephemeral containers. Do not touch retained containers, networks, volumes or contexts.

```sh
pnpm test:acceptance:mediated
pnpm test:acceptance:local
pnpm test
pnpm typecheck
pnpm exec eslint scripts/acceptance/hosted-profile-photo-mediated*.mjs scripts/acceptance/mediated-preparation-worker.mjs tests/mediated-preparation.test.ts tests/mediated-session-cookies.test.ts
pnpm build:worker
pnpm exec wrangler deploy --help
pnpm exec wrangler deploy --dry-run --config wrangler.mediated-acceptance.jsonc --outdir .superpowers/mediated-acceptance-build
```

The last command is permitted only after installed help confirms compile/check without upload and local installed source confirms dry-run skips authentication. If unavailable, stop and report the artifact-build limitation; do not log in or deploy. Do not pass a secrets file. Disable telemetry and use synthetic secret markers for build checks. Scan ordinary `.open-next`/`.next` output for the preparation route/module, `ANTE_ACCEPTANCE_` names and synthetic secret literals; they must be absent. The separate bundle must contain the intended preparation wrapper. Normal build output is excluded from Git; never commit generated bundles or runtime secrets. These commands authorize no hosted runner execution.

## Explicit provider commands (operator only)

Every command requires a separately reviewed real input set. `preflight` is provider-read-only, reserves at most 7 CLI + 1 Auth probe, and never calls preparation. It writes its own private journal under `preflights/` so the planned UUID is not consumed as a run. `run --reviewed` repeats preflight, creates the private run journal and never resumes a failed scenario.

```sh
node scripts/acceptance/hosted-profile-photo-mediated.mjs preflight \
  --run-id "$RUN_ID" --pins "$PINS" \
  --public-key-file "$PUBLIC_KEY_FILE" --secret-key-file "$SECRET_KEY_FILE" \
  --cache-receipt "$CACHE_RECEIPT" --quiescence-receipt "$QUIESCENCE_RECEIPT" \
  --ordinary-bundle "$ORDINARY_BUNDLE" --acceptance-bundle "$ACCEPTANCE_BUNDLE"

node scripts/acceptance/hosted-profile-photo-mediated.mjs run --reviewed \
  --run-id "$RUN_ID" --pins "$PINS" \
  --public-key-file "$PUBLIC_KEY_FILE" --secret-key-file "$SECRET_KEY_FILE" \
  --operator-token-file "$OPERATOR_TOKEN_FILE" \
  --cache-receipt "$CACHE_RECEIPT" --quiescence-receipt "$QUIESCENCE_RECEIPT" \
  --ordinary-bundle "$ORDINARY_BUNDLE" --acceptance-bundle "$ACCEPTANCE_BUNDLE"
```

An optional `--state-dir` must resolve outside this checkout. There are exactly 24 website requests, 11 full direct Storage matrices (308 requests), 16 Data exposure checks, two reserve/bind/prepare/upload/readback/publish lifecycles, two explicit authenticated service warm reads, three friendship transitions and one clear. All website requests retain one exact saved URL. Case 9 uses `If-Modified-Since: Wed, 01 Jan 2020 00:00:00 GMT`. A warmed ordinary leak immediately fails into cleanup; no retry, wait, cache-busting query or header change is permitted.

All identities are reconciled before preparation. Its exact body and SHA256 derive from already-durable run ID and ordered A/B/C UUIDs; preparation intent precedes dispatch. All four returned distinct digests are durable before website admission. G2 remains prepared/unpublished for cases 11–12 and must be published within its unchanged 120-second lease; no renewal/re-reservation occurs. Case 10 induces client expiry only and case 11 uses the changed real SSR cookies, after one direct exact-token identity check updates A's in-memory session. This is HTTP-cookie and sampled Auth-body compatibility, not real-browser or exhaustive user-document acceptance.

The run ceiling is 1,184: direct Auth 11, Data 25, Storage 314, preparation 1, website 24, reserved Worker Auth 624/Data 120/Storage 24, CLI 41. Cleanup independently reserves at most 29: Auth 3, Storage 6, CLI 20. Initial combined ceiling is 1,213. Run dispatch stops after 900 seconds. Initial cleanup binds `cleanupStartedAt` durably before its first operation and has 300 seconds; reconstruction cannot extend it. Observed external completions are separate from conservative Worker envelopes, which are not traces. Every photo reserves 26 Worker Auth calls, including early denials; favorable SDK behavior never reclaims reservations.

## Failure and uncertainty recovery

Keep the private journal. An assertion failure and a cleanup failure remain distinct. Never resume the scenario, recreate users/assets, replay mutations or delete unknown rows. Cleanup proves exact ownership, guarded metadata teardown, authenticated full-object bytes, protected references, owned admissions, full 22-table row fingerprints and catalog. Sequence advancement is outside the historical table-row fingerprint definition; never reset sequences. Final CLI slot 20 observes owned inventory and admission count, not global quiescence or settled in-flight work.

Uncertain website requests permanently require a later settlement. The operator must independently close the isolated Worker to test traffic and establish that website calls and admission writes have settled. The private settlement JSON contains exactly:

```text
run_id, origin, deployment_id, closed_to_test_traffic:true,
website_calls_settled:true, admission_writes_settled:true, issued_at
```

Its timestamp must follow the journal's uncertainty timestamp. The runner hashes original bytes and records that hash with the immutable bound receipt. No timeout, cancellation, sleep or global activity snapshot substitutes for it. If the process crashed with an unfinished website intent, cleanup first durably marks uncertainty; supply a later settlement before the one recovery epoch is consumed. Missing/invalid files fail before that epoch is minted. Unknown admissions remain untouchable even with settlement.

```sh
node scripts/acceptance/hosted-profile-photo-mediated.mjs cleanup \
  --run-id "$RUN_ID" --pins "$PINS" \
  --public-key-file "$PUBLIC_KEY_FILE" --secret-key-file "$SECRET_KEY_FILE" \
  --cache-receipt "$CACHE_RECEIPT" --quiescence-receipt "$QUIESCENCE_RECEIPT" \
  --ordinary-bundle "$ORDINARY_BUNDLE" --acceptance-bundle "$ACCEPTANCE_BUNDLE" \
  --settlement-receipt "$SETTLEMENT_RECEIPT"
```

Omit `--settlement-receipt` only when no website effect is uncertain. Add `--recover-lock` only for a proved dead same-host process; live locks are refused. There is one explicit new 300-second/29-call recovery epoch. Further attempts cannot reset it. Recovery cannot turn a failed scenario into a phase-one pass. A completed cleanup, phase-one HTTP pass and all remaining unaccepted gates are reported separately. A fake-port receipt says `execution:not_attested`; only the explicit CLI identifies its execution path, and neither label alone attests deployment or overall acceptance.


## Retained direct response evidence

Journal schema version 3 and output receipt version 2 include `directObservations`: at most 324 append-only rows, each containing its fixed dispatch `descriptor`, numeric HTTP `status`, and checked `result` (`denied` or `empty_list`). Only a Storage list response with status 200 and an exact empty array can produce `empty_list`; denial statuses are 400/401/403/404/406. Each row requires its unique reserved run descriptor and completed-response counter. No fixture IDs, object keys, URLs, response bodies or provider messages enter these records.

The 88 render rows additionally retain `capability:capability_unverified`. A generic 400 or any other accepted denial does not establish an unsupported endpoint, a working transformation or resource proof. Phase-one success requires exactly all 308 distinct Storage matrix descriptors and all 16 distinct Data exposure/boundary descriptors, alongside the existing scenario, budget and cleanup checks. Missing, duplicate or altered evidence is rejected on validation/reload; failed runs retain only their successfully checked prefix. Earlier journal schemas fail closed and are not silently migrated.
