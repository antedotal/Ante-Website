# Hosted profile reader acceptance operator

This runner is for the fixed `yxilmwxptfnebnjsikwo` project after the additive reader release. It tests Auth, Data API and private Storage with actual caller JWTs and service-created asset metadata. It does not turn on `ANTE_PROFILE_PHOTOS_MODE` or test the deployed website GET route, browser cookies, Worker or website cache behavior. The synthetic 1×1 PNGs prove transport and authorization, not image normalization.

Current status, 27 September: gateway compatibility is deployed and its eight checks pass, but the retry failed because a warmed legacy URL returned cached bytes after publication. Cleanup and preservation completed. Do not run a third fixture attempt merely with changed headers, delays or cache-busting. The [current handoff](../../WEBSITE_BACKEND_GOAL.md) links the failed receipts and cache diagnosis; a supported cache contract or separately reviewed serving architecture must precede another attempt.

The release controller must review the deployed final-state postconditions, 22 protected-table fingerprints, and resulting catalog before providing pins. The original reader receipt used catalog `1f3ea6c43d2f6af37fd5ddebdd457168aae01ec6166cacc8e9edd0776063f6ec` and backend `55accbedf36cc1012bda1d64a6b149f263674361`. The gateway retry used catalog `5bd4b88a78bf199cf77be2d5f9f61cb0adba6fe8caabfc0b4c1ce835bbff3c91`, backend `a6ad9d1126906d1e1c05b46c5eca483c0f5efd40`, and unchanged adapter SHA256 `2c64d3dbba5c6355ab07964b228c03d254694c7b650cbb5cb7e11bacc36d8769`. These identify historical attempts, not authorization or automatic defaults for another run. Any future approved attempt requires fresh exact reviewed pins.

From the paired Ante-Website checkout, set all three `ANTE_READER_EXPECTED_CATALOG`, `ANTE_READER_BACKEND_COMMIT`, and `ANTE_READER_ADAPTER_SHA256` to the reviewed exact hex values. Supply `ANTE_ACCEPTANCE_PUBLIC_KEY_FILE` and `ANTE_ACCEPTANCE_SECRET_KEY_FILE` as private regular files owned by the invoking user with no group/other permissions; do not set the corresponding direct-value variables simultaneously. The script never prints credential bytes, passwords, caller JWTs or raw provider bodies. Set `ANTE_ACCEPTANCE_STATE_DIR` to a private location outside Git, or use the default `~/.local/state/ante-acceptance/hosted-profile-photo-readers`. The directory is mode 0700 and journals/lock are mode 0600. Keep the private journal until cleanup and preservation are confirmed.

Run one read-only preflight before any fixture mutation:

```sh
node --experimental-strip-types scripts/acceptance/hosted-profile-photo-readers.mjs preflight
```

The preflight checks the explicit pins and fixed backend adapter import, current catalog, and all eight distinct passing checks from `Ante/supabase/releases/profile-reader-gateway-compatibility/postconditions.sql`: `resolver_grant`, `private_helper`, `safe_function_shapes`, `operation_scoped_policy`, `storage_policy_inventory`, `operation_helper_shape`, `private_bucket`, and `service_rpc_grants`. It also checks Auth dry-run hook/CAPTCHA safety, exact fixture-email collisions, an admin credential probe, the empty profile bucket/heads/operations expectation, and a 22-table preservation baseline. It uses no hosted mutation. Review its result and the new release receipt before the one permitted fixture run:

```sh
node --experimental-strip-types scripts/acceptance/hosted-profile-photo-readers.mjs run --reviewed
```

The runner persists mutation intents and counters before dispatch, then exercises legacy access, G1 publication, friendship revocation, hidden G2/replacement, hidden G3/clear, and representative private exposure denials. Test requests stop after six minutes; each HTTP response/body has a ten-second deadline, 16 KiB JSON cap or 4 KiB synthetic image cap, and no retry or redirect. Separate ceilings are run Auth 12, Data 52, Storage 40, CLI 20 and initial cleanup Auth 6, Data 8, Storage 16, CLI 16; combined initial ceiling 170. Each explicit recovery command creates a new durable invocation epoch with its own cleanup-sized ceiling; earlier counters and one-attempt creation/upload history remain in the journal. An unresolved journal blocks a new run.

The `run` command always attempts cleanup after assertions, preserving distinct failed assertion and blocked cleanup labels. A blocked result includes the private journal path and is not a pass. Preserve that journal and investigate the recorded fixed labels plus current provider state; do not delete rows manually, retry Auth creation, overwrite a key, or reset counters. Recovery uses the exact saved run ID:

```sh
node --experimental-strip-types scripts/acceptance/hosted-profile-photo-readers.mjs cleanup --run-id <journal-run-uuid>
```

Use `--recover-lock` only after verifying the previous local process has exited; it removes an owner-matching same-host stale lock, not a live one. Lost create acknowledgments require one exactly marked Auth candidate and its trigger-created profile. Lost reserve/bind/prepare/publish/clear acknowledgments are reconciled from the exact pre-journaled operation IDs and authoritative head; those RPCs are never resent. Known reserved or bound unpublished operations may be removed after the guarded ownership check. Lost upload acknowledgments require exact bytes to be present; an absent key stays unresolved because delayed completion is still possible. Metadata teardown checks ownership, private preset/quota rows, Storage ownership/multipart/bucket references, and other protected references under the publication advisory lock before removing the one friendship, fixture profiles, head and operations. Only then may the runner delete exact Storage keys, run the complete per-user protected-reference inspector, and finally delete Auth users. A changed marker, email, creation time, profile, operation, object digest/MIME/count, protected reference, catalog or fingerprint blocks destructive cleanup. The final preservation comparison must match the preflight baseline; unrelated live drift is reported, never repaired by deleting unrelated rows.

Run local safety checks before reviewing a runner revision:

```sh
pnpm test:acceptance:local
pnpm exec eslint scripts/acceptance/hosted-profile-photo-readers*.mjs
pnpm run typecheck
```

The CLI performs hosted calls only when the operator invokes it with credentials. Local tests use an injected transport and disposable PostgreSQL; they do not establish hosted privacy acceptance. The receipt must state separately whether the HTTP/Auth/Storage runner passed and whether website/Worker acceptance remains open.
