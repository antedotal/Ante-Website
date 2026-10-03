# Cloudflare Workers runtime implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Produce and locally exercise a deployable Workers build for the existing account backend, leaving the current Pages deployment untouched.

**Architecture:** Use the documented OpenNext adapter to preserve Next.js and its server routes. Build a separately named Worker without production routes or DNS mappings. Missing auth/limiter configuration must continue to deny account operations; a local build is not permission to enable an unverified deployment.

**Tech Stack:** Next 16.3.3, matching eslint-config-next, @opennextjs/cloudflare 1.20.6, Wrangler 4.139.0, existing pnpm and React. Inspect any additional required rclone.js peer before pinning it.

**Spec:** `docs/WEBSITE_BACKEND_GOAL.md`, `docs/CLOUDFLARE_BACKEND_READINESS.md`, and the user's instruction to prepare Workers while Pages stays live.

## Global constraints

- Execute after independent acceptance of callback admission, not concurrently with that task's implementer.
- No deployment, remote resource creation, DNS changes, provider email or website UI changes.
- Preserve pnpm lockfile/build-script policy. No unrelated dependency upgrades.
- Never commit .dev.vars, Wrangler state, generated bundles or credentials.
- Do not enable R2, Images or paid resources without identifying actual requirements; document any external binding prerequisite.

## Review focus

- Account cookies survive the actual Workers runtime and retain private/no-store headers.
- Missing secrets or a missing limiter cannot fall back to successful authentication.
- The built static asset directory contains no server-only key or HMAC value.
- Proxy/runtime incompatibility is resolved without skipping account identity checks.
- Preview does not contact production Supabase or alter the existing Pages project.

## Task 1: Runtime configuration and actual local preview

**Files:** `package.json`, `pnpm-lock.yaml`, `.gitignore`, `open-next.config.ts`, `wrangler.jsonc`, `next.config.ts`, optional runtime type declarations, `.guidelines/design.md`, and focused preview scripts/tests under `scripts/` and `tests/`. Modify the session proxy only if a demonstrated compatibility failure requires it; preserve callback admission ordering and test coverage.

- [ ] Establish the pre-change build/runtime gap: no Worker output or preview script exists. Retain the regular test/build baseline from the previous task; do not rerun it before any change without a new concern.
- [ ] Consult the installed adapter CLI help and current official docs before choosing commands. Pin Next 16.3.3 and eslint-config-next 16.3.3, OpenNext 1.20.6 and Wrangler 4.139.0; resolve any required rclone.js peer exactly. Use pnpm and review lockfile changes.
- [ ] Add `open-next.config.ts` using `defineCloudflareConfig` from `@opennextjs/cloudflare`. Add Wrangler config with a distinct `ante-website-backend-preview` name, `.open-next/worker.js` entrypoint, `.open-next/assets` asset directory, `nodejs_compat`, a supported compatibility date and any documented required self-reference binding. Do not add production routes, secrets or account IDs. Disable public preview URLs in deployment config until release gates pass.
- [ ] Add separate `build:worker` and `preview:worker` scripts based on installed CLI help. Preserve existing Next scripts for Pages/development. Ignore `.open-next/`, `.wrangler/` and `.dev.vars*`.
- [ ] Build the real bundle. If Node proxy support fails, capture the error and implement the smallest supported middleware/session integration with a failing behavioral test first. Do not remove session checks or downgrade the entire app to static output to obtain a green build.
- [ ] Start local Workers preview with no real secrets and a local-only port. Use synthetic configuration pointing at an unreachable/nonproduction host where needed. Check marketing HTTP success, callback host rejection, missing limiter denial and protected account non-disclosure. Inspect source/bundle split for server-only secret references and ensure secret modules are absent from browser chunks. Stop only the exact owned preview process afterwards.
- [ ] Run the website tests, typecheck, ESLint, Next build and Worker build once on final code. Record exact commands/results and preview evidence. Update design/readiness docs, commit and obtain independent review. Report missing hosted bindings, account access, provider configuration and actual identity tests without claiming deployment.

Acceptance: reproducible Worker artifact plus real local-runtime evidence, preserved callback/session safeguards, clean relevant checks, no change to Pages deployment. Actual Cloudflare deployment and same-user Google/email provider tests remain separate acceptance work.
