# Hosted account JWT acceptance implementation

Goal: prove the already-deployed name/preset ownership boundary using genuine hosted Auth sessions and public-key clients, independently of Cloudflare ingress. Spec: `../audits/2026-09-27-hosted-account-jwt-design.md`.

## Global constraints

Implement the complete bounded design: at most two fresh synthetic accounts, no email delivery/Auth setting change, public-key assertion clients isolated from admin credentials, exact fixture-only mutations, durable ownership/cleanup journal, no protected-child deletion, pre/post preservation fingerprints, fixed sanitized reporting. Never touch tasks, relationships, notifications, Storage, photo operations or money. No local recovery-environment access. Existing broader backend authorization covers a reviewed run; source implementation must not run hosted mutations before controller review.

The Supabase CLI2.118.0 provides `db query --linked --project-ref ... --file ... --output json` through the Management API, so no database password, credential extraction or permanent SQL helper is needed. The CLI and provider operations must have bounded deadlines and no blind retries. Read-only `config pull --dry-run` may inspect Auth hook/config prerequisites in memory; never print/persist raw sensitive config. Modern publishable key and server secret are separate inputs, loaded from server-only files/environment and never logged. The root can supply the public key obtained through the connected tool. Fixed project yxilmwxptfnebnjsikwo only.

### Task 1: Implement bounded runner and failure/cleanup tests

Create `scripts/acceptance/hosted-account-jwt.mjs` and a focused test beside it; add a small SQL/journal helper only if it keeps the runner clear. Follow TDD for credential separation, exclusive durable ownership journal, uncertain-create reconciliation (never exceed two accounts), request caps/timeouts, collision/preflight refusal, cleanup ownership/protected-reference refusal, precise SQL binding/escaping, failure cleanup and redaction. Use actual disposable PostgreSQL coverage for guarded cleanup SQL if needed; only the existing colima-ante-website-tests helper is authorized, never the retained recovery fixture.

Implement preflight, run and recovery cleanup as explicit modes. Default invocation must not mutate a provider. Preserve actual assertion errors as allowlisted status/code values; never suppress a failed assertion into success. Match exact currently deployed name/preset result contracts. Keep all fixture identity values durable but all passwords/JWTs/refresh tokens in memory. Do not delete or replace unresolved journals. Unknown schema/hooks/cleanup semantics fail closed.

Prefer the design's confirmed-user + password login flow, only after verifying it requires no email or project configuration changes. Do not fall back to another flow automatically. Require explicit controller invocation of run after code review. No implementation-agent hosted mutation; read-only metadata checks allowed. Update technical design documentation where relevant. Run focused tests, applicable typecheck and ESLint; no UI/build changes. Commit cohesive source and report RED/GREEN, runtime boundaries and unresolved prerequisites.

### Controller review and hosted acceptance

Independent spec/quality and final review precede any account creation. Complete fresh config/catalog/preservation and credential preflight. Run once with exact fixed project, at most two owned accounts, preserving durable journal across errors. Verify cleanup and preservation; if unexpected children/schema/fingerprints appear, diagnose read-only, never restore unrelated state. Passing proves named backend JWT/RPC checks only, not the deployed website, OTP email, Google, cookies, photos or payment readiness.
