# Whole-plan final review — Worker admission runtime correction

## Scope and fixed source

Reviewed `cf79985fd25c7a75a94a4db8ec885d872d47a74c..9e17e91e9811e1f836942d65d157a1ca8da08ff7`; current HEAD independently confirmed as the latter. Review package: `review-cf79985..9e17e91.diff` in this directory. Requirements: the 1 October Worker admission runtime fix plan, callback/account admission, email-auth and profile-photo contracts, goal origin/session constraints, and the explicit controller rulings in `progress.md` and the review brief. Used the requesting-code-review final reviewer rubric.

Read-only review of source and retained evidence. No test suite was repeated; no provider, secret, deployment, index, branch or tracked-file operation was performed. This report is the only written artifact.

## Strengths

- The actual fetch overrides `redirect` to `manual` after spreading caller options (`lib/server/bounded-provider-request.ts:52`), then rejects redirected/opaque/3xx responses before consuming acceptable provider data (`:70`). Callers cannot accidentally re-enable following. This repairs the evidenced installed-workerd incompatibility without creating a second credential-bearing dispatch.
- The singleton allowance is exact: an explicit true opt-in, HTTP 200, `Content-Range: 0-0/*`, and absent or literal `items` Range-Unit (`:68`). It does not waive encoding, body byte caps, Content-Length agreement, caller abort, empty-chunk bounds or the shared deadline. All HTTP 206 responses still fail.
- A full authored call-site scan finds opt-ins only in the function constrained to two fixed admission RPC names (`lib/server/callback-limit-store.ts:27`, `:46`) and the fixed resolver/manifest RPCs (`lib/server/profile-photo-store.ts:44`, `:173`). The exact admission union, caller resolver union and manifest parser remain mandatory. Storage upload/delete/read and the legacy profile SELECT remain default-deny for range metadata.
- Shared compatibility is preserved: caller/service credential selection, exact caller bearer, fixed URLs and immutable selection remain intact. The opt-in cannot turn Storage bytes into an accepted partial image. Ordinary entry/configuration remain unchanged, with no new diagnostic route, mode, dependency, Auth, schema, Pages, paid service or financial change in the reviewed range.
- The regression exercises production adapter code in actual workerd, with only the external provider synthetic. It verifies both admission endpoints, allowed/denied outcomes, absent/items metadata, strict JSON fields, forbidden intervals/totals/units/status and exactly one redirect-source dispatch. Separate photo tests retain both resolver passes, manifest acceptance and Storage/SELECT refusal. The recorded 384-test result and reported local generated-Worker route outcomes support the intended change without claiming hosted acceptance.

## Issues

### Critical

None.

### Important

None.

### Minor

No additional finding. The task review's disclosed Node DEP0205 warning and expected sanitized failure-path output remain non-blocking evidence noise; no unrelated dependency/logging change is required.

## Review checks and evidence limits

Commands executed from the website checkout included:

```sh
git diff --stat cf79985fd25c7a75a94a4db8ec885d872d47a74c..9e17e91e9811e1f836942d65d157a1ca8da08ff7
git diff cf79985fd25c7a75a94a4db8ec885d872d47a74c..9e17e91e9811e1f836942d65d157a1ca8da08ff7 -- lib/server/bounded-provider-request.ts lib/server/callback-limit-store.ts lib/server/profile-photo-store.ts
git diff cf79985fd25c7a75a94a4db8ec885d872d47a74c..9e17e91e9811e1f836942d65d157a1ca8da08ff7 -- .guidelines/design.md
rg -n 'boundedProviderRequest|allowPostgrestSingletonRange' lib app proxy.ts
cat worker-entry.mjs wrangler.jsonc
git rev-parse HEAD
git diff --check cf79985fd25c7a75a94a4db8ec885d872d47a74c..9e17e91e9811e1f836942d65d157a1ca8da08ff7
shasum -a 256 .open-next/worker.js .open-next/server-functions/default/handler.mjs .open-next/middleware/handler.mjs
rg -l 'allowPostgrestSingletonRange' .open-next/server-functions/default/handler.mjs .open-next/middleware/handler.mjs
```

Also read the complete review diff, plan, contracts, goal constraints, implementation report, task review, progress rulings and retained application-test summary; inspected full helper/adapters to evaluate the concrete shared-transport and parser boundary risks. Source outside the diff was limited to those interfaces and ordinary Worker entry/configuration.

`git diff --check` passed. Retained test output records 33 passing files and 384 passing tests. The three current generated artifact hashes exactly match the implementation report: worker `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`, default handler `01d5a9011c02a1b55b8b6978b374e53e633fbf79bb90c39c1cd7684ad1c1259c`, middleware `e0328a4dd625f65a1d8377778bfe6275301a50a9b159d1e14ef8300826591e80`. Both generated handlers contain the singleton policy identifier. This confirms artifact continuity only, not a new build or secret-exclusion scan. The report explicitly discloses that the last build preceded a comment-only change; the controller's final-source rebuild remains required.

Typecheck, scoped lint, public-only build, credential-byte exclusion, owned-process cleanup and local ordinary-Worker route behavior are retained implementer evidence, not independently rerun checks. The installed-runtime root cause and provider singleton metadata are supported by the bounded diagnostic/controller receipts described in that report; this reviewer made no live provider calls. Design text appropriately distinguishes observed original-image delivery from optimization and staging upload from accepted hosted behavior.

## Declined to judge

- New hosted direct-ingress, real email/session/browser-cookie and Free-plan resource acceptance: controller-owned later acceptance gates; no source-review claim can substitute for them.
- Historical gated photo publication/serving, legacy mutation behavior, payment/task/schema readiness and unrelated Auth redesign: outside this transport correction; unchanged controls and explicit activation gates must remain in force.
- Fresh verification of the historical Images delivery and deployed staging-state observations: documentation attributes dated controller evidence; this read-only source review does not re-probe those providers.

## Recommendations

Proceed with the controller-owned final public-only rebuild and bounded ordinary hosted correction acceptance. Keep staging explicitly unaccepted until that evidence passes, and retain the separate email/session/browser and photo activation gates.

## Assessment

**Ready to merge? Yes — source correction approved.**

The whole plan's implementation and interfaces satisfy the approved narrow correction, with no blocking findings. This verdict authorizes no hosted acceptance or mode activation: final rebuild and the controller deployment/acceptance gate remain outstanding.
