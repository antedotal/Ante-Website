# Private profile photos: next backend contract

25 September 2026. Selected implementation contract. The SQL prerequisite is now deployed; website endpoints and HTTP/cache acceptance remain incomplete. Owner/current accepted friends is the confirmed user requirement. No additional product decision is needed for this bounded backend slice.

## Current evidence

Initial read-only hosted metadata showed no avatar bucket or application photo pointer; the empty bucket has since been deployed as recorded below. Existing proof Storage policies target their own buckets. Authenticated friendship INSERT/UPDATE are denied, and existing accepted relationships are preserved. The operation-aware Storage helpers exist. `profiles.avatar_url` remains a writable legacy URL column and mobile still consumes URL-shaped avatars; do not put private object paths or signed links into it. These metadata/source checks do not prove Storage HTTP behavior.

## Selected simple design

Use private bucket `profile-photos` and one exact canonical key `<verified owner UUID>/avatar`. Website mutations derive the owner from fresh public-key Auth verification, never a submitted path/owner/URL. A separate server-only Storage adapter may use the existing server credential only for fixed-key writes/deletes; this explicitly expands its reviewed purpose beyond admission. Reads use the caller's JWT and Storage authorization. Preserve legacy avatar_url values, grants and readers; the new contract never falls back to them. Mobile adoption is a documented separate dependency.

No pointer, reservation, revision or per-upload cleanup tables are required. Server-only validated upserts replace the fixed object; deletion uses Storage remove. Return success only when that provider operation succeeds; uncertain transport outcomes are503, without automatic mutation replay. Ordinary overlapping operations may supersede one another; no stale-edit rejection, last-click ordering or delete-wins guarantee is claimed. Supabase documents last-completed behavior for simultaneous same-key uploads, but mixed upload/delete ordering still needs empirical acceptance.

Storage policy must require the fixed bucket, exact canonical key grammar, existing target profile, and caller=owner OR a current accepted friendship in either orientation. If a private definer helper is necessary, use auth.uid(), fixed search_path, qualified tables and minimal grants. An authenticated SELECT policy must also require `storage.allow_only_operation('object.get_authenticated')`: generic SELECT can otherwise permit signed links. No anonymous or authenticated write/delete policies. Deny listing, signing, bulk signing, transforms, copy/move and public reads for this bucket. Leave proof policies untouched.

## Website contract and validation

- PUT `/api/account/profile/photo`: bounded binary JPEG/PNG; canonical origin and verified owner; visitor admission before Auth and separate durable user upload quota; validate actual format and bounded dimensions/parser work, then service-only upsert at the owner's fixed key. No remote URL ingestion or caller-controlled storage location.
- DELETE same route: verified owner, durable user delete quota, fixed-key Storage remove. Missing object is idempotent success if the provider confirms it. Do not claim erasure on provider uncertainty.
- GET `/api/profiles/[ownerId]/photo`: verify caller, derive exact target key, caller-JWT authenticated download. Return bytes with validated image MIME, nosniff and private/no-store. Missing/unauthorized photo both404; no redirect, signed URL, public URL or image-optimizer route. Apply visitor/user read admission and preserve verified refresh cookies.

Initial technical defaults can be2MiB and JPEG/PNG only. Use a maintained pinned Worker-compatible structural validator, not only MIME/magic bytes. Check streaming size before buffering and dimensions before any expansive processing. Re-encoding, metadata stripping, resizing and paid image services are not user requirements; if omitted, do not claim metadata removal. Test malformed/active-format and excessive-dimension input plus actual Worker behavior before selecting the implementation.

## Acceptance and remaining infrastructure

Real Storage tests must cover owner/friend in both orientations, stranger/pending/rejected/ex-friend, malformed keys, public/signed/list/transform/copy/move denials, denied direct mutations, authenticated byte reads, replacement/deletion uncertainty, and no browser credential leakage. PostgreSQL role tests cannot establish Storage operation tags or caching behavior. Use authorized synthetic accounts/objects, never real profile photos or existing relationship rows as probes.

Fixed keys trade simplicity for replacement freshness. Set conservative upload cache control and forbid website caching; verify read-after-unfriend/deletion through the actual authenticated Storage endpoint. Cache settings alone do not prove current authorization checks. Already delivered bytes and in-flight reads cannot be recalled. Do not enable serving if acceptance shows cached bytes bypass current authorization.

Bucket configuration is deployed; real server-key/Worker acceptance remains open. Create/manage blobs through Storage APIs, never by deleting storage.objects rows. Future account deletion must remove the canonical object and handle provider failures/in-flight writes; target-profile existence prevents an orphan from being served as an active photo. A per-upload retirement queue is unnecessary for fixed keys. No purchase or paid Images binding has been selected.

Official sources checked for this design: [access control](https://supabase.com/docs/guides/storage/security/access-control), [private downloads](https://supabase.com/docs/guides/storage/serving/downloads), [operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions), [ownership](https://supabase.com/docs/guides/storage/security/ownership), [Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [private CDN behavior](https://supabase.com/docs/guides/storage/cdn/fundamentals), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Preparation findings

A rolled-back hosted policy permission probe confirmed this migration connection can create a policy on `storage.objects`, despite role-membership inspection returning false. A follow-up confirmed the probe policy was absent and no `profile-photos` bucket existed. Preserve the existing proof policies; their current bucket predicates exclude the proposed bucket. Supabase documents [creating a bucket with SQL](https://supabase.com/docs/guides/storage/buckets/creating-buckets), so an empty private bucket and its policy can be prepared in the backend release. Blob operations still require the Storage API. Actual HTTP authorization and cache behavior remain unverified.

Validator research found a bounded candidate in pinned `jpeg-js@0.4.4` plus `pngjs@7.0.0`, but selection remains open. Both have old releases, and the bounded non-interlaced PNG decoder uses private zlib internals that must work in the actual Worker runtime. Do not silently relax the maintained-validator requirement or substitute header-only checks. The next validation task should establish runtime compatibility, malformed compressed-input bounds and practical CPU/memory limits before choosing a production decoder. No package or photo endpoint has been added.

## Planned HTTP acceptance fixture

Read-only research suggests a separate run-owned Storage API container can share the disposable Postgres container's isolated network namespace and use its own tmpfs file backend. Synthetic JWTs and direct loopback HTTP would test the real operation tags without real credentials, published ports, host mounts or the retained Supabase fixture. This topology has not booted or passed a request yet; self-migrations, role/JWT propagation, PostgREST requirements and image-transform dependencies must be checked before relying on it. Use the actual `public."friend pairs"` schema and reviewed release, not a rewritten policy. Pin and inspect the chosen official image digest first.

The first useful service test is upload through a synthetic service token, followed by owner/friend/stranger download and denied signing/listing through user tokens. Then test both friendship orientations, revocation, replacement, removal and mutation denials. A disabled transform endpoint is not proof of transform RLS. Even complete local HTTP coverage does not establish hosted CDN revocation behavior, real Auth keys or Worker/browser acceptance.

## SQL prerequisite deployed

The paired Ante release `supabase/releases/private-profile-photos/` is independently reviewed through3260b5a and deployed as20260925132728_private_profile_photos. Six hosted postconditions passed and eight preservation groups matched. The private bucket is empty; no existing profile, friendship, object or avatar value changed. This proves installation of the reviewed SQL contract, not Storage HTTP/cache behavior or readiness to serve photos. Continue with the isolated real-service acceptance fixture and bounded Worker validator before website activation.

## Decoder runtime candidate

Follow-up source research selects exact `@jsquash/png@3.1.1` and `@jsquash/jpeg@1.6.0` for a bounded Worker compatibility experiment, not activation. The project documents Workers support and has more recent maintenance evidence than the previous pure-JS candidates. Its PNG wrapper disables checksum verification, so our bounded chunk preflight must verify every CRC, ordering and legal lengths, reject animation/interlace and compressed ancillary chunks, and enforce dimensions before full decode. JPEG needs a bounded marker/dimension preflight and matching complete decoded output. Original JPEG bytes may retain metadata.

The published JPEG codec has no configurable allocation cap and permits a large WASM heap; PNG's internal allocation budget is best effort and excludes output buffers. Therefore package choice alone does not satisfy resource acceptance. Verify actual OpenNext bundling, static WASM initialization, malformed input/inflation behavior, concurrent decode memory and CPU against the target Worker plan. Keep serving disabled if these gates fail; a custom capped codec build is a separate reviewed technical decision. No decoder dependency or image endpoint is installed yet.

Primary source pointers: [jSquash](https://github.com/jamsinclair/jSquash), [PNG codec](https://github.com/jamsinclair/jSquash/blob/main/packages/png/codec/src/lib.rs), [JPEG decoder](https://github.com/jamsinclair/jSquash/blob/main/packages/jpeg/codec/dec/mozjpeg_dec.cpp), [Cloudflare WASM support](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/).

## Actual local HTTP evidence

The paired backend now has `scripts/backend/integration/private-profile-photos-http.test.mjs`, verified through `1f0565f` against official Storage API 1.74.0 arm64 pinned to `sha256:61f9c2d8cb83b0fef00ad0f1b7fe4b830bb5cb39985c944c2f92c9b097f9746c`. Storage self-migrated its real schema/helpers and consumed the unchanged reviewed release. Exact bytes, policy-removal/restoration, both accepted-friend orientations, same-token relationship/profile revocation, signing/listing/direct-mutation denial, replacement and deletion passed. Assertions require valid route-specific errors or exact valid result shapes, not arbitrary 4xx. Run-owned containers were removed after success and a controlled fixture failure. No hosted photo was created or served.

This proves the pinned isolated file-origin service. Its transform route was disabled, so transform authorization remains untested. Hosted direct transform endpoints must not expose private bytes regardless of whether the website uses them: if enabled, test authorization; if disabled, record unavailability without claiming RLS proof. Hosted CDN/JWKS/cache, website validation/credentials/cookies remain open. A separate publishable-key hosted Data API probe returned 406/PGRST106 for the private schema, establishing current exclusion at that boundary.
