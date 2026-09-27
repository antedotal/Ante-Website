# Bounded profile photo Auth — local acceptance

27 September 2026. Website implementation `4b93406`, review corrections `d5a8018`; plan `5b41294`. Paired backend design `e028930`, review/admission correction `707e0d2`. This is source acceptance only. No provider calls, credentials, deployment, SQL/Storage changes or serving mode changes were part of this slice.

## Result

Photo session Auth now uses a bounded raw transport underneath the existing shared sanitizer. Successful JSON is fully buffered at a maximum of 65,536 bytes. Each network/body operation has a ten-second deadline; error recognition retains the existing 2,048-byte/one-second window and safe revoked-session classification. Redirects, partial success (206 or Content-Range), malformed/oversized JSON and incorrect declared lengths fail closed. Known error status survives an error-body timeout; explicit caller abort remains a transport failure.

One thirty-second deadline bounds initial photo verification, including SDK initialization/refresh and exact-token getUser, and request/parent abort may end it sooner. Cancellation races do not depend on fetch, body reads or cancellation promises cooperating. Later SDK retries cannot start network calls after the owning signal aborts. Already-sent provider requests and SDK promises cannot be forcibly retracted. Successful SSR refresh cookies remain attached only after verified identity; failed verification discards provisional cookies. Unrelated Auth clients keep their default behavior.

## Evidence and review

Initial tests reproduced four session stall/abort failures before implementation; the missing transport module was a suite-loading error, not claimed as a behavior assertion. Subsequent targeted regressions reproduced configuration error leakage and malformed error-length status loss before correction.

Independent task review found two additional issues: valid JSON in a partial response was accepted, and HTTP403 headers arriving at9.5seconds with a stalled body lost their status at the ten-second deadline. Three intended assertions failed before their fixes. Scoped re-review approved both corrections; explicit abort, body cancellation and timer cleanup are covered. Final independent integration review inspected transport, session, shared defaults, route/SSR and installed SDK retry/cookie behavior and found no actionable important issue.

Final verification on `d5a8018`:

- 70 focused tests passed; TypeScript and scoped ESLint passed.
- Controller canonical `pnpm test`:29files,268tests passed, exit0.
- Controller `pnpm build:worker`:exit0, including Next production build/typecheck and the OpenNext Worker bundle. Earlier standalone `pnpm build` also passed before review fixes.
- `git diff --check` passed. Expected denial test logs contain fixed messages, not provider details. Builds retain the existing Node DEP0205 deprecation warning and OpenNext experimental Node middleware warning; those are runtime/deployment caveats, not hosted acceptance.

No browser, real-session payload compatibility, deployed Worker, CPU/memory or CDN acceptance is implied by these checks.

## Next work

Follow the [mediated-reader design](../../../../Ante/docs/superpowers/audits/2026-09-27-server-mediated-profile-read-design.md): add the service-only frozen-manifest RPC and prospective direct Storage closure, bounded admission under a route-entry deadline, exact immutable byte/hash validation, and final caller/token/current-generation checks before returning bytes. This requires a separate implementation plan; the present thirty-second session timer is not the complete route deadline.

Keep all photo serving/upload gates closed until the guarded empty-bucket cutover and hosted direct-cache isolation, website authorization/races and Worker resource/cookie tests pass. Historical failed direct-reader receipts remain failures. Cloudflare CLI access is still pending; the user was asked to log in without sharing a token. No blind repeat of the old hosted runner.
