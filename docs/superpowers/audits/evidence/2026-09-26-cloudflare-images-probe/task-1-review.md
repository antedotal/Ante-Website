# Independent Task 1 review

Reviewed website commit `0c9f8652694c0d685339f05675495f47229d3952` against `b02ab14`, the supplied diff, binding plan Global constraints, candidate audit, paired shared upload contract, preparation report and design. This was source/documentation review only; no tests were rerun and no provider resources were changed.

**Spec verdict: PASS for the bounded four-fixture operator diagnostic.**

**Quality verdict: PASS with one minor coverage finding.** No Critical or Important findings. The reviewed source is suitable for the controller's separately authorized temporary deployment/probe/cleanup. This does not accept a production normalizer or establish hosted success.

## Findings

- **Critical:** None.
- **Important:** None.
- **Minor — stream-bound regression coverage is incomplete.** `docs/superpowers/audits/evidence/2026-09-26-cloudflare-images-probe/handler.test.ts:84` tests the input size bound only through an oversized declared Content-Length, while lines 120–125 cover a stalled request body only. The implementation independently counts streamed bytes and wraps provider/output work in the same deadline, but those additional paths lack direct assertions. A small follow-up could cover an over-cap request without Content-Length (assert zero Images calls and stream cancellation), plus a stalled Images promise/output stream (assert fixed private 504). This is nonblocking for this exact-fixture feasibility run: the shared bounded reader is exercised by the oversized output case, and source inspection confirms both input/output use it.

## Boundary assessment

- `handler.ts:100–113` checks configured expiry and dedicated 64-hex token before method, path, media envelope, body reads or Images calls. Missing/invalid configuration fails closed. POST and `/probe` without query are required. Secret randomness and short expiry are controller deployment responsibilities; the handler does not manufacture or expose them.
- `handler.ts:118–122` requires the exact MIME, byte length and SHA-256 of one of four known synthetic fixtures before the first provider call, then checks the provider's reported format/size/dimensions. The manifest and handler agree. This is an exact allowlist, not generalized image validation.
- `handler.ts:49–83,115,124–132` imposes the 10 MiB streamed input/output limits and shared ten-second response deadline; crossed read bounds trigger cancellation without waiting on the producer. In-flight provider work is not forcibly terminated, as the evidence explicitly acknowledges.
- `handler.ts:124–131` requests JPEG quality 85, metadata removal, no animation preservation, and scale-down landscape/portrait bounds. Expected 1440×1080 / 1080×1440 output checks are correct for these four fixture dimensions. Opaque PNG-to-JPEG is explicitly authorized here and does not settle the production transparency or PNG-efficiency policies.
- `handler.ts:28–33,128–135` returns only fixed JSON errors or a narrow metadata receipt, always private/no-store and nosniff. No image body, provider error text, secret, source URL, log output or cache write is returned or used. The entrypoint is standalone; repository search found no application import. The change contains no Storage/database/payment calls or existing-site configuration changes.
- Current Cloudflare documentation supports the raw-stream `info` and `input → transform → output → response` calls, JPEG output options, and uncached binding behavior. See [Images binding](https://developers.cloudflare.com/images/optimization/binding/). The selected `scale-down` and `metadata: none` options match the [feature reference](https://developers.cloudflare.com/images/optimization/features/). Documentation was checked during this review; hosted entitlement and codec behavior remain unverified.
- `report.md` and `design.md` correctly distinguish reported local orchestration tests (6 focused / 236 repository, TypeScript and lint) from hosted availability, actual transforms, production metadata privacy, still-image/auxiliary validation, broader input support and resource acceptance. No reported test result was independently reproduced in this review.

The controller still owns account preflight, installing only the uniquely named temporary Worker with a short-lived secret, denial/four-fixture receipts, removal and verified absence. No paid plan change, app activation or retention/financial unpause is authorized by this review.
