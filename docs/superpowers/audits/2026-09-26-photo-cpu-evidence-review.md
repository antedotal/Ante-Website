# Local photo CPU evidence review — 26 September 2026

Conclusion: the seven requested files are present and internally support a narrow successful local profiling receipt. All request results and published sampled timing values agree with the raw artifacts. Keep hosted CPU, per-invocation CPU, concurrency, worst-case input and isolate-memory acceptance open. No reruns, providers, source audit or permanent repository changes were performed for this review.

## Verified evidence and corrections

- `cdp-diagnostic.json` records a Worker execution context `193096353` on target `ff711571-8fa9-4058-9f3b-e5f7e4a76095`; evaluation in that same context returns UUID nonce `b47dd6c4-b77c-4d3b-85f3-38434795574a`. Readiness GET records `nonceMatched: true`, and every outcome records `nonceMatches: true`. This supports the driver's reported app-context check. The expected nonce and raw GET/POST bodies are not separately preserved in the reviewed files, so exact expected-versus-returned equality is recorded by the driver rather than independently reconstructible here.
- `Profiler.enable` and `Profiler.start` entries labelled `reply` contain command-shaped objects (`id`, `method`, `params`), not conventional response acknowledgements (`result`/`error`). Do not describe those fields as retained exact CDP success replies. The actual 64-node, 221-sample profile remains direct evidence that profiling produced data. The stop entry retains counts, not the full CDP envelope; the raw profile is retained separately.
- All five outcomes are HTTP 200, nonce match true, 2000 × 2000 pixels and 43,271 bytes. Worker wall observations are exactly 86, 67, 70, 64 and 64 ms; client wall observations round to the receipt's 93.9, 72.3, 74.8, 69.6 and 67.5 ms. These remain wall observations, not CPU measurements.
- Recomputed from raw node IDs, samples and time deltas: 324.295 ms non-idle/non-GC sampled attribution, 33.638 ms GC and 149.325 ms idle. Their sum is **507.258 ms**, while `endTime - startTime` is **511.114 ms**. Add that the remaining **3.856 ms** of the profile window is not represented by sample deltas; do not imply the three categories exhaust the window. There are 221 deltas, all nonnegative, matching 221 samples. The node hit-count sum is 219, so use the sample array for sample count and arithmetic.
- Every listed top leaf-function timing recomputes exactly. The aggregation is by function name, not unique source frame; especially the unnamed category may combine distinct frames. WASM URLs are all `wasm://wasm/000b0d82`. Other URLs are only `worker-entry.js`, Node internal stream identifiers or empty. Precise codec/source attribution is not established by these names.
- `run.json` supports the stated fixture metadata, commit, lock hash, Node/Wrangler/OpenNext versions and machine metadata. The fixture itself was outside this bounded review, so its bytes/hash were not independently revalidated. The current receipt's fixture metadata link points at an earlier-run directory (`/tmp/ante-photo-cpu-20260926/run.json`); change that link to the successful run's metadata or its durable copy.
- `cleanup.json` reports route absence, completed clean build and absence from the artifact. This review did not recheck listeners, source tree, build outputs, earlier attempts, driver behavior, additional version claims, absence of provider operations or commit ancestry. Keep those as reported earlier-run evidence rather than conclusions of this bounded review.

## Retention and scope

Reviewed structured files contain profiling metadata, function names, synthetic fixture identifiers, observed timings, loopback ports and ephemeral diagnostic IDs/nonce. No credentials, bearer tokens, cookies, actual photo bytes, personal photo data or customer identifiers were found. The nonce is a temporary diagnostic correlation ID, not an authentication credential. The raw profile contains no absolute local filesystem paths. These six structured artifacts are suitable for durable evidence retention under this task's synthetic-data scope. The receipt contains local absolute links and should have those converted to durable relative evidence links when copied.

Recommended: retain all six small structured artifacts so both run provenance and application-context evidence accompany the raw data. Minimal raw profile + outcomes + summary is 15,529 bytes, but omits context/provenance; all six together are only 17,841 bytes.

| Artifact | Bytes | Purpose |
| --- | ---: | --- |
| `photo-validation.cpuprofile` | 13,579 | Recompute sampled timing and inspect attribution |
| `outcomes.json` | 971 | Five request results and wall observations |
| `summary.json` | 979 | Published derived values |
| `run.json` | 543 | Fixture and local runtime provenance |
| `cdp-diagnostic.json` | 1,682 | Explicit app-context nonce evidence, with reply caveat above |
| `cleanup.json` | 87 | Driver-reported cleanup receipt |
| `/tmp/ante-photo-cpu-measurement-20260926.md` | 7,356 | Narrative receipt before corrections |

The existing limitations are appropriate: a sparse, highly compressible maximum-area RGBA16 PNG on one local machine, sequential requests, readiness-warmed isolate, no near-cap entropy/JPEG/concurrency/full authenticated route coverage, no peak memory measurement, and no hosted resource-limit pass. Avoid dividing aggregate sampled attribution by five or presenting it as production request CPU.
