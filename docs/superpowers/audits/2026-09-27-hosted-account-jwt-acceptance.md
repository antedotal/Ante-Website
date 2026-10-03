# Hosted account JWT acceptance — 27 September 2026

Accepted for the named direct Supabase Auth/Data API checks on project `yxilmwxptfnebnjsikwo`, using implementation `e9cc199`. This is not website or release acceptance.

The [accepted receipt](evidence/2026-09-27-hosted-account-jwt/accepted-run.json) records 33 passing checks, 28 Data API requests, eight Auth/session requests, two account creates and two exact account deletes. Both synthetic accounts were removed. All 22 tracked application/private/Storage table fingerprints match their pre-run values; catalog and grants remained pinned. No email, task, friendship, notification, photo, Storage-object or payment mutation was performed by the runner.

Verified behavior:

- Two genuine Auth sessions, verified by `getUser`, independently read/write normalized names and AUD presets using public-key clients.
- Extra owner selectors, direct name updates, private preset access, anonymous account reads and authenticated/anonymous service-only photo-state calls are denied.
- Removing the owned profile makes name GET and SET return exactly `P0002`/HTTP 500 without recreating profile/quota state.
- Logout succeeds and the revoked refresh token is rejected with HTTP 400 / `refresh_token_not_found`. Post-logout `getUser` returned HTTP 400 with a code outside the runner's allowlist, recorded as `unclassified`; no `session_not_found` or browser-cookie claim is made.

The [first receipt](evidence/2026-09-27-hosted-account-jwt/initial-run.json) remains a failed run. Its first 28 checks passed, then the harness incorrectly expected HTTP 404 for `P0002`. Both accounts were cleaned and all 22 fingerprints matched. [PostgREST documents P0 errors as HTTP 500](https://docs.postgrest.org/en/stable/references/errors.html). The precise expectation was corrected with a failing regression, independently reviewed, then exercised in the fresh successful run. Other HTTP 500 errors remain failures.

## Source and review evidence

`4a8740a` added the runner and SQL guards; `6586a21` corrected SQL NULL ownership handling, durable classified failures and canonical journal placement after independent review. The 23-test combined run included actual disposable PostgreSQL cleanup protection; typecheck and targeted ESLint passed. `e9cc199` added the HTTP status regression; all 23 Node unit tests and targeted ESLint passed on that change. The unchanged PostgreSQL suite was not repeated for the status-only correction. Independent task, scoped fix and final component reviews approved bounded execution; the runtime correction received a further scoped review with no findings.

Private append-only recovery journals remain outside Git in `~/.local/state/ante-acceptance/hosted-account-jwt/`, keyed by the receipt run IDs. They contain no credentials or tokens. Both runs are resolved; retain them as evidence rather than reusing their identities. The committed receipts omit fixture identity details.

## Remaining gates

Cloudflare deployment, trusted ingress, website routes, browser cookies, OTP/email delivery and Google identity are unverified by this component. No photo processor, immutable upload/readback/reader flow or cleanup schedule is activated. Task authority and Stripe consent/customer-ownership prerequisites remain separate. The [website goal handoff](../../WEBSITE_BACKEND_GOAL.md) remains active and incomplete.
