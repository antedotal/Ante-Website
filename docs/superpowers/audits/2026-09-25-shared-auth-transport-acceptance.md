# Shared server Auth transport acceptance

25 September 2026. Website backend only; no deployment or provider calls.

Implementation commits `1f8b1c7`, `008c094` and `b2b1083` share an Auth-only fetch boundary across server, callback, proxy and isolated account clients. The installed SDK reproduced rejected-fetch, provider-error and malformed-success JSON logging leaks through the older callback adapter before implementation. Fixed errors remove provider data before SDK logging. Numeric failure status is preserved, including bodyless HTTP304; successful response streams are not eagerly consumed. Non-Auth RPC and Storage responses and errors remain unchanged.

The task review identified the HTTP304 construction edge, fixed with a failing regression followed by passing checks. Scoped re-review accepted specification compliance and code quality. Final integration review then found revoked-session cleanup depended on the provider session_not_found classification. Commit `b2b1083` preserves only that exact classification via a fixed safe envelope, reading at most 2048 bytes for at most 1000ms. Malformed, oversized or stalled bodies stay generic. An installed-SDK proxy regression confirms session and PKCE deletion for a revoked nonexpired session, with safe logs. Scoped final re-review accepted the fix with no new findings. The local slice is accepted through `b2b1083`; no merge, push or deployment is implied.

After the final fix: 159 tests across 19 files, TypeScript, lint, Next production build, synthetic OpenNext Worker build and diff checks passed. These are local synthetic transport/runtime build checks, not hosted provider, browser or deployment acceptance. Existing email activation and infrastructure gates remain closed.

Controller ruling: restrict sanitation to exact configured project origin and `/auth/v1` endpoints so SQL and Storage contracts remain intact. If this boundary excludes a future legitimate Auth endpoint, that endpoint needs an explicit reviewed extension; do not broaden sanitation to all Supabase traffic.

Controller ruling: existing session/cookie cleanup takes precedence over a universally generic Auth code. Preserve only the minimum recognised classification with bounded failure-body parsing and no raw fields or headers. If wrong, session cleanup could regress; the real installed-SDK proxy regression covers this boundary. For malformed, oversized or timed-out provider bodies, generic rejection intentionally cannot infer that classification.
