# Final whole-plan review

Reviewed `86856ee..a656a18` against `docs/superpowers/plans/2026-09-26-photo-boundary-worker-check.md`, its named resource-acceptance design, and the ledger ruling limiting this slice to sequential boundary screening and owned-process lifecycle.

## Strengths

- The seven-file slice leaves production validator, routes, limits, dependencies, provider configuration and photo activation untouched. Boundary mode adds exact-size metadata-padded inputs and maximum-area RGBA8/RGBA16/baseline/progressive fixtures without replacing quick mode.
- Offline tests independently check PNG structure, CRC, inflated lengths and padded-image decode; JPEG generation performs actual pinned-codec decode. Every boundary denial is followed by valid maximum-area recovery, with exact status/dimension/length checks and three warm repeats.
- Nonce readiness and selected-port refusal prevent an unrelated HTTP response satisfying startup. Process cleanup signals only the owned detached group and waits for disappearance before clean rebuilding.
- The revised orchestration removes the temporary route and rebuilds after an attempted diagnostic build, including failure; failed regeneration discards generated artifacts. Both ordinary and streamed requests observe interruption/deadline, and interruption during final cleanup preserves failure.
- The raw receipt contains all 16 stated sequential outcomes, fixture hashes and wall observations, plus two completed builds. Its language preserves the distinction between local screening and CPU, memory, concurrency or hosted acceptance. The task report explicitly locates the real Worker measurement at `9352e51` and the later synthetic lifecycle checks at `a656a18`.

## Issues

### Critical

None.

### Important

None within the scoped plan.

### Minor — all deferred items triaged

1. `tests/profile-photo-boundary-fixtures.test.ts:98`: `bytes.includes(marker)` does not prove SOF0/SOF2 marker placement. Keep as a nonblocking test-strengthening item: parse JPEG segments and assert the actual SOF when this corpus is extended. Explicit pinned encoder settings and successful independent decode support the current case, but the assertion alone would not catch a future baseline/progressive setting regression.
2. `tests/profile-photo-worker-process.test.ts:36`: the process test exercises a single child, not a live descendant or TERM-resistant descendant. Keep as nonblocking lifecycle coverage debt: add a synthetic descendant and exercise escalation before broadening this helper's responsibilities. Group-directed signalling and bounded polling are implemented; the successful real preview shutdown is corroborating evidence, not a synthetic escalation test.
3. `docs/superpowers/audits/2026-09-26-photo-boundary-worker-results.md:22`: the receipt omits known Node DEP0205 warnings present at raw-log lines 25 and 153. Keep as nonblocking documentation polish: mention the build-tool deprecation and that both builds completed. It does not undermine recorded image outcomes.

The earlier cleanup-interruption minor is resolved by `getAbortReason` after cleanup and its focused regression. No deferred item is silently dropped or upgraded to a merge blocker.

## Recommendations

Retain the three minor items for the next diagnostic extension. Preserve the current evidence labels and closed production gate; this merge is not full completion of the broader resource design.

## Declined to judge

- CPU profiling, total transient isolate-memory bounds, proven overlapping maximum-area validation and hosted CPU acceptance: explicitly subsequent work under the ledger ruling, with gaps retained in the durable receipt.
- The broader corpus matrix (grayscale, near-cap entropy, rotated/thin axes, further malformed cases, cold distributions and sustained concurrent waves): outside this bounded implementation plan; do not infer that the present cases cover it.
- Correctness, security and activation readiness of the prior production photo implementation: unchanged by this slice and explicitly excluded from this final review.
- Current provider state, credentials, deployments and platform-policy compliance of future activation: no provider operations or activation are part of this diagnostic-only slice.
- Concurrent uncommitted `docs/WEBSITE_BACKEND_GOAL.md` changes: outside the supplied commit range and left untouched.

## Assessment

**Ready to merge? Yes, for this diagnostic-only slice.**

The scoped plan is implemented, earlier blocking lifecycle findings are resolved, and the remaining findings are nonblocking verification/documentation improvements. This verdict does not open the production photo or hosted-resource acceptance gates.

Evidence: read the full slice/current changed code, plan and named spec, task report, both task reviews, and raw Worker transcript. The report records 11 focused tests, typecheck and lint passing after the fix; these were not redundantly rerun. No Worker run, build, provider operation, source/Git mutation or subagent dispatch occurred. A read-only artifact spot-check found no probe match in the available worker/manifest files; one optional manifest path was absent, so this is not reported as a fresh complete cleanup verification. The historical cleanup receipt remains the evidence for its run. This ignored report is the only file written.

## Controller decisions

Ruling: Proceed with already-authorized local verification without another approval step; implement only sequential boundary screening and process ownership now, with profiler/concurrency evidence still required. Cost if wrong: reversible diagnostic scripts and local CPU/build time; no deployment or production behavior changes.

The reviewer exclusions remain open verification work: this diagnostic slice does not establish CPU, peak memory, concurrency or hosted readiness, and it does not re-review prior production implementation. Deferred JPEG marker and descendant/escalation coverage remain explicit nonblocking follow-ups. DEP0205 is recorded as a known Node tooling warning; it did not change the observed boundary outcomes. No merge, push or activation was performed.
