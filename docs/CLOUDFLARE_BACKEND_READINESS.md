# Cloudflare backend readiness

Updated 25 September 2026. The user confirmed the current site is on Cloudflare Pages and authorized preparing a Workers deployment while Pages stays live. Email one-time-code sign-in is also approved; no email/password or magic-link UI is requested.

## Verified source state

The website uses Next.js 16.1.1. Its feature branch has dynamic account rendering, a PKCE callback route and a session-refresh proxy. No Wrangler or Cloudflare adapter configuration was present when inspected. Those server functions cannot be represented by a static Next.js export.

Cloudflare's documentation separates static Next.js on Pages from full-stack deployment on Workers. OpenNext is a documented Workers adapter that preserves the existing Next.js application. A registry check found `@opennextjs/cloudflare@1.20.6` requires Next `>=15.5.24 <16 || >=16.3.3`, Wrangler `^4.125.0` and `rclone.js ^0.6.6`. `next@16.3.3` and matching ESLint config exist; its React peer range accepts the current React 19 dependency. These are candidate versions, not installed or verified compatibility claims. Wrangler 4.139.0 requires Node >=22; the current local Node is 26.8.2.

## Required implementation and acceptance

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
