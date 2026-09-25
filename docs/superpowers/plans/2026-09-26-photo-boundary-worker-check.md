# Photo Boundary Worker Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Exercise supported maximum-area PNG/JPEG and byte boundaries in the actual local Worker, with owned-process cleanup and honest evidence.
**Architecture:** Extend the existing temporary-route runner with optional boundary mode and deterministic offline fixtures. No production validation changes. Preserve quick mode and synthetic-only builds.
**Tech Stack:** Existing Node, zlib, pinned jSquash codecs, Next/OpenNext/Wrangler, Vitest.
**Spec:** docs/superpowers/audits/2026-09-26-private-photo-resource-acceptance-design.md (this task implements sequential boundary screening only; profiler and proven concurrent overlap remain subsequent work).

## Global Constraints

- Website worktree only; no providers, credentials, deployment, Docker, new dependencies, production mode activation or production validator changes.
- Preserve 2,097,152 actual bytes, 2048 maximum axis and 4,000,000 maximum pixels. Do not narrow accepted production formats.
- Temporary HOME, allowlisted synthetic child environment, dotenv refusal and loopback binding remain mandatory. Disable telemetry.
- Refuse existing probe route and occupied selected ports; readiness must confirm a unique run nonce rather than accept an unrelated listener.
- Own preview process tree, terminate and await it in finally, then remove temporary source and rebuild clean artifacts. Never kill unrelated listeners.
- Wall time is not CPU; no snapshot/RSS or local success may be claimed as peak isolate-memory/hosted acceptance.
- Reports ignored; never force-add .superpowers files. Explicit file commits only.

## Review Focus

- Generator errors cannot masquerade as legitimate decoder rejection: verify dimensions, PNG depth/CRC/decompressed rows and actual JPEG decode before running the Worker.
- Boundary rejection must recover: valid maximum image after malformed/oversized case succeeds.
- A pre-existing server cannot satisfy readiness or be killed by cleanup: occupied-port and nonce tests.
- Failed probe must not leave a diagnostic endpoint/process: test failure cleanup through focused testable lifecycle helpers.
- Exactly-at-cap differs from cap+1: valid metadata padding must be identified explicitly, not called entropy stress.

### Task 1: Deterministic boundary corpus and owned Worker runner

**Files:** Modify scripts/check-profile-photo-worker.mjs; create scripts/profile-photo-boundary-fixtures.mjs and tests/profile-photo-boundary-fixtures.test.ts; add a small scripts/profile-photo-worker-process.mjs and focused lifecycle tests if needed to avoid untestable process ownership logic; update .guidelines/design.md and docs/superpowers/audits/2026-09-26-photo-boundary-worker-results.md.
**Interfaces:** Export async `makeBoundaryFixtures()` returning named objects `{name, bytes:Uint8Array, mime, expectedStatus, width, height}`. Runner accepts `--boundary`; normal invocation retains existing correctness cases. No shipped API changes.

- [ ] Write failing fixture tests before implementation. At minimum assert PNG signature/IHDR/CRC, exact zlib row length and last filter, 2000x2000 RGBA8 and RGBA16, 2048x1953 RGBA8, metadata-padded exact 2097152-byte valid PNG and plus-one case. Use Node zlib/crypto, not fixtures downloaded from network. Test a CRC-valid late bad row filter expected422 and recovery fixture. Generate 2000x2000 baseline and progressive JPEG using pinned existing encoder support; verify via existing decoder in Node. If encoder cannot produce progressive, retain existing progressive fixture as explicitly incomplete maximum-area coverage and report that gap; do not invent JPEG bytes or add dependencies.

```ts
expect(fixtures.find(x => x.name === 'png_exact_cap')?.bytes.byteLength).toBe(2_097_152)
expect(fixtures.find(x => x.name === 'png_over_cap')?.bytes.byteLength).toBe(2_097_153)
expect(fixtures.find(x => x.name === 'png_rgba16_max')?.width).toBe(2000)
```

- [ ] Run focused tests and capture the specific RED. Implement deterministic generators with array allocation/copy rather than spreading multi-megabyte byte arrays into JS arrays. Record generator/codec settings and fixture SHA256; no image bytes in logs.
- [ ] Add `--boundary` sequential run: each valid fixture must return200 with exact dimensions and length; malformed filter422 and cap+1 413; repeat largest PNG/JPEG three times warm, with a valid recovery after each denial. Every result includes fixture hash/bytes, returned dimensions, elapsed wallMs and a fixed label stating local screening only. Do not broaden accepted statuses.
- [ ] Test occupied-port refusal and owned process exit/cleanup using short synthetic child processes without external network. Add unique per-run nonce to the temporary route response/readiness. Await full owned process-group exit before clean rebuild; handle SIGINT/SIGTERM through the same cleanup, preserve failure status. Use a bounded overall timeout. Do not treat a timeout as success.
- [ ] Run focused tests, typecheck/lint; execute `node scripts/check-profile-photo-worker.mjs --boundary` once, capturing exact outputs outside git. Investigate real failure rather than weakening assertions. Verify final probe source/artifacts absent and owned listeners gone. Do not run broad unrelated suites unless changed behavior warrants them.
- [ ] Write durable result receipt with commit/runtime versions, corpus/hashes, status outcomes, timings explicitly wall observations, precise coverage gaps and next profiler/concurrency work. Update design note, commit exact files. Return concise summary plus ignored task report with commands/results/cleanup evidence.
