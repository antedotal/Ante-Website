# Cloudflare backend readiness

## 3 October 2026 — PR #37 build correction

The original PR build on 29 September installed its pnpm dependencies successfully, then failed with npm `ERESOLVE` while executing `npx @cloudflare/next-on-pages@1`. That temporary install selected next-on-pages 1.13.16 (Workers types v4) and Wrangler 4.143.0 (Workers types v5). The adapter supports only Next 14.3.0 through 15.5.2 and Edge routes, so overriding peer checks cannot build this Next 16.3.3 backend correctly. The later 30 September retry failed during Git cloning with a TLS/early-EOF error before dependency installation; that is a separate failure.

The user selected OpenNext Workers for PR #37 while keeping the existing production Pages site live. Use `pnpm run build:worker` with the repository's pinned OpenNext and Wrangler, rather than installing a Pages adapter with npx. `pnpm exec wrangler versions upload` uploads a build without replacing the currently deployed Worker version. The Worker entrypoint remains `worker-entry.mjs` so Wrangler includes both decoder WASM modules. Do not deploy `.open-next/assets` as a Pages site: that directory is only the asset portion of the Worker.

`package.json` pins pnpm 10.11.1 and `.node-version` pins Node 22.16.0, matching the failed build's environment. The native install policy now uses pnpm 10's `onlyBuiltDependencies` and `ignoredBuiltDependencies`; the older build ignored `allowBuilds`. The allowed/blocked packages are unchanged. The stale npm lockfile is removed and `start.sh` installs the frozen pnpm graph without independently upgrading ESLint.

Live dashboard inspection found the existing `ante-website-backend-preview` Worker manually deployed, with its Git repository disconnected. Connecting Workers Builds requires a new deployment token; that credential step needs explicit approval. Build configuration and authentication/photo release acceptance remain separate. The dated statements below are historical preparation evidence.

Local verification with Node 22.16.0 and pnpm 10.11.1 passed a clean frozen install, ESLint, all 366 application tests, the Next/OpenNext Worker build including TypeScript, and `wrangler deploy --dry-run`. The dry-run artifact includes the PNG and JPEG decoder WASM modules. The pnpm dependency lockfile is unchanged. This does not yet establish a successful hosted build or deployment.

Updated 25 September 2026. The user confirmed the current site is on Cloudflare Pages and authorized preparing a Workers deployment while Pages stays live. Email one-time-code sign-in is also approved; no email/password or magic-link UI is requested.

## Verified source state

The website now uses Next.js 16.3.3. Its feature branch has dynamic account rendering, a PKCE callback route, a session-refresh proxy, and local Wrangler/OpenNext configuration. The earlier inspected state had no Worker adapter. Those server functions cannot be represented by a static Next.js export.

Cloudflare's documentation separates static Next.js on Pages from full-stack deployment on Workers. OpenNext is a documented Workers adapter that preserves the existing Next.js application. A registry check found `@opennextjs/cloudflare@1.20.6` requires Next `>=15.5.24 <16 || >=16.3.3`, Wrangler `^4.125.0` and `rclone.js ^0.6.6`. Next 16.3.3, matching ESLint config, OpenNext 1.20.6, Wrangler 4.139.0 and `rclone.js` 0.6.6 are installed and the local Worker build passed. Wrangler requires Node >=22; the tested local Node was 26.8.2.

## Required implementation and acceptance

The separate local Worker build is configured with OpenNext 1.20.6, Next 16.3.3 and Wrangler 4.139.0. It has no production route or public preview URL. A synthetic `localhost.invalid` project build ran in local `workerd`: marketing returned 200; a forged callback Host returned 400; a same-origin callback without limiter configuration returned private/no-store 503 with `Retry-After: 60`; and `/account`, including a forged cookie, redirected to sign-in with private/no-store headers. The generated static assets contained no server-only credential or limiter symbols. This proves local runtime behavior only. OpenNext warns that Node.js middleware support is experimental, and an actual cookie refresh, hosted binding, provider flow and direct-ingress check are still required before deployment.

A correctly named synthetic auth cookie initially made `getClaims()` throw on a missing JWT expiry and produced a private 500 in the Worker. The proxy now catches thrown verification errors, redirects protected account paths to the configured site's sign-in route, and keeps sign-in reachable. Focused tests cover both paths; the corrected Worker preview result is recorded in the task report.

The existing marketing pages render optimized Next images. OpenNext requires a Cloudflare Images binding or a custom image loader for those requests; Cloudflare Images may incur charges. Neither was enabled in this backend-only preparation, so verify image delivery and choose its resource before any hosted Worker replaces Pages. No R2 cache is configured.

1. Finish and independently review callback admission. Trust only the explicit Cloudflare deployment's `cf-connecting-ip`, with no fallback to arbitrary forwarding headers. Reject malformed identity and fail closed when configuration or the durable store is unavailable.
2. Add pinned, compatible Workers build tooling and configuration. Preserve the existing Pages deployment, marketing files and routes. Do not publish or change DNS as part of local preparation. Keep secrets out of tracked files and assets.
3. Build the real Worker bundle and run a local Workers-runtime smoke test. Verify marketing responses, callback/protected-account behavior, cookie propagation, no-store headers, missing-config denial and secret isolation. A regular Next build does not prove Workers compatibility. Resolve actual proxy/runtime support from the adapter build, not a mocked test.
4. Implement and test the durable shared-store contract, including simultaneous first requests and role permissions, before enabling authentication. Hosted RPC `consume_website_callback_limit` was absent during the read-only check. Its website adapter alone cannot enforce a limit.
5. Add backend endpoints for requesting and verifying email one-time codes, with durable abuse limits before Auth calls, server-side validation, safe responses and session cookies. Configure the provider's email template to deliver the token rather than assume its default magic-link template is suitable. Verify provider/redirect and same-account identity behavior separately; do not claim it from mocks. No UI changes are in scope.

## Deployment gates

The new account email-change routes stay gated by server-only `ANTE_EMAIL_CHANGE_MODE=secure-two-inbox-otp`, deliberately unset in this Worker configuration. Set it only after the shared hosted Auth project has email confirmations and Secure Email Change enabled, its Change email address template sends distinct OTPs to both inboxes, and an authorized two-inbox/browser/Worker acceptance run confirms pending `new_email`, same-user completion and cookies. No recipient or hosted provider flow was used for local route tests; the mode string alone cannot certify those settings. See `docs/contracts/account-email-change.md`.

- Verify Cloudflare account/project access, canonical domain and a staging deployment target.
- Verify the same Supabase project as mobile, Google provider redirects, OTP email settings and SMTP delivery.
- Configure server-side limiter credentials and an HMAC secret without exposing them in chat, logs or browser bundles.
- Verify direct Cloudflare ingress: no same-zone Worker rewriting client identity, no Pseudo IPv4 overwrite, and no unexpected alternate ingress. Cloudflare documents special client-IP behavior for Worker subrequests; do not infer visitor identity from a spoofable fallback header.
- Preserve the retained local authority fixture. No reset, cleanup or new tests against that target are authorized by this website work.
- Keep financial settlement paused and preserve history.

References: [Cloudflare Next.js deployment paths](https://developers.cloudflare.com/pages/framework-guides/nextjs/), [OpenNext supported versions](https://opennext.js.org/cloudflare), [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

## Independent local review

Commit `5ed65d4` passed independent specification and code-quality review with no actionable findings. Final evidence: 54 tests, typecheck, ESLint, Next build, Worker build and frozen install passed; local workerd verified callback refusal and unauthenticated/malformed-cookie account redirection, with sign-in still reachable. All owned preview sessions were stopped. This accepts local Workers preparation only: successful provider cookie refresh, hosted ingress, durable SQL admission and image delivery remain unproven. The existing Pages deployment is unchanged.

## Email and database follow-up acceptance

Email backend commit `30aef8b` passed independent specification and code-quality review with no findings. All 68 website tests, typecheck, ESLint, Next build and Worker build passed. Both new POST routes ran in local workerd using synthetic public configuration: hostile Origin returned 403; canonical localhost Origin with missing limiter configuration returned 503 with Retry-After 60; all responses were private/no-store without session cookies. The preview was stopped afterward. Successful provider sessions and real Workers cookie exchange still need acceptance.

The shared backend repository now contains an independently reviewed local limiter release through `9c373b4`. Its real PostgreSQL 17.6 test admitted five and denied seven of twelve simultaneous first-use requests, and checked role permissions, expiry and cleanup. It remains undeployed; the hosted RPC, actual API credentials and cleanup scheduler must be verified before enabling these auth routes.

A read-only `wrangler whoami` check on 25 September reported no authenticated Cloudflare account. No Worker, public URL, DNS or Pages change was made. Provider email templates/SMTP, authorized test-recipient delivery and Google/email account linking remain open. Website limits do not protect direct calls to public Supabase Auth; provider abuse settings require separate acceptance.

## Whole authentication branch review

Independent review of `3915a7c..1636a91` found no actionable integration issues across session validation, origins, redirects, cookie handling, quota ordering, credential isolation, email OTP and Workers configuration. It also inspected installed SDK behavior. This accepts local authentication preparation, using the previously reported tests/builds/runtime checks; hosted/provider gates and the broader account, preset, task, proof and payment-setup goal remain incomplete.

## Updated connected-account state

The user identified antedotal.com in Havish's account (`5af41de7e4953ebc3d99f3ec07803736`). Cloudflare plugin reads confirmed active zone `de319241db3b178216ee2d05ba556509` and an empty Workers script list. Pages project and Workers-subdomain reads return API 10000 authentication errors in that account, despite Workers/domain read access. Daniel's account has no Pages projects or Workers. The other Cloudflare app connector reports not connected; use the working cloudflare_api plugin capabilities. Plugin access does not establish local Wrangler login or artifact upload credentials. No hosting/DNS change was made.

Shared limiter hosted SQL and cleanup acceptance are now recorded in the backend release README; the earlier undeployed status above is historical. New product decisions: A$1..A$50 user-selected presets, all profile edits, owner/friend-only avatar images, and delivery testing deferred until Workspace email is available.

## Direct Pages project verification

DNS lookup through the connected API showed the proxied CNAME antedotal.com -> ante-website.pages.dev. Direct GET of Havish's Pages project `ante-website` succeeded and confirmed domains antedotal.com, www.antedotal.com and ante-website.pages.dev. Account-level Pages listing still fails, so that error does not mean project-level access is absent.

Current production source is GitHub antedotal/Ante-Website, branch main. The hosted build command is `npx @cloudflare/next-on-pages@1`, output `.vercel/output/static`, repository root. Thus the current Pages configuration uses the older next-on-pages adapter; it is not evidence of a plain Next static export. Keep this live configuration unchanged while preparing the separate OpenNext Worker. No Cloudflare resource was modified.
