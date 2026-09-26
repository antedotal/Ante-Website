# Photo compression and retention requirements — 26 September 2026

## Confirmed user decisions

- Apply to verification and profile photos.
- Fit landscape within 1920×1080 and portrait within 1080×1920, preserving aspect ratio without cropping or upscaling. Interpret orientation before choosing bounds.
- Keep only compressed photos after the compressed artifact has been successfully stored and verified. Do not persist an unnecessary second original. Failed processing/storage must not destroy an existing valid artifact.
- Nonfinancial proof expires seven days after authoritative final resolution. Pending review, open resubmission and unresolved disputes remain protected. Financial-evidence retention requires a separate policy.
- Current avatars remain available; automatic profile cleanup targets replaced/deleted assets, not the age of the current avatar.

These are target requirements, not implemented behavior. The existing gated website validator returns original JPEG/PNG bytes, and the fixed avatar key cannot safely support delayed generation-specific cleanup. Existing active proof originals must not be replaced in place during review. A legacy migration needs explicit preservation and identity rules.

## Verified current state

The read-only source preflight is retained in [source audit](2026-09-26-photo-retention-source-preflight.md). Actual deployed `submit_verification_proof` and `respond_to_verification_request` definitions were also read: the current legacy submission accepts a path, and review resolution clears the latest projection on majority approval, first rejection or final rejection. Neither inspected definition provides an immutable evidence asset ledger. Definition MD5 values were `656f746882a63eaf173ca6948053a237` and `25cd78c9a959f0820c94821c64aae450` respectively. Do not assume the competing forward authority migration is deployed.

The mobile cleanup path can react to one approval before majority. The archived-task purge implementation can delete evidence and task rows without the new final-resolution retention conditions. Backend enforcement must prevent client deletion/projection changes from bypassing retention; a cron alone is insufficient. The website task/proof integration still depends on accepted shared authority and must not bypass that dependency via direct legacy writes.

The [deployed metadata audit](2026-09-26-photo-retention-deployed-audit.md) additionally confirms an older permissive owner image-delete policy, client-writable lifecycle inputs, and an active task purge every 30 seconds based only on seven-day archive age. Task deletion cascades into proof records and payment holds. Restricting this destructive authority is the first implementation priority; the new photo cleanup must not be layered over these bypasses. The SQL purge deletes relational data, not image bytes directly. No destructive behavior was executed to test these findings.

## Compute placement

Cloudflare Workers Free is confirmed. Its documented 10 ms HTTP CPU allowance is not established as sufficient by previous local codec profiling. Supabase Edge Functions documents 2 s CPU per request and 256 MB memory, and supports WASM image processing. That makes existing Supabase compute a candidate, not an accepted resource guarantee. No paid image service has been selected.

Sources checked on 26 September: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase limits](https://supabase.com/docs/guides/functions/limits), [Supabase WASM](https://supabase.com/docs/guides/functions/wasm). Measure bounded worst-case decode/resize/encode, final output verification, bundle size and peak memory before selecting and enabling the processor. Client dimensions/MIME claims alone are insufficient.

## Next implementation boundaries

1. Complete deployed retention-authority audit: policies, function grants, cron, task deletion/cascades and financial/dispute protection. Preserve metadata-only evidence; do not delete images as an audit action.
2. Define a bounded normalization service that authenticates/admit-limits before body processing, decodes safely, handles orientation, resizes/encodes and verifies only the stored normalized artifact. Pin format/quality/input limits in its implementation plan; do not silently inherit profile-specific limits for phone-camera proofs.
3. Add immutable asset identity and authoritative final-resolution/hold state, with private reads and server-owned transitions. Replace fixed-key avatar generation handling before asynchronous replacement cleanup.
4. Close premature delete paths and coordinate with clients before enabling bounded exact-key cleanup. Claim/revalidate lifecycle eligibility, use Storage API deletion, retain retry/tombstone state and protect new holds/restores from deletion races. Never delete Storage metadata directly using SQL.
5. Test partial-majority, resubmission, financial/dispute exclusions, failure/retry, stale avatar delete versus replacement, orientation/aspect/no-upscale, corrupt/large inputs and original-discard ordering. Independently review and verify hosted behavior before enabling schedules/routes.

This document records decisions and audit boundaries. It is not an executable implementation plan, resource acceptance, deployment or cleanup activation.

## Documentation review

Independent review accepted the policy and evidence distinctions after correcting the source preflight: proof supersession does not start the seven-day clock. Only authoritative final resolution does. Local documentation links, retained receipt structure and whitespace checks passed. No application tests were rerun for this documentation-only change.
