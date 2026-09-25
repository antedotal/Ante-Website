# Private profile photos: next backend contract

25 September 2026. Proposed implementation, not deployed behavior. Owner/current accepted friends is the confirmed user requirement. No additional product decision is needed for this bounded backend slice.

## Current evidence

Read-only hosted metadata shows no avatar bucket or application photo pointer. Existing proof Storage policies target their own buckets. Authenticated friendship INSERT/UPDATE are denied, and existing accepted relationships are preserved. The operation-aware Storage helpers exist. `profiles.avatar_url` remains a writable legacy URL column and mobile still consumes URL-shaped avatars; do not put private object paths or signed links into it. These metadata/source checks do not prove Storage HTTP behavior.

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

Bucket configuration and real server-key/Worker acceptance remain open. Create/manage blobs through Storage APIs, never by deleting storage.objects rows. Future account deletion must remove the canonical object and handle provider failures/in-flight writes; target-profile existence prevents an orphan from being served as an active photo. A per-upload retirement queue is unnecessary for fixed keys. No purchase or paid Images binding has been selected.

Official sources checked for this design: [access control](https://supabase.com/docs/guides/storage/security/access-control), [private downloads](https://supabase.com/docs/guides/storage/serving/downloads), [operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions), [ownership](https://supabase.com/docs/guides/storage/security/ownership), [Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [private CDN behavior](https://supabase.com/docs/guides/storage/cdn/fundamentals), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
