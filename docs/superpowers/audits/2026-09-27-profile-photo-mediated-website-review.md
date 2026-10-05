# Independent whole-plan review

Reviewed website `4855543..4df7141`; current HEAD verified as `4df714182b2f06998b29a8c83dc44a0ece3457c5`. The tracked checkout was clean. Review is source-only, using the supplied diff, progress/task reports, implementation plan, paired mediated-reader design, final source/tests, and accepted backend manifest source (`de50586` supplied by the controller). No tests, provider operations, implementation edits, deployments or subagents were run. The original ignored report was subsequently copied into this durable acceptance record.

## Strengths

- The integrated route follows the required trust order: visitor admission, fresh initial Auth, verified-user admission, processing slot, caller-only current selection, service manifest and exact derived object, SHA-256 and full codec/dimension checks, fresh original-token Auth, then same-asset caller resolution. A denial never becomes a service fallback or generation restart.
- Caller requests use only the public apikey and exact verified bearer; manifest/Storage use the existing service credential variants. Selection is frozen and branded, and service reads derive their key from that selection. No request headers or manifest field can choose an arbitrary object path or provider origin.
- The adapter's exact nine-field manifest matches `install-body.sql`: revision remains a positive canonical bigint-range decimal string; hash, MIME, byte count, transform identifier and landscape/portrait bounds agree. The route returns the original hash-verified bytes after decoding, rather than transformed output.
- Both raw transports copy producer chunks and reject excessive consecutive empty chunks even with frozen clocks. The shared helper races fetch/body reads against cancellation and deadlines, cancels late responses without awaiting hostile cancellation, and rejects redirects, partial replies, unexpected encoding and invalid lengths. Admissions reuse it with five-second bounds and existing quota namespaces.
- Final Auth uses an isolated nonpersistent SDK client and the original token. Transport uncertainty survives SDK error remapping, and final Auth cannot alter the initial SSR refresh cookies. Recording the verified session before the post-Auth interruption check closes the reviewed cookie-loss race.
- Route entry owns the aggregate deadline before asynchronous parameters resolve. Downstream checks discard late results; the processing slot remains occupied until decoding settles and through final authorization and response construction. The common response policy covers explicit methods, success, admissions, initial Auth and later errors while retaining safe cookies, Allow and Retry-After.
- Tests exercise the installed SDK and pinned WASM with controlled HTTP and focused barriers, rather than replacing the whole pipeline. They cover selected/download/decode/final-Auth authority changes, failed final Auth, initial-cookie retention, late decode slot ownership, hash-consistent invalid image data, aggregate deadlines, frozen-clock transport behavior and conditional/range request handling.

## Issues

Critical: none identified.

Important: none identified.

Minor: none raised as a required change.

## Verification evidence and limits

I inspected the final full-suite log, which records 347 passing tests across 30 files, and the final build log, which records successful OpenNext Worker output. The task report records 89 focused tests, typecheck, scoped lint and diff checks passing after the correction. These are existing execution results, not reviewer reruns. The historical 51-test local acceptance run remains limited to its earlier harness and does not establish mediated hosted behavior.

The controlled resolver-denial cases establish the website's reaction to authority changes; their labels do not establish real database commits, provider token revocation semantics or CDN isolation. The documentation preserves that distinction and the final-resolver snapshot limitation.

## Recommendations

Proceed with source integration while keeping serving closed. The next work remains the separately reviewed hosted acceptance package and its documented preflight, deployment, cache, real-session and resource gates. No source change is requested by this review.

## Declined to judge

- Deployed SQL, catalog/ACL state, empty inventory and writer quiescence: this review compares the website contract with accepted local SQL source; it performs no database/provider inspection or activation.
- Ordinary direct Storage denial and service-warmed cache isolation: these require the dedicated hosted negative tests and are explicitly outside this source plan.
- Actual Worker/domain/CDN bypass, browser replay and repeated-URL freshness: response headers and force-dynamic exports are source controls, not deployed cache acceptance.
- Real-session refresh compatibility, 64 KiB Auth compatibility and provider logout/revocation semantics: installed-SDK fixtures cover application behavior only; real-session acceptance remains separate.
- Worst-case Worker CPU/memory, highly fragmented ready streams, decoder overlap, cross-isolate concurrency and retained response buffers: finite source bounds and held-slot behavior are reviewed, but runtime capacity acceptance requires the planned hosted measurements. No claim that byte caps equal a measured memory/CPU budget is made.
- Retraction after the final resolver snapshot or of previously received bytes: the accepted architecture explicitly permits already-authorized in-flight bytes and cannot retract copies.
- Upload normalization/HEIC, future mobile readers, cleanup scheduling, payments and proof flows: these are excluded from the accepted website reader plan; dormant write routes remain closed.
- Fresh execution of tests/build or certification of the old local harness at final HEAD: the review instruction prohibits reruns; the cited results retain their recorded scope.

## Assessment

**Ready to merge: Yes, for local source integration.**

The full implementation is consistent with the accepted three-task plan and paired manifest contract, and I found no concrete correctness or security defect requiring another source revision. This approval does not authorize serving activation or establish hosted acceptance.
