# Cloudflare Images synthetic fixture probe

Goal: determine whether the authorized Havish Workers account can process the exact synthetic HEIC that exhausted Supabase CPU, with JPEG/PNG controls. This is diagnostic evidence toward the approved compression requirement, not production acceptance.

Spec: `../audits/2026-09-26-cloudflare-images-candidate.md` and paired backend `2026-09-26-shared-photo-upload-contract.md`.

## Global constraints

No user images, app routes, paid upgrade, public source URLs, database/Storage writes, existing-site changes or photo activation. Only a new uniquely named temporary Worker; remove it after the bounded run. Four exact previously used synthetic fixture hashes and MIME values only. Dedicated random secret before body/codec work, server-configured expiry, POST only, private/no-store fixed JSON responses. Limit input/output to10MiB and body read to10seconds. Never return image bytes or provider errors. These four fixtures are opaque, including both PNGs, so select JPEGquality85 from known allowlisted metadata; PNG-for-transparency remains a production requirement and is untested here. Landscape1920x1080/portrait1080x1920 maximum, preserve aspect ratio/no crop/no upscale. Verify current API documentation. Preserve existing worktrees, Pages site and retention/financial pauses.

### Task 1: Diagnostic handler and tests

Create only `docs/superpowers/audits/evidence/2026-09-26-cloudflare-images-probe/` artifacts: handler, tests, exact fixture manifest, design and report. Test auth/expiry/method before processing, allowlist mismatch before codec, size/time bounds, expected transforms, output cap, fixed provider failures/private headers. Retain RED then GREEN. No provider mutations by implementer. Commit, then independent spec/quality review before root deployment. Tests verify orchestration, not actual codec behavior.

### Controller acceptance

Read-only preflight verifies target account, empty Worker list and known subdomain. Upload reviewed temporary handler with Images binding, dedicated secret and short expiry; no account plan changes. If upload/entitlement fails, record exact safe error and clean only resources this probe created. If successful, verify auth denial then each exact fixture, retain metadata receipts, delete temporary Worker and verify absence. Actual transformation is still not full input validation, metadata privacy or authenticated production-route acceptance. Update handoff and keep broad goal active.
