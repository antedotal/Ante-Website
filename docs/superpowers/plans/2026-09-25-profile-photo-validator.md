# Profile photo validator implementation plan

> For agentic workers: REQUIRED SUB-SKILL: use superpowers:subagent-driven-development and test-driven-development.

**Goal:** Implement a bounded server-only JPEG/PNG upload validator and exercise it in the actual OpenNext Worker runtime before integrating account endpoints.
**Architecture:** Stream-limit input, validate format/dimensions/structure before decoding, fully decode with pinned local WASM codecs, and return validated bytes plus derived metadata. No public photo endpoint is introduced in this slice.
**Tech Stack:** Existing Next16.3.3/OpenNext1.20.6/Wrangler4.139.0; candidate exact @jsquash/png3.1.1 and @jsquash/jpeg1.6.0.
**Spec:** docs/superpowers/audits/2026-09-25-private-avatar-contract.md; runtime-source research /tmp/ante-avatar-decoder-decision-20260925.md. Research is not runtime acceptance.

## Global Constraints

Existing website worktree only. No UI/mobile, SQL, provider calls, real secrets/photos, deployment, paid services or permanent diagnostic route. No subagents by implementer. No unrelated dependency upgrades. Preserve all auth/cookie/admission contracts. Never enable header-only validation on codec failure. No global fetch/console monkeypatches or public unsafe decoding API. Decoding stays server-only; codecs and secrets must not appear in browser chunks. Do not rewrite vendored WASM or silently switch to another library/topology if the candidate fails; report concrete evidence to controller after2–3 approaches. Existing serving gates remain closed.

Use local-only Wrangler preview, synthetic SupabaseURL https://localhost.invalid and synthetic publishablekey, no privateenv/secrets; use localhost origin (OpenNext rewrites127.0.0.1). Own/stop only created processes. Never deploy or modify production Pages/Workers routes. Ephemeral diagnostic route may be created only by a script that refuses an existing path, cleans it in finally and never commits it; prove it absent from final source/build. If build compatibility needs a material topology change, report before implementing it.

## Review Focus

Unknown-length and chunked bodies must not bypass the byte cap or wait forever.
Malicious dimensions, invalid compressed data, animation and trailing/multi-image content must not pass signature-only checks.
PNG codec ignores CRCs; wrapper must validate complete chunk structure and CRCs before calling it.
Decoder output must match preflight dimensions/format; codec exceptions must not expose raw parser data.
Concurrent/malformed decodes must not be called production-safe merely because a tiny local fixture works; record measurable runtime limits and open hosted-plan gates.

### Task 1: Bounded image validator and actual Worker acceptance

**Files:** Create focused server modules under `lib/server/profile-photo-*` (keep parser/stream/codec responsibilities readable), behavior tests under `tests/`, small deterministic fixtures under `tests/fixtures/`, a reproducible local-runtime check under `scripts/`; modify package.json/pnpm-lock.yaml only for exact codecs and minimal necessary typing, next/OpenNext/Wrangler config only if demonstrated required, .guidelines/design.md and a durable acceptance audit. No permanent app route or public activation setting.

**Interfaces:** Export `validateProfilePhoto(request: Request): Promise<ValidatedProfilePhoto>` from a server-only module, returning `{bytes: Uint8Array, contentType: 'image/jpeg' | 'image/png', width: number, height: number}`. It validates only image input, not identity or Storage ownership; future routes must admit and verify caller before invoking it. Export a typed error with generic code/status for invalid input400, unsupported format415, too-large413, invalid image422, timed-out body408 and decoder unavailable503. Do not return decoder messages, stack/cause or input bytes in errors/logs. Preserve original validated bytes unless an explicitly documented normalization is needed and reviewed; do not claim metadata removal.

- [ ] First verify pinned package decode entrypoints and static WASM initialization in the actual OpenNext build with tiny valid JPEG/PNG fixtures. Use installed CLI help/current official Cloudflare docs and inspect installed Wrangler schema/types. Do not rely on a Node-only codec success or a bare Worker as proof of Next bundling. Report initial incompatibility/error before building an elaborate parser around a broken loader. If loading works, proceed in this same task. Keep diagnostics local and remove the temporary route.
- [ ] Write failing behavioral tests for input/structure and record meaningful RED. Use actual codecs for at least valid image, malformed compressed data and truncated image tests; mocks may isolate IO timeout or unavailable codec only. Example:
```ts
const photo = await validateProfilePhoto(new Request('https://local.invalid', {
 method:'PUT', headers:{'content-type':'image/png'}, body:validPng,
}))
expect(photo.contentType).toBe('image/png')
expect(photo.width).toBe(expectedWidth)
expect(photo.bytes).toEqual(validPng)
await expect(validateProfilePhoto(oversizedChunkedRequest())).rejects.toMatchObject({status:413})
await expect(validateProfilePhoto(badCrcRequest())).rejects.toMatchObject({status:422})
```
- [ ] Stream-read at most2097152 bytes, rejecting the next byte before accumulation. Validate advertised length when present; never rely on it instead of actual length. Reject empty/missing bodies. Enforce an overall10000ms read deadline and cancellation/reader release on every denial without awaiting an untrusted cancellation indefinitely. Respect caller abort. Content-Type must normalize to image/jpeg or image/png and match detected structure. Unknown length is supported. Do not call request.arrayBuffer before the cap.
- [ ] Enforce each dimension1..2048 and product<=4000000 before expansive decode. JPEG: bounded marker traversal, legal segment lengths and supported frame format, one consistent frame size, complete scan/full decode and finalEOI without trailing secondimage/payload; handle ordinary baseline/progressive samples. PNG: signature, one first13-byteIHDR, legal depth/color combination, compression/filter fields, bounded chunk offsets/count, validCRC every chunk, legal ordering/palette/transparency/IDAT rules, one final emptyIEND; reject APNG/interlace initially as documented unsupported encodings. Reject unknown critical chunks. Metadata handling must not permit unbounded compressed ancillary inflation. Avoid unnecessarily rejecting ordinary bounded ancillary metadata; document any unsupported profile with reason. Do not invent a full image decoder.
- [ ] Fully decode with exact pinned candidate, statically bundled WASM and no runtime network fetch. Compare actual output dimensions and expected RGBA length to preflight; reject all parser/decode failures generically. Do not return pixels or retain request input in global state. Shared immutable codec initialization is acceptable; control resource concurrency if needed without unbounded queued buffers. Record the decoder's actual memory controls and limits honestly: published JPEG heap can grow large; PNG limit is best effort and excludes output. Do not claim dimension caps establish a hard heap ceiling. If safe resource behavior cannot be established, leave decoder integration unactivated and report the blocking fact rather than weaken validation.
- [ ] Test actual Worker path with valid JPEG/PNG (more than1pixel), boundary dimensions, over-cap streaming body, MIME mismatch, invalidCRC/IDAT, truncated/multi-frame JPEG, malformed/overlongchunk, oversized declared dimensions, interlace/APNG, trailing payload, compressed inflation abuse and a small concurrent request batch. Include same-isolate recovery after rejected input. Use synthetic image fixtures only; no external image downloads or user photos. Record wall/CPU/memory evidence the runtime actually exposes; explicitly distinguish measurements from unmeasured target-plan CPU/per-isolate limits. Never label a NodeRSS sample as Worker isolate memory.
- [ ] Keep any codec memory/bundling/CPU limitation a concrete release gate. This task does not satisfy hosted CDN or authorization/endpoint acceptance. If a needed change is outside scope, stop with NEEDS_CONTEXT evidence while leaving useful tests/source reviewable; do not silently add a paid Images service, custom codec build or second Worker.
- [ ] Run focused tests, full website suite, typecheck, lint, Next and Worker builds on final code (Worker build includes Next; no redundant repeats without cause). Confirm diagnostics absent from final source/routes/browser artifacts. Update design/audit with command/output, exact dependency/source evidence, accepted/unsupported format profile, local runtime observations and open gates. Commit explicit files and report for independent task/final review. No serving activation.
