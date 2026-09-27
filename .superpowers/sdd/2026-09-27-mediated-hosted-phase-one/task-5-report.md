# Task 5 integration report

Status: DONE, pending independent whole-package review. Source-only implementation on Task 4 base `0f69e49`. No actual credentials read, hosted runner executed, provider request, SQL application, login, deployment, serving-mode change or retained Docker resource change. Root owns the aggregate acceptance audit and plan/goal/design rulings; those files are excluded from this commit.

## Implemented scope

- New fixed `makeMediatedPort` connects the accepted HTTP transport, complete private sessions/independent jars, raw `dbQuery` cleanup and pinned production Storage adapter. Only `{catalog,backendCommit,adapterSha256}` reaches the historical adapter validator. Run query slots reserve separately; cleanup receives raw queries and reserves internally exactly once.
- `runMediatedAcceptance` freezes 24 website cases, 11 complete Storage matrices/308 ordinary denials, 16 Data exposures, two generation lifecycles, three friendship transitions, clear and 41 CLI reservations. The local happy path exactly uses 1,184 run + 29 initial cleanup reservations. No case skips, network retries, continuation, cap changes or borrowed cleanup budget.
- Reconciled identities precede preparation; every returned digest is durable before admission. Per controller ruling, the exact serialized preparation body and SHA256 derive from the durable immutable run/ordered fixture identities instead of a redundant journal field. Tests reconstruct them from a serialized/reloaded snapshot and reject unbound/duplicate identities.
- No-object denials/postconditions precede G1 upload. G2 remains prepared for cases 11–12; publication is bounded by the server lease with no renewal. Authoritative bind identity/manifest fields must match before prepare. Warmed ordinary leaks immediately fail into cleanup; exact saved website/Storage URLs are retained through revoke/regrant/clear.
- Every response asserts fixed status/body/complete PNG bytes and cache policy. Case 10 must change safe SSR cookies and token, with direct exact-token A equality before subsequent use. Late/lost website results and uncertain server failures retain uncertainty.
- Strict CLI accepts only preflight/run/cleanup and documented flags. Private files use owner-only regular/no-follow access. Pins validate current website/backend commits, adapter/postconditions hashes, both local bundles and exact hashed operational receipt files. No historical pin defaults or credential environment values. Default journal directory remains outside Git. Preflight writes separately under `preflights/` and performs only seven CLI reservations plus one Auth probe, with no preparation/fixture mutation.
- Explicit recovery marks unfinished crashed website intents uncertain before creating one immutable recovery epoch. Missing/invalid settlement is refused before consuming the epoch. Existing initial cleanup start remains bound. Final inventory is never called global quiescence proof.
- Receipts keep failures/cleanup/preservation/reserved-versus-observed counters separate and permanently mark trace/race/browser/resource/profile-deletion/overall gates `not_accepted`. Fake-port execution is `not_attested`; the explicit CLI identifies its path but does not itself attest deployed correctness.
- Added operator contract with exact schemas, private files, independent deployment/SQL/cache prerequisites, bounded commands and uncertainty recovery. Added the five mediated Node files to both scripts, leaving historical entries intact and using `--test-concurrency=1` to serialize disposable SQL tests.
- Material `.guidelines/design.md` update. One controller-authorized HTTP correction only: case 9 If-Modified-Since now exactly `Wed, 01 Jan 2020 00:00:00 GMT`; the unrelated cookie-expiry fixture retains its original 1970 value.

## RED evidence

1. `node --test scripts/acceptance/hosted-profile-photo-mediated-port.test.mjs`: initial expected missing integration exports/port, 16 tests, 1 pass/15 fail. This is missing-implementation RED, not a claimed behavioral rollback. `/tmp/ante-mediated-task5-red.log`.
2. Exact case-9 HTTP header regression: 1 selected test failed on actual 1970 versus specified 2020. `/tmp/ante-mediated-task5-header-red.log`.
3. Self-review bind receipt regression asserted that a foreign successful bind acknowledgment cannot dispatch prepare: 1 failed test (one prepare was dispatched). `/tmp/ante-mediated-task5-bind-red.log`. Fixed by validating full bind authority/manifest before advancing.
4. Interrupted recovery export was absent before implementing the explicit uncertainty/epoch transition. `/tmp/ante-mediated-task5-guard-red.log`. No replay or budget increase added.

## GREEN and required integration (one broad pass)

| Check | Actual result | Log |
| --- | --- | --- |
| Focused integration | 25/25 pass | `/tmp/ante-mediated-task5-focused3.log` |
| `pnpm test:acceptance:local` | 151/151 pass, no skips; sequential files; 56.0 s | `/tmp/ante-mediated-task5-acceptance.log` |
| `pnpm test` | 366/366 pass across 32 files | `/tmp/ante-mediated-task5-vitest.log` |
| `pnpm typecheck` | exit 0 | `/tmp/ante-mediated-task5-typecheck.log` |
| Scoped ESLint, mediated `.mjs` plus both new `.ts` tests | exit 0 | `/tmp/ante-mediated-task5-eslint.log` |
| `pnpm build:worker` | exit 0, OpenNext build complete | `/tmp/ante-mediated-task5-worker-build.log` |
| Installed Wrangler deploy help | dry-run explicitly compiles/checks without upload | `/tmp/ante-mediated-task5-wrangler-help.log` |
| Separate Wrangler deploy **dry-run** | exit 0, `--dry-run: exiting now.` | `/tmp/ante-mediated-task5-preparation-build.log` |
| Ordinary shippable output scan | 1,810 files, zero forbidden hits | `/tmp/ante-mediated-task5-bundle-scan.log` |
| Separate preparation output | expected route and three `ANTE_ACCEPTANCE_` names present; synthetic literals absent | same scan log |
| Historical runners + accepted production source/config diff against base | empty | direct `git diff --exit-code` |
| Paired backend checkout status | clean | direct `git status --short` |
| `git diff --check` | exit 0 | direct check |

The final unrelated cookie-expiry fixture restoration changed test data only after the broad pass. Focused website-header/direct-HTTPS tests were rerun, 2/2 passed, plus ESLint for that file and diff check. `/tmp/ante-mediated-task5-header-final.log`, `/tmp/ante-mediated-task5-header-eslint.log`. No broad tests/builds were repeated.

Docker tests used only `unix:///Users/daniel/.colima/ante-website-tests/docker.sock` / `colima-ante-website-tests`; the paired harness created/removed exact ephemeral containers, as recorded in the acceptance log. A final read-only filtered inventory found no `ante-mediated-sql-test-*` container. No retained containers/networks/volumes/contexts were changed.

## Build and warning details

Wrangler 4.139.0 help says dry-run compiles/checks without uploading. Installed CLI source has `const accountId = dryRun ? void 0 : await requireAuth(config2)` before the build path. No login or real deploy was attempted. Command was exactly `pnpm exec wrangler deploy --dry-run --config wrangler.mediated-acceptance.jsonc --outdir .superpowers/mediated-acceptance-build`, with telemetry disabled and synthetic secret environment markers. Wrangler reports estimated `Total Upload: 13862.08 KiB / gzip: 3219.10 KiB`; this is a local estimate, not an upload or a claim of account/runtime viability.

The first deliberately broad scan of all `.next` and `.open-next` files found two non-deployable cache hits: `.next/cache/.tsbuildinfo` mentions the preparation test/module, and one Turbopack `.sst` contains a synthetic legacy-secret marker. The subsequent explicit shippable-artifact scan of `.open-next`, `.next/server` and `.next/static` found zero preparation-route/module/operator-name or synthetic-secret hits. These cache findings are retained here rather than described as a clean whole-filesystem scan. No real credential file was opened for scanning. Separate output contains the preparation route and operator names but no synthetic secret literals.

Preserved pre-existing warnings:

- Backend adapter import: `MODULE_TYPELESS_PACKAGE_JSON`, reparsed as ES module; no paired backend package edit.
- Vitest/Next build: `DEP0205 module.register() is deprecated`; no dependency/runtime change.
- OpenNext: Node.js middleware support is experimental in Cloudflare and not officially maintained by OpenNext maintainers.

## Failure coverage and remaining boundary

The integration suite covers preparation failure after identities, refresh-cookie and refreshed identity mismatch, lease expiry, unknown ingress digest, 900-second run exhaustion, failed cleanup, unknown authority operation, lost website completion, warm ordinary leak, broken photo cache policy, failed mediated postconditions, foreign bind acknowledgment, unknown CLI operation, absent inputs, real source/bundle pin mismatch, receipt shape/hash/identity/timestamp/private-mode/symlink rejection, later settlement, import safety and interrupted-run recovery. Existing Task 1–4 suites retain detailed ledger, transport, SDK and actual disposable PostgreSQL preservation/recovery coverage.

Local checks establish source behavior only. No hosted run, remote SQL/config/catalog state, intended real origin/account/deployment, deployed cache bypass, live sessions, actual ingress stability, runtime limits, traces/races/browser behavior or overall acceptance is claimed. Required next step is root-owned independent whole-package review, then separately authorized operator prerequisites; this implementation/report authorizes no provider action.
