# Photo Processing Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute using checkbox steps.

**Goal:** Fail fast on overlapping image processing before request/provider image buffering, covering PNG preflight, decode and awaited upload storage.
**Architecture:** One shared server-only callback scope; validator pipeline remains private. Raw validator and PUT/GET routes use the same slot. DELETE is unchanged.
**Tech Stack:** Existing Next, TypeScript, Vitest and pinned codecs; no dependency changes.
**Spec:** docs/superpowers/audits/2026-09-26-photo-processing-scope-design.md

## Global Constraints

- Website isolated worktree only; no providers, credentials, Docker, deployment, UI/mobile, schema, financial or activation changes.
- Preserve exact-token Auth, visitor/user admission and owner-profile order; original bytes, MIME, bounds, quotas, error/cookie/cache behavior remain unchanged outside contention.
- One synchronous fail-fast slot per module instance, no queues or retries, existing typed decoder_unavailable503; route503 is private with Retry-After60 and verified cookies.
- GET acquires before download, PUT after own-profile lookup through awaited Storage acknowledgement; DELETE outside scope. Retain decoderBusy protection.
- Scope does not bound returned responses, caller-held bytes, prefetched bodies, outstanding canceled runtime work, or all isolates. No total-memory/hosted acceptance claims.
- Preserve cheap raw MIME/body/signal/lock/content-length error precedence with a non-reading assertion; denied body cancellation must not await a hostile producer.
- Scoped validator cannot be reused or escaped into concurrent/repeated validation; never export an unguarded bypass.
- Explicit-file commits and ignored reports; no forced addition of .superpowers.

## Review Focus

- Contender cannot pull/copy an upload or fetch a Storage image while first work is stalled at read, PNG inflation, codec or upload acknowledgement.
- All completion/error/abort paths release capacity; early callback return cannot release while started validation remains in flight.
- Invalid/aborted requests preserve cheap denials while occupied; capacity does not replace Auth or ownership validation.
- Returned GET response may remain unread while later requests succeed; document that retained-response memory remains outside scope.
- Cross-route/raw and cross-format work share one guard, but DELETE remains independent.

### Task 1: Shared processing scope and deterministic contention tests

**Files:** Modify lib/server/profile-photo.ts, profile-photo-stream.ts, account-profile-photo.ts; existing/focused photo tests; .guidelines/design.md; docs/contracts/profile-photos.md; create docs/superpowers/audits/2026-09-26-photo-processing-scope-acceptance.md.
**Interfaces:** Exact design API:
```ts
type PhotoValidator = (request: Request) => Promise<ValidatedProfilePhoto>
export function withProfilePhotoProcessing<T>(work: (validate: PhotoValidator) => Promise<T>): Promise<T>
export function validateProfilePhoto(request: Request): Promise<ValidatedProfilePhoto>
```

- [ ] Read the spec: its Concrete API, Route integration and File/test sections are binding requirements. Write deterministic failing tests for every Review Focus using explicit barriers and highWaterMark0. Example expected contender assertion:
```ts
await expect(validateProfilePhoto(contender)).rejects.toMatchObject({code:'decoder_unavailable',status:503})
expect(contenderPulls).toBe(0)
expect(contenderCancellations).toBe(1)
```
- [ ] Capture RED before implementation. Factor cheap assertion without consuming body. Implement private pipeline and callback scope with synchronous acquisition/finally release, single-use scoped closure, and await any validation started before callback settles before releasing capacity. Handle promise rejection without unhandled rejections and preserve original callback failure where relevant.
- [ ] Integrate PUT/GET exactly as spec; no code changes in store/codecs unless a concrete incompatibility is reported to controller. Keep current buffer copies and deadlines. A busy upload cancels request nonblocking; busy GET makes no download. Every post-Auth response preserves verified cookies.
- [ ] Cover raw read/preflight/decode barrier contention; PUT acknowledgement vs GET/raw contenders; GET download vs PUT/raw contenders; cheap errors; stale/double closure calls; early callback return; failure recovery table; DELETE independence; unread response ownership. Use installed SDK/codec route test seams and deterministic doubles rather than sleeps. Assertions must prove resource stage exclusion, not only503.
- [ ] Run new focused and all existing photo/adapter/admission tests, typecheck and lint. Run synthetic allowlisted Worker build with temporary HOME and no project dotenv/private variables; do not use production environment. No full resource probe is required for this source-only task: actual bundle shared-isolate overlap remains explicitly open until measured.
- [ ] Document limits and reported checks in acceptance/contract/design, commit exact files, append ignored report with RED/GREEN receipts and concerns. No merge/push. Independent task and final review follow.
