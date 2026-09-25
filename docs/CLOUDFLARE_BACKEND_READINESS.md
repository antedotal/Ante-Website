# Cloudflare backend readiness

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

- Verify Cloudflare account/project access, canonical domain and a staging deployment target.
- Verify the same Supabase project as mobile, Google provider redirects, OTP email settings and SMTP delivery.
- Configure server-side limiter credentials and an HMAC secret without exposing them in chat, logs or browser bundles.
- Verify direct Cloudflare ingress: no same-zone Worker rewriting client identity, no Pseudo IPv4 overwrite, and no unexpected alternate ingress. Cloudflare documents special client-IP behavior for Worker subrequests; do not infer visitor identity from a spoofable fallback header.
- Preserve the retained local authority fixture. No reset, cleanup or new tests against that target are authorized by this website work.
- Keep financial settlement paused and preserve history.

References: [Cloudflare Next.js deployment paths](https://developers.cloudflare.com/pages/framework-guides/nextjs/), [OpenNext supported versions](https://opennext.js.org/cloudflare), [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
