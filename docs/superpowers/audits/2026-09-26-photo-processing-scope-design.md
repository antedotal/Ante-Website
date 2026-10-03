# Photo concurrency hardening design

Read-only source review, 26 September 2026. Verified website HEAD: `3d6cfa46888c9acdeb52a9a32e8efe4cd531932b`. No provider calls, builds, runtime experiments, or production edits. Reviewed validator, stream, PNG, codec, route, store, relevant test suites, design guidelines, and resource-acceptance audit. All recommendations below are proposed, not accepted runtime evidence.

## Recommendation

Use one shared, synchronous, fail-fast processing slot per loaded module/isolate. No semaphore waiters, promise chain, queue, delayed retry, or image-containing pending-work collection. Acquire before expensive image input buffering; retain through PNG preflight and full decode. Route uploads retain it through Storage upload completion. Route reads acquire before Storage download and retain it through response construction. DELETE stays outside this slot.

The existing codec-only `decoderBusy` starts too late: request chunk copies, assembled bytes, PNG IDAT packing and streaming inflation already happened. A validator-only replacement also starts too late for GET (`downloadProfilePhoto` has already buffered the provider body), and ends too early for PUT (validated bytes and the provider upload copy remain live during its awaited response).

## Concrete API

Prefer a small callback scope in `lib/server/profile-photo.ts`, keeping the unguarded validation implementation private:

```ts
type PhotoValidator = (request: Request) => Promise<ValidatedProfilePhoto>
export function withProfilePhotoProcessing<T>(
  work: (validate: PhotoValidator) => Promise<T>,
): Promise<T>
export function validateProfilePhoto(request: Request): Promise<ValidatedProfilePhoto>
```

The scope checks/sets a module boolean synchronously before its first await, invokes `work`, and releases in `finally`. Busy throws the existing typed `ProfilePhotoError('decoder_unavailable', 503)`; no new public status/error body is needed. Supply a scoped validation closure that is valid only during the scope and allows one invocation. Reject stale/repeated calls before reading bytes. This avoids exporting an unguarded validator or a boolean `alreadyAdmitted` bypass, and prevents two validations inside one scope. All production callbacks await their validation and storage calls; keep that ownership explicit. If defensive support for a callback that starts validation and returns early is included, await that one in-flight validation before releasing (and handle its rejection); do not add a list of pending work.

The ordinary `validateProfilePhoto(request)` performs the same cheap input checks first, then wraps its private validation in this scope. On busy, cancel that request body without awaiting the producer's cancellation promise. It continues to return original bytes and the same type/dimensions. Returned bytes become caller-owned after the promise settles; this API cannot constrain how long callers retain them.

Preserve raw validator cheap-error precedence by factoring the current body/header/signal eligibility checks from `readProfilePhotoBody` into a shared non-reading assertion and running it after MIME checking but before acquiring the slot. Keep the reader's checks too, or recheck signal/lock state at reader acquisition to cover races. Do not use reading as a precheck. Missing/locked/aborted body remains 400; malformed length remains 400; declared oversize remains 413; unsupported MIME remains 415. Busy applies to otherwise eligible work. Assertions must preserve the current cancellation behavior.

Keep `decoderBusy` in `profile-photo-codecs.ts` as a small independent protection for the codec's shared JPEG diagnostic state. Do not broaden this task into codec changes, format reductions, buffer-copy removal, timeout changes, or alternative decoders. All whole-pipeline capacity must come from the shared scope, not independent upload/read locks.

## Route integration and ownership

`handleAccountProfilePhoto`: preserve cheap checks -> gate -> visitor admission -> fresh Auth -> user admission -> owner-profile lookup. Keep DELETE exactly on its existing path. For upload only, enter the scope after a successful owner-profile lookup; use the scoped validator and await `putProfilePhoto` before returning the existing success/failure response. Busy cancels the incoming body, returns the existing private 503 with `Retry-After: 60`, and keeps verified provisional cookies. Existing validation errors retain their exact status. Owner lookup and its small JSON buffer remain outside this image-processing scope intentionally.

`handleProfilePhotoRead`: preserve cheap checks -> gate -> visitor admission -> fresh Auth -> user admission. Enter the scope immediately before `downloadProfilePhoto`. Perform download, synthetic Request construction, scoped validation, original-byte response construction, and verified cookie application inside it. Keep the exact checked session token in download, existing missing/access-hidden 404 mapping, and corruption/provider/decoder 503 mapping. Denied capacity must not fetch the storage object at all. Preserve `Content-Type`, `private, no-store`, `nosniff`, ignored ranges/validators, and original bytes. Keep current slice boundaries for this patch; they have real allocation costs but changing ownership/copy semantics is separate work.

No capacity check can preserve every previous concurrent result: a second eligible operation can now receive 503 earlier, including before its eventual stored-object 404 would be known. This is the deliberate overload behavior. Preserve precedence for pre-capacity auth/admission/profile outcomes, and preserve non-contention status mappings.

Release GET capacity when the response is constructed/returned. Its bytes remain owned by the response/runtime after that. Multiple completed, unread or slow-client responses can coexist with later work. Do not imply the slot bounds response retention. Holding a slot until a response stream is consumed would change response ownership and make capacity depend on a slow/abandoned client; solving that requires separate runtime-informed response-lifecycle design, not a hidden wrapper in this patch.

Likewise, provider timeout/cancellation races can leave underlying host fetch or native work unsettled after application completion. Existing non-awaited hostile-stream cancellation intentionally permits prompt rejection. The slot bounds admitted application work, not all outstanding runtime memory or instant reclamation.

## File and test plan

1. `lib/server/profile-photo.ts`: scope + private pipeline + public guarded validator; document ownership and fail-fast semantics. `profile-photo-stream.ts`: shared cheap non-reading assertion, preserving existing reader behavior. `account-profile-photo.ts`: widen scope around upload consumption and read download/construction. Keep storage/token/codec behavior intact.
2. `tests/profile-photo.test.ts` or a focused sibling: start a first valid request with a controlled zero-prefetch body and hold it in the read stage. A second supported request must promptly get typed 503, have zero reader pulls and one cancellation (even when cancel never settles). Release first, verify success, then verify a third succeeds. Test raw validator versus route scope sharing and PNG/JPEG sharing. Retain exact cheap-error precedence while occupied.
3. Focused mocked-stage tests: hold `inspectPng` at its awaited preflight stage and the decoder at its awaited entry, separately. In each, contender never enters reader/preflight/codec. This deterministically proves coverage; `Promise.all` of tiny images alone proves nothing about overlap. Check scoped closure cannot be reused after return or for a second concurrent validation.
4. `tests/account-profile-photo.test.ts`: defer download fetch or response-body completion, prove contender GET issues no second object download; defer upload acknowledgement, prove contender upload reads no body and contender GET downloads nothing. Test reverse order and raw-validator cross-contention. Existing auth/profile network work may occur before busy by design; don't assert zero total network calls. Use explicit stage barriers and highWaterMark 0, not sleeps.
5. Exercise recovery after invalid PNG/JPEG, read abort and timeout, missing WASM, missing object, provider unavailability, upload rejection/timeout, and unexpected callback rejection. Verify exactly the established statuses, private headers, cookies, token, and bytes. Avoid multiplying every combination; table-driven recovery covers release on success/failure. DELETE and cheap ordinary work must remain unaffected during occupancy.
6. Keep a successful GET response unread, then perform another valid request successfully; finally consume the first response and compare its bytes. This is an important documented ownership limit, not a claim of bounded slow-client retention.
7. Run focused tests, existing photo suites, typecheck and required ESLint after implementation. Update `.guidelines/design.md` and `docs/contracts/profile-photos.md` to describe precisely the new local overload behavior and remaining gate. A later bounded actual-Worker overlap check should establish shared module/isolate identity and that second work is rejected before preflight, not just count simultaneous client promises.

## What this solves and what it does not

Solves: at most one admitted heavy photo processing scope in this module instance, across raw validator/route upload/route read; no application queue of image buffers; GET download buffering and PUT awaited storage retention fall within that scope; capacity is restored after settled paths.

Does not solve: total isolate peak memory, JS/WASM/native/GC retention, already-prefetched request data, residual cancelled host work, returned responses, caller-retained validator bytes, unrelated application/auth buffers, direct low-level store/helper callers outside the route, or aggregate traffic across isolates/replicas. There is no global throughput guarantee or fairness promise. A slow admitted input/provider can occupy the slot until its existing deadline; do not move admission ahead of Auth to avoid that tradeoff. Shared module identity must be checked in the actual bundle, not assumed from unit imports.

Remaining acceptance: boundary corpus plus allocation/CPU characterization, both warmed codec heaps, native inflation/decode, host buffering/cancellation and response ownership; actual Workers plan/CPU configuration; representative hosted route CPU and outcomes; explicit defensible memory acceptance. Existing audit's profiling limitations still apply. Keep the operator gate closed. This is source-level concurrency hardening, not deployment or resource acceptance.
