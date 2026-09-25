# Final whole-plan review — private photo endpoints

26 September 2026. Read-only review of website `2eaa5ce..bee1b53` and paired backend `500d322..83affa4`, scoped to the completed endpoint slice. Website HEAD was confirmed as `bee1b535a74be831b1ea5dcf3f5309c7ffdded5f`; tracked status was clean. The only write made by this review is this ignored report.

## Strengths

- The two tasks compose correctly: fresh `getUser(exactToken)` supplies the canonical mutation owner, and that same token reaches public-key profile checks and authenticated Storage downloads. Cookie `session.user`, browser headers, query selectors and target parameters cannot choose a privileged write location (`lib/server/profile-photo-session.ts:13-29`, `lib/server/account-profile-photo.ts:66-94`).
- Visitor admission precedes Auth; separate verified-user HMAC quotas precede profile/Storage work and image ingestion. The own-profile precondition blocks writes for a deleted/missing application profile. Verified refresh cookies survive subsequent outcomes; failed verification releases none.
- Privileged credentials are confined to the existing limiter and fixed-key mutations. The unchanged credential parser extraction preserves admission behavior. Reads use the public key and caller bearer; no general privileged client was introduced.
- The adapter bounds response bodies and uses one deadline across transport and consumption, rejects redirects, verifies exact mutation receipts and never retries uncertainty. The paired real Storage HTTP assertions pin actual upload/delete/idempotency responses without weakening existing authorization/revocation checks.
- Both route modules explicitly reject unsupported methods, including HEAD/OPTIONS. Successful GET validates stored bytes before returning original bytes with private/no-store and nosniff; no cache validator, range response, URL or provider body is forwarded. The corrected malformed-Auth status handling has actual-SDK regressions.
- Contract/design/goal documentation distinguishes implemented source, reported local checks, prior Worker validator acceptance, and unproven hosted/resource behavior.

## Issues

### Critical

None.

### Important

None.

### Minor and explicit deferred-item triage

| Ledger item | Final ruling | Reason and useful follow-up |
| --- | --- | --- |
| Combined fetch/body deadline and in-flight caller-abort coverage (`tests/profile-photo-store.test.ts:159-188`) | Retain as nonblocking test improvement. | Existing tests cover independently stalled fetch/body and an already-aborted caller. They do not demonstrate headers consuming part of the deadline or cancellation during an active body read. The single shared deadline and abort wiring are correct by inspection in `lib/server/profile-photo-store.ts:30-85`. Add delayed-header plus stalled-body and in-flight abort cases in a focused follow-up. |
| Never-settling cancellation coverage (`tests/profile-photo-store.test.ts:133-170`) | Retain as nonblocking test improvement. | Current producers complete cancellation synchronously. The implementation deliberately does not await cancellation, so no hanging response defect was found. Add a producer whose cancellation promise never resolves to protect this property. |
| Inherited expected denial stderr (Task 1 report, validation receipts) | Close as no product/security defect; optional test hygiene only. | Fixed admission labels contain no identifiers, tokens, paths, image bytes or raw provider/decoder details. Capturing and asserting expected warnings could improve test signal, but is not required for this source slice. |
| Task 2 design overview contradiction | Resolved by `32d39bc`; no remaining finding. | Current `.guidelines/design.md` describes implemented gated routes and their adapter/validator consumers consistently. |

## Verification assessment

Reviewed the plan, named contract/preparation/validator acceptance documents, current changed source and tests, both supplied cross-repository changes, task reports and review/rereview results. Read unchanged session-cookie and upload-stream seams to assess composition. No test suite, provider request, Docker operation, deployment or configuration mutation was performed.

Evidence accepted from the retained reports: Task 1 25 focused / 185 full website tests plus typecheck/lint and one real isolated Storage HTTP test; Task 2 62 focused / 201 full website tests plus typecheck/lint and a synthetic Worker build; after the Auth fix, 18 route tests plus typecheck/lint. The full suite and Worker build are prior-fix evidence, not falsely claimed as rerun at final HEAD. The narrow error-classification change does not create concrete doubt justifying rerunning them here.

## Release-gate assessment

The release gate is complete for this source-only acceptance: `ANTE_PROFILE_PHOTOS_MODE` must equal the exact server-only enabling value before admission/Auth/provider/decode work; absent or other values fail closed after cheap local request validation. No enabling deployment setting was added by this slice. The gate is an operator control, not evidence that production requirements already passed.

Activation remains blocked on hosted opaque-key upload/delete behavior; real exact-token own-profile/Storage owner/friend/denial receipts; Auth/JWKS and revoked-access behavior; browser/Worker cookie and ingress acceptance; authenticated cache freshness/revocation and direct transform nonexposure; target Workers plan and whole-pipeline CPU/peak isolate memory, including malformed/concurrent requests and PNG inflation before the codec gate. Account-deletion cleanup/reconciliation remains an explicit decision before activation. Conservative cache headers, local synthetic JWTs, tiny real-codec tests and a successful bundle cannot clear these gates. Concurrent writes/deletes retain the documented supersession and uncertainty semantics; no ordering guarantee is introduced.

## Recommendations

Retain the two targeted adapter coverage improvements as follow-up work. Preserve the documented closed mode and all release gates when merging the completed local slice. Update the controller handoff's pending whole-plan-review status to this verdict without converting it into hosted acceptance.

## Declined to judge

- Actual hosted Storage/Auth/JWKS/CDN, browser cookies, ingress and transform behavior: no provider operations were authorized for this review; source and local receipts cannot establish them. Gate completeness was assessed above.
- Target-plan CPU and peak isolate memory safety: no such measurement exists in this slice; the accepted validator explicitly leaves whole-pipeline and concurrency resource acceptance open.
- Full account-deletion cleanup implementation: explicitly deferred by the selected contract; this review checked that the race is documented and remains an activation dependency.
- Mobile/legacy avatar migration, metadata stripping, UI and financial/task-authority work: excluded from the endpoint plan. The incidental task-authority metadata handoff statement was not independently revalidated.
- Earlier branch work and deployed SQL/policy correctness beyond the adapter's stated interfaces: this review covers only the named endpoint slice and paired HTTP-test additions, not a new whole-project certification.

## Assessment

**Ready to merge? Yes — the completed closed-by-default local endpoint slice.**

No blocking correctness, security, composition or plan-compliance defect was found. This verdict accepts source integration only; hosted/resource gates remain open and production photo activation is not approved by it.

## Controller acceptance and decisions

Both tasks and the whole slice are accepted for closed local source integration. No merge, push or activation was performed; the broader backend goal remains active. The reviewer set aside actual hosted behavior and resource measurements because they require separate evidence; these remain activation gates, as does account-deletion cleanup. Excluded mobile/UI/financial work remains outside this goal. The task-authority absence statement was verified by the controller against hosted metadata on 26 September. Prior unrelated branch work is covered by its own acceptance receipts, not this review.

Ruling: Continue the already-selected private-photo backend contract without a new approval step, using closed routes and existing shared admission RPCs. Separate user upload/delete5/min and read60/min quotas are reversible technical defaults. Cost if wrong: local code/quota-namespace changes; no provider mutation or serving activation.

Ruling: Use officially documented single-object Storage DELETE because it matches the existing local protocol fixture and provides a precise missing-object result. Cost if wrong: reversible adapter/test changes; hosted credentials and activation remain blocked until exact acceptance.

The two nonblocking adapter test improvements above remain explicit follow-ups. The completed temporary review workspace may be removed after this receipt is committed; source, tests and this acceptance record remain in git.
