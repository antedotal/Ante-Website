# Task 1 report — account visitor admission

## Result

Protected account pages and valid preset requests now consume the separate `consume_website_account_limit(p_visitor_hash)` service-only RPC before SSR/Auth. The HMAC domain is `website-account:v1:` and shares callback IP canonicalization, credential checks, timeout and exact reply parsing. Callback and normalized-email namespaces and their five-per-minute RPC remain unchanged. Preset canonical/query/body failures occur before account admission. The sign-in page is a static public entrypoint without server Auth or admission; the proxy bypasses API paths so routes own their one admission. Account data still uses the request-scoped public-key SSR client. All gate replies are private, with validated denial retry or 60-second unavailable retry.

## RED/GREEN evidence

- `pnpm test tests/account-admission.test.ts` initially failed 3/3 because `admitAccountVisitor` did not exist; after the fixed adapter/admission implementation, it passed with existing callback and store tests (36/36).
- `pnpm test tests/ante-presets.test.ts tests/account-session.test.ts` initially failed 4 route/proxy assertions: missing preset denial, sign-in still invoking Auth, missing protected canonical check, and duplicate API proxy work. After route integration, 29/29 passed. One test fixture needed a canonical Host header after the new boundary.

## Verification

- `pnpm test`: 8 files, 85 tests passed. Existing callback, email and verified-cookie cases remained green.
- `pnpm run typecheck`: passed after correcting one test-only `HeadersInit` union type.
- `pnpm run lint`: passed.
- Synthetic-public `pnpm run build`: passed; `/account/sign-in` static, `/account` and presets dynamic.
- Synthetic-public `pnpm run build:worker`: passed and emitted `.open-next/worker.js`. The final build used `https://localhost.invalid` as its project URL and a fake publishable key.
- Local Worker preview with that synthetic URL/key, canonical `http://localhost:8787` origin, and private ingress/key variables removed: `GET /account` 503, `GET /api/account/ante-presets` 503, `GET /account/sign-in` 200, hostile Origin 403, preset query selector and malformed PUT 400, unsupported POST 405 with `Allow: GET, PUT`. The 503 responses had `Retry-After: 60`; all inspected responses were private/no-store and lacked session cookies. The preview process was stopped.

The first smoke used `http://127.0.0.1:8787` as the synthetic canonical origin and got 403 because OpenNext's local preview presented the Next request URL as `http://localhost:8787` while preserving the `127.0.0.1:8787` Host. A temporary diagnostic line confirmed this and was removed; the final build and smoke used matching `localhost` origin and Host. Production origin validation was not relaxed.

## Scope and remaining gates

No UI, mobile code, dependencies, actual provider calls, hosted mutation or deployment changed. No real Supabase Auth was contacted. The paired Ante SQL acceptance and hosted quota checks were reported by the root agent; this website task did not verify service-key PostgREST against the hosted RPC. Local tests and Worker denial smoke do not prove hosted ingress, cookie refresh with a real provider or SQL atomicity. OpenNext reports its Node.js middleware support as experimental.
