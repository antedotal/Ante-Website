# Local Worker photo scope overlap result

26 September 2026. Base revision `650e496e7c4f9c115fdbaaebfc8111106ebe4938`; Node `v26.8.2`, pnpm `12.4.2`, Next `16.3.3`, OpenNext Cloudflare `1.20.6`, Wrangler `4.139.0`, local workerd compatibility date `2026-09-25`.

`node scripts/check-profile-photo-worker.mjs --overlap` exited 0 after the diagnostic build, two controlled rounds, temporary-source removal, owned preview shutdown, and a clean Worker rebuild. Run nonce: `63016c62-0fc3-4760-a082-0ad5b8ff80af`. Initial probe, holder, contender, and both recovery responses used isolate ID `bd19a058-252a-451d-887d-36aafe356096`. The holder marked readiness only after `withProfilePhotoProcessing` acquired the real slot. Its release barrier was authenticated by the run nonce and bounded to five seconds.

| Round | Raw contender | Synthetic body | Scoped contender | Holder terminal | Subsequent maximum-area image |
| --- | --- | --- | --- | --- | --- |
| Normal release | `503 decoder_unavailable` | 0 pulls, 1 cancellation | `503 decoder_unavailable`, callback not entered | `200 released` | PNG 200, 2000 × 2000, 26,786 bytes |
| Callback failure after acquisition | `503 decoder_unavailable` | 0 pulls, 1 cancellation | `503 decoder_unavailable`, callback not entered | `500 holder_failed`, fixed response code | JPEG 200, 2000 × 2000, 209,601 bytes |

The contender ran the real raw `validateProfilePhoto` against a synthetic high-water-mark-zero body; the holder and separate scoped contender ran the real `withProfilePhotoProcessing`. No provider, credential, authentication, Storage, hosted endpoint, or deployed service was used. This shows shared scope across these distinct diagnostic route modules and the raw pipeline in one local Worker isolate. It does not test full authenticated production route overlap, other isolates, CPU, or peak memory.

Focused protocol/process tests passed (12/12). The protocol tests cover acquisition ordering, wrong 503 code, isolate mismatch, premature body pull, and a stuck acquisition with release. Typecheck and targeted lint passed after the test fixture type correction. The final clean build route list omitted all diagnostic routes; a source/artifact search found no diagnostic route, control, or identity strings; the temporary state file and route directories were absent; port 8787 had no listener. The expected OpenNext warning was: Node.js middleware support is experimental in Cloudflare and not officially maintained by OpenNext maintainers. The preview process emitted exit 143 when its owned group was intentionally terminated during cleanup; the probe itself exited 0.

This is local runtime evidence for the processing-slot behavior only. The closed operator gate and separate hosted/resource acceptance requirements remain in force.

Task and [whole-plan review](2026-09-26-photo-worker-overlap-review.md) accepted the diagnostic evidence through `208a6af`. Runtime stalled-cancellation proof and a wrong-nonce regression remain nonblocking coverage gaps; the operator mode stays closed.
