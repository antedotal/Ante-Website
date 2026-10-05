# Mediated profile photo website: local source acceptance

27 September 2026. Website `codex/shared-web-account`, implementation through `4df7141`. All three tasks passed independent review, including scoped review of corrections; a fresh final reviewer approved `4855543..4df7141` with no outstanding findings. This accepts local source only. Serving mode remains unset, the paired SQL package is undeployed, and the public Pages site is unchanged.

## Completed behavior

The GET route consumes visitor admission, verifies the exact session token, consumes verified-user admission and acquires the processing slot. Caller authorization selects an immutable current asset; only then may service credentials read its exact manifest and bytes. MIME, byte count, SHA-256 and full decoded dimensions must agree. A fresh nonrefreshing check of the original token and a second caller resolver must still authorize the same asset before the route returns the original bytes.

The caller/service credential boundaries remain separate. Legacy photos deny, old serving modes deny, and writes remain closed. Every explicit route method and success/error response has private browser/CDN no-store headers; client Range and validators cannot bypass authorization. One route deadline starts before asynchronous parameters resolve. Late decoding retains the slot until settlement and its output is discarded. Successful initial refresh cookies survive all subsequent failures, including interruption immediately after successful initial verification.

The shared transport bounds admission to five seconds/16 KiB and provider reads to ten seconds with strict body/encoding/length checks. Both photo transports copy retained chunks, discard empty chunks and reject the 33rd consecutive empty chunk, resetting on progress. This finite limit complements deadlines on Workers, whose clocks can remain frozen without I/O ([Cloudflare documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/)). The byte limits are not measured Worker CPU/memory guarantees.

## Commits and verification

| Slice | Commits | Evidence |
| --- | --- | --- |
| Shared transport/admission | `6e6aee7`, `13fbbb5`, `3f4267b` | 69 focused tests; typecheck/lint/diff; independent review approved after monotonic and frozen-clock corrections |
| Selected manifest/bytes and final Auth | `43e00cd` | 84 focused tests; typecheck/lint/diff; independent review approved |
| Complete route and acceptance | `38f85ed`, `4df7141` | Final 89 focused tests, **347 full tests across 30 files**, typecheck/scoped lint/diff and **final-source Worker build** passed; task and fresh final reviews approved |

The historical local acceptance harness passed **51/51** before the final route-cookie corrections. Its files/interfaces were unchanged; it was not rerun and does not establish mediated hosted behavior. Build warnings remain the existing Node/OpenNext warnings, not deployment evidence. Static filename-only public asset scans found no named secret-key references or fixture key/token literals; server output contains expected server-side environment-variable references. No credential values were opened, printed or certified absent from runtime by that scan.

Tests reproduced the prior hangs, unbounded bodies, empty-stream loops, reused-buffer corruption and cookie-loss boundaries before fixes. Installed-SDK tests also caught HTTP 429/session_not_found being rewritten to an authentication error; final verification now preserves provider uncertainty as 503. The route matrix covers selection/download/decode/final-Auth barriers, five final authority outcomes, aborts, identity failures, aggregate deadlines, five-second admission stalls, late decode retaining the slot, abort-ignoring replies, hash-consistent invalid codec/dimension data, exact cookie retention and cache/mode/error outcomes. Mocked authority changes establish application decisions, not real committed database races.

[Independent final review](2026-09-27-profile-photo-mediated-website-review.md) · [Implementation plan](../plans/2026-09-27-profile-photo-mediated-website.md) · [Current contract](../../contracts/profile-photos.md) · [Paired database acceptance](../../../../Ante/docs/superpowers/audits/2026-09-27-profile-photo-mediated-database-acceptance.md).

## Decisions and practical limits

Controller rulings: continue already-authorized reversible source work without another approval; include the narrow related Auth stream correction in Task 2 after finding the same defect; use a finite 32-empty-chunk allowance rather than depend on clock advancement. If these conservative bounds reject a legitimate provider response, the cost is a failed request and local compatibility adjustment before activation. Earlier agent-allocation limits required reusing independent seats; implementation never ran concurrently and no implementer approved its own task. A fresh final reviewer was successfully allocated for the complete website package. No findings were parked.

The final resolver statement is the last authorization snapshot. Previously delivered or already-authorized in-flight bytes cannot be recalled. Source timeout handling cannot preempt synchronous WASM. The reviewer deliberately left real SQL/catalog state, CDN/service-cache isolation, browser sessions and provider revocation semantics, Worker CPU/memory/overlap/response retention, highly fragmented streams, normalization/HEIC, mobile readers, cleanup, proof and financial behavior to their separate acceptance work. These remain open gates, not completed work.

## Next work and access

A fresh read-only check with Wrangler **4.139.0** returned `{"loggedIn":false}` from `whoami --json` (exit 1). The existing request to run `pnpm exec wrangler login` for the authorized Havish account remains outstanding; no login or deployment was attempted. Do not create a substitute account or enable serving to work around this.

1. Prepare and independently review a bounded mediated hosted-acceptance runner, with explicit request budgets, durable run-owned journals, cleanup reserve and all 22 protected-table fingerprints. Preserve the older failed direct-Storage cache receipts; do not reuse that runner as a passing mediated test.
2. Obtain intended Cloudflare Worker/domain access; inspect cache rules and require a photo-route CDN bypass. Verify real sessions/refresh, repeated URLs, conditional/range requests and worst-case runtime resources on the intended plan.
3. Before guarded SQL cutover, refresh catalog/ACL/empty object-authority-multipart inventory and establish producer quiescence. Prove ordinary direct Storage denial before creating any fresh normalized object, then service-warmed cache isolation and actual authorization-transition races.
4. Keep upload normalization/HEIC, immutable publication orchestration and cleanup/retention separate. Financial evidence retention and payment policy remain unresolved; existing containment stays intact.

Do not enable `mediated-read-v1` merely because source tests pass. The overall website-backend goal is still active and incomplete.
