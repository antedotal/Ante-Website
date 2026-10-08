# Website runtime design

The website uses Next.js, React and the pinned pnpm/OpenNext Cloudflare toolchain. Package and lockfile versions are authoritative. Public build configuration is validated before compilation; private credentials are supplied outside tracked files.

## Closed payment publication boundary

This distribution includes the required card, consent, task funding, collection recovery, payment review/notices and Premium account surfaces. `paymentWebsiteSourceEnabled()` returns false for this distribution because private source-acceptance evidence is omitted. Environment presence cannot activate a financial flow. Its existing downstream gates remain in place. Canonical unavailable pages render before account/Auth or credential admission; Scoped review/collection aliases and unsafe requests retain their strict original fences; card/funding/Premium preserve their existing unavailable-page matching behavior. A separately reviewed source transition is required before financial activation.

The task UI binds affirmation to the displayed quote identifier/hash/task revision; the server compares that selection against its owned cookie before financial admission. The server remains authoritative for amount, currency and snapshots. Recovery retains original operation/owner identity, current billing revision/generation and pending locks. Provider-verified paid intervals and task commitments are independent of nonpaid status. Synthetic previews do not establish provider or entitlement acceptance.

Pricing, caps, approved terms and live financial configuration remain external prerequisites. No subscription or task charge is activated here. Existing public legal pages are preserved. The new runtime payload excludes private evidence, fixture DSL, source pins/witnesses and backend SQL installations. Unrelated already-published source, tests, documentation and assets remain inherited unchanged; they grant no runtime or financial acceptance. Behavior tests exercise the actual account components, HTTP/cookie selection and closed publication gates; local compilation or synthetic tests cannot establish hosted/provider/financial acceptance.
