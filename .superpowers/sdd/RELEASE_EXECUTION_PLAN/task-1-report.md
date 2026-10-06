# Task 1 report: website origin/routing/account source readiness

Status: **DONE_WITH_CONCERNS** (source remediation complete; hosted/browser acceptance delegated to root and remains open).

Worktree: `/Users/daniel/.codex/worktrees/release-readiness/Ante-Website`
Branch: `codex/release-readiness`
Baseline: `c1ce9352be5254b10efa580249b31eae9de20c64`

## Changes and rationale

- `next.config.ts`: production build invokes the existing runtime `accountConfig()` validator before Next public values are frozen into client/server output. No parallel validator or key logging introduced. Development configuration remains usable.
- `lib/production-origin.ts` and `worker-entry.mjs`: recognized www GET/HEAD canonicalize to fixed HTTPS apex before OpenNext/account processing, preserving encoded path/query. Unsafe methods return private no-store 403 without Location, preventing cross-host POST replay. Request URL determines the recognized host; untrusted Host/forwarded headers cannot select destinations. Apex/local/workers.dev/acceptance/preview/unrecognized hosts pass unchanged.
- `wrangler.jsonc`: explicit `antedotal.com/*` and `www.antedotal.com/*`, both zone_name `antedotal.com`; preserve existing Worker identity, self-reference, workers_dev=true, preview_urls=false, decoder bindings. `assets.run_worker_first=true` prevents asset-first serving from bypassing canonicalization; canonical asset requests now invoke the Worker before existing OpenNext ASSETS handling.
- Design and shared release status document the implementation and remaining gates. Old Wrangler private-preview comments contradicted observed production routing and were corrected.
- No provider mutation, deployment, push, Auth emails, credentials storage or serving gate activation. Primary dirty files/photo work untouched.

## Actual hosted context supplied by root

Active version `a79ce667-3559-4b8c-b8bf-efe6c1f2a56d` binding metadata contains ASSETS, WORKER_SELF_REFERENCE, ANTE_AUTH_LIMIT_HMAC_SECRET, SUPABASE_SECRET_KEY, with no plain-text public config or ingress binding. No established configured accepted origin was found. Per requirements, fixed apex `https://antedotal.com` is selected. Root still verifies actual build configuration and Supabase redirects before promotion.

## Current documentation

Context7 `/vercel/next.js` confirms NEXT_PUBLIC variables inline at build and cannot be repaired solely by runtime binding changes. Context7 `/llmstxt/developers_cloudflare_workers_llms_txt` confirms asset-first routing bypasses Worker code unless run_worker_first executes middleware first. Sources: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/environment-variables.mdx and https://developers.cloudflare.com/workers/static-assets/binding/.

## Exact verification commands and observed evidence

1. `pnpm install --frozen-lockfile --registry=https://registry.npmjs.org`: exit 0; 767 locked packages installed. Warning: Supabase CLI bin missing; unrelated to website build/tests and no CLI provider operation attempted.
2. `pnpm test -- tests/account-config.test.ts tests/account-sign-in.test.ts tests/account-session.test.ts tests/account-admission.test.ts tests/callback-admission.test.ts tests/shared-auth-proxy-revoked-sdk.test.ts`: wrapper forwarded `--`, causing entire Vitest suite to run: **33 files / 386 tests passed** before host changes. Initial accompanying `pnpm typecheck` failed on 14 static image declarations because pristine worktree had no generated next-env.d.ts. Next build generated it; subsequent typecheck passes without source workaround.
3. `pnpm exec vitest run tests/production-origin.test.ts tests/account-config.test.ts tests/account-sign-in.test.ts tests/account-session.test.ts tests/account-admission.test.ts tests/callback-admission.test.ts tests/shared-auth-proxy-revoked-sdk.test.ts`: exit 0, **7 files / 67 tests passed** after host changes. Includes encoded callback query preservation, safe methods, unsafe-method denial, hostile headers/unrecognized hosts and protocol-relative path defense, build config gate, account/Auth/session/admission behavior.
4. `pnpm lint`: exit 0 after each implementation iteration. `pnpm typecheck`: exit 0 after generation. `git diff --check`: exit 0.
5. `env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u NEXT_PUBLIC_SUPABASE_ANON_KEY -u NEXT_PUBLIC_ANTE_SITE_ORIGIN pnpm build > /private/tmp/ante-release-missing-config-check.log 2>&1`: expected exit 1 before compilation; field-only error `NEXT_PUBLIC_SUPABASE_URL is required for account sign-in`.
6. `NEXT_PUBLIC_SUPABASE_URL=https://yxilmwxptfnebnjsikwo.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localcheck NEXT_PUBLIC_ANTE_SITE_ORIGIN=https://antedotal.com pnpm run build:worker > /private/tmp/ante-release-build-check.log 2>&1`: exit 0, `OpenNext build complete.` **Synthetic key: output is not deployable.** Earlier synthetic-origin build also passed. Build warns Node middleware support is experimental in OpenNext; unchanged platform constraint.
7. `pnpm exec wrangler deploy --dry-run --outdir /private/tmp/ante-release-worker-dryrun > /private/tmp/ante-release-worker-dryrun.log 2>&1`: exit 0, `--dry-run: exiting now.`, 49 assets, 13,581.01 KiB / gzip 3,160.46 KiB, ASSETS and self-reference preserved. No upload/deploy.
8. Node filesystem inspection returned counts/booleans only: canonical `https://antedotal.com` exists in 1 client and 7 server artifacts; dry-run bundle contains recognized alternate and fixed canonical origin. No credential values emitted.

## Self-review

- Fixed redirect cannot create an open redirect; target origin is constant and path assignment retains fixed authority even for `//attacker` paths.
- Unsafe requests are rejected before body consumption or account processing; GET/HEAD callback codes retain query encoding and reach only canonical account handlers.
- Shared validation avoids divergence between build and runtime. Public values must be rebuilt correctly, not merely added to runtime.
- Local helper tests plus generated Wrangler bundle verify source inclusion, not live ingress/auth/cache/browser semantics.
- Worker-first assets increase Worker invocation; paid plan already established by release context, but actual quota/lifecycle acceptance remains root's gate.

## External gates and concerns

Independent source review; real-key build with correct public URL/origin; configured ANTE_AUTH_INGRESS=cloudflare and existing private admission prerequisites; Supabase accepted callback Site URL/redirect allowlist; live apex/www routes and active version; anonymous homepage/sign-in/account/API matrix, private denial/no-store and direct Cloudflare ingress; authenticated email/session/browser acceptance. workers.dev stays operational but account validation must deny it. Remove/rebuild synthetic artifacts before real deployment. Account links, photo/email-change serving and settlement remain closed. No local success establishes hosted acceptance.

## Commits

Source commit recorded in task return (this report is committed with the source; its own SHA cannot be embedded before commit).

## Reviewed follow-up: persist admission ingress

Independent source review approved `3dbc016` (see task-1-review.md). Root requested tracked nonsecret `vars.ANTE_AUTH_INGRESS=cloudflare` in Wrangler so later versions uploads cannot drop admission ingress. Added the explicit binding with a purpose comment; design/status explain that it does not supply private admission credentials or relax origin/visitor validation. Public key remains untracked. Root owns actual verified-public-config rebuild and hosting.

Commands after edit: `pnpm lint` exit 0; `pnpm exec vitest run tests/account-config.test.ts tests/account-admission.test.ts tests/callback-admission.test.ts tests/production-origin.test.ts` exit 0, **4 files / 44 tests passed**; `pnpm exec wrangler deploy --dry-run --outdir /private/tmp/ante-release-ingress-dryrun > /private/tmp/ante-release-ingress-dryrun.log 2>&1` exit 0, `--dry-run: exiting now.`, binding `env.ANTE_AUTH_INGRESS ("cloudflare") Environment Variable` present; `git diff --check` exit 0. No rebuild performed and no hosted operation attempted. Follow-up commit SHA is supplied in task return.
