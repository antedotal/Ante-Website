# Mediated photo HTTP harness: source acceptance

27 September 2026. Implementation through `6251eae`; **source accepted after independent whole-package review and scoped fix re-review**. This audit covers local source and build verification only. No provider run, SQL installation, Worker deployment or photo activation occurred in this package. The website backend goal remains incomplete.

## Scope and evidence

The [design](2026-09-27-mediated-hosted-phase-one-design.md), [five-task plan](../plans/2026-09-27-mediated-hosted-phase-one.md) and [operator contract](2026-09-27-mediated-hosted-phase-one-operator.md) define the runnable protocol. It uses three synthetic users, two immutable generations, 24 website cases, 308 direct Storage observations and 16 Data observations. Private durable journals reserve each operation before dispatch and retain uncertain outcomes. Cleanup is restricted to reconciled fixture ownership and checks preservation of 22 tables.

The run reserves 1,184 calls plus 29 initial-cleanup calls, including conservative capacity for installed SDK retries inside the Worker; these are ceilings, not observed hosted traffic. External runner retries are forbidden. A single explicit recovery epoch has its own immutable deadline and 29-call envelope. Phase-one success retains all 324 safe direct-response records. Render denials remain `capability_unverified`; generic HTTP 400 does not establish render support or resource safety.

| Task | Implementation and fix | Independent review disposition |
| --- | --- | --- |
| Protocol and journal | `aa3588e`, `91964f6` | Accepted after four fixes: canonical operation identity, uncertain website settlement, recoverable entity states and immutable recovery time |
| Isolated preparation handler | `2407f10`, `60da7d8` | Accepted after three fixes: empty Origin, escaped duplicate JSON keys and late body completion |
| HTTP, cookies and pinned SDK | `cb898c2`, `9bc5caa` | Accepted after foreign-origin cookie-jar and unbounded null-body transport fixes |
| Exact SQL and cleanup | `27eb31b`, `0f69e49` | Accepted after interrupted friendship teardown and exact timestamp fixes |
| Scenario, CLI and evidence | `9da17d6`, `0fcc994` | Accepted after adding complete durable direct-response evidence; journal schema 3 and receipt schema 2 reject incomplete older evidence |

The [implementation verification log](2026-09-27-mediated-hosted-phase-one-verification-log.md) retains detailed commands and successive results. Verification was performed by the implementation agents and checked against their reports in independent reviews. The controller did not rerun unchanged suites merely to duplicate their results.

| Verification | Result and scope |
| --- | --- |
| Final affected Node acceptance suite | **170/170**, zero failures or skips, after the final uncertainty fix |
| Application Vitest | **366/366**, 32 files; unchanged by the runner-only evidence fix |
| Typecheck and scoped ESLint | Passed; changed evidence modules linted again after the fix |
| Ordinary Worker build | Passed; production reader and configuration unchanged by this package |
| Separate preparation build | Wrangler 4.139.0 `deploy --dry-run` passed without authentication or upload |
| Ordinary shippable artifact scan | 1,810 files, zero preparation module/route/operator-variable or synthetic-secret hits |
| Separate acceptance artifact scan | Expected preparation route and variable names present; synthetic secret literals absent |
| Disposable PostgreSQL | Actual guarded SQL tested, including every cleanup dispatch interruption and lost acknowledgments; exact ephemeral containers removed |
| Preservation of prior work | Historical runner and production source/config diffs empty; paired backend checkout clean |

Local logs are `/tmp/ante-mediated-task5-{acceptance,vitest,typecheck,eslint,worker-build,wrangler-help,preparation-build,bundle-scan}.log` and `/tmp/ante-mediated-task5-fix1-{resumed-red,focused-green,acceptance,eslint}.log`. The broad Node passes progressed from 151 to 154 after durable evidence, then 170 after the final uncertainty fix. Final fix logs are `/tmp/ante-mediated-final-fix-{red,focused-green,acceptance,eslint}.log`. RED/GREEN evidence includes three initially failing durable-evidence regressions and their passing persisted/reloaded receipt checks. SQL tests used only `colima-ante-website-tests`; retained recovery environments were not modified.

The initial broad filesystem scan found preparation references in `.next/cache/.tsbuildinfo` and a synthetic legacy-secret marker in a Turbopack cache file. These are retained, non-shipped cache findings, not a clean whole-filesystem result. Scans of `.open-next`, `.next/server` and `.next/static` were clean. Existing warnings remain: backend adapter `MODULE_TYPELESS_PACKAGE_JSON`, Tailwind/Node `DEP0205`, and OpenNext's experimental Node middleware support.

Wrangler estimated 13,862.08 KiB uncompressed and 3,219.10 KiB gzip. The [current Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size), checked 27 September, specify 64 MiB uncompressed and no compressed-size limit. This local estimate is within that size ceiling; it proves neither deployment nor Free-plan CPU, memory or startup acceptance.

## Controller decisions

These decisions preserve the execution ledger's rulings, in chronological order. They are engineering choices for the fixed test protocol, not new product policies.

1. Reserve at the actual HTTP/query boundary exactly once. Orchestration supplies descriptors. A wrong boundary would undercount or double-count calls; tests check the exact envelope.
2. Reuse safe journal primitives where possible; retain small equivalent mechanics where historical validators prevent reuse. Cost: bounded duplication, rather than altering historical recovery behavior.
3. Reserve 26 internal Auth calls per website request for the installed SDK's possible refresh loops, raising the combined ceiling to 1,213. Cost: deliberately loose capacity; this does not dispatch extra calls.
4. Bind each direct observation to fixed matrix ID, key and lifecycle stage. Cost: an extra descriptor field; intentionally repeated URLs remain distinct planned observations.
5. Keep cleanup blocking at the top level while preserving each entity's actual authority state. Cost if wrong: reconciliation errors; partial-state recovery tests cover the boundary.
6. Allow an absent Origin for the Node preparation client, but require an exact match when supplied. Cost: the operator token and pinned URL remain necessary independent controls.
7. Reject escaped JSON in the fixed ASCII preparation grammar. Cost: equivalent escaped requests are rejected; the fixed operator serializer emits none.
8. Store complete provider sessions alongside fixture passwords; persist a once-bound initial cleanup start. Cost: a narrow private-state amendment; process recreation cannot renew the deadline.
9. Use authenticated full-object GET for cleanup ownership and absence checks, and exact-key DELETE for removal. Cost: bounded readback traffic; an info-only response cannot substitute for byte/hash ownership.
10. Represent actual bigint admission IDs as canonical decimal strings and align the synthetic transformation version. Cost: strict protocol compatibility; no sequence reset or numeric precision loss is allowed.
11. Treat CLI slot 20 as owned-state inventory, not global quiescence proof. Cost: independent settlement evidence remains necessary for uncertain operations.
12. During cleanup `delete_intent`, accept the exact owned friendship in accepted or rejected state. Cost if wrong: an ownership mistake would be destructive; normal scenario guards and exact fixture predicates remain enforced. Compare Auth timestamps at PostgreSQL microsecond precision.
13. Match case 9's If-Modified-Since header to the specified 2020 value. Cost: a narrow fixture correction, with a failing-then-passing regression.
14. Derive the preparation body and hash from durable immutable run and ordered fixture identities. Cost: no redundant stored hash; reload tests prove exact reconstruction before dispatch.
15. Retain all 324 safe response records, require exact unique completeness, and label render capability unverified. Cost: larger bounded journal/receipt and an intentional schema break; no additional provider calls.

## Final review and remaining acceptance

Fresh whole-package review of `1cec2ea..0fcc994` found one P2: a received 503 followed by rejected cookies could throw before the port persisted website uncertainty. Initial cleanup could then bypass the required later settlement. The reviewer reproduced this with the real transport/cookie modules and a synthetic response; no provider was contacted. The controller verified the HTTP-to-port-to-cleanup ordering and dispatched one fix wave with a regression for the response/cookie/cleanup combination. No other actionable findings were raised. Commit `6251eae` now persists received 5xx/429 uncertainty atomically with the observed-response count before cookie processing, removing the later redundant port marker. Sixteen regressions failed before the fix and pass afterward: both statuses crossed with unexpected, malformed, deleted and foreign-identity cookies, at the persisted/reloaded HTTP journal and full scenario/cleanup boundaries. Initial cleanup skips admission deletion and remains incomplete without settlement. The affected full Node suite passes 170/170. The independent scoped review of `0fcc994..6251eae` marked the finding addressed, found no new breakage and approved source completion. It inspected the real private-journal reload and full cleanup regressions plus RED/GREEN logs. No residual actionable findings remain; unchanged application/build evidence is reused.

The reviewer declined to establish hosted SQL/ACL/Auth/catalog state; correspondence of supplied pins to real account/origin/deployment/cache settings; deployed ingress/HMAC stability; genuine hosted sessions and scenario outcomes; internal request traces; controlled races and caller/target deletion; real-browser cookies/cache/navigation; runtime CPU/memory/startup/decoder limits or render capability; exhaustive Auth document and arbitrary-image compatibility; or a second wholesale review of the preceding unchanged production reader. Controller disposition: all remain outside this package's acceptance claim. Operational and stronger-test gates must establish the first eight categories; the fixed fixture tests do not claim exhaustive document/media coverage, and the previous reader retains its separate review record. None is silently treated as passed.

Hosted execution remains separate. Follow the operator contract only after intended-account access, actual origin/deployment pins, reviewed backend SQL installation and postconditions, cache configuration, private operator inputs and quiescence/settlement prerequisites are established. The existing Cloudflare login request is pending; no replacement account or guessed hostname is authorized by this audit.

Even a future `phase_one_http_passed` receipt leaves phase traces, controlled races, browser sessions, resources, caller/target deletion and overall acceptance `not_accepted`. Preserve historical failed cached-byte receipts and the closed photo-serving mode. HEIC/1080p normalization, photo publication and retention cleanup, task authority deployment, email delivery acceptance and approved Stripe consent/customer ownership remain broader unfinished goal requirements. This harness does not resolve them.
