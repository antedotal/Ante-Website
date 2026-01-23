## 2024-10-24 - Native HTML5 Validation & Strict Domain Whitelisting
**Learning:** React `onSubmit` handlers are NOT called if a form field has the `required` attribute and is empty. The browser's native validation intercepts the event first. This breaks "empty submission" tests that expect a React-driven error UI (like custom toasts or inline errors).
**Action:** When testing empty form submission in React, either remove the `required` attribute for the test, or explicitly test for the browser's native validation UI (e.g., `input:invalid`).

## 2024-10-24 - Strict Email Domain Whitelisting
**Learning:** The `addToWaitlist` function (`lib/waitlist.ts`) enforces a strict whitelist of allowed email providers (Gmail, Outlook, etc.). Standard test domains like `example.com` are rejected with "That email is invalid!".
**Action:** When testing email inputs in this repo, use whitelisted domains (e.g., `test@gmail.com`) for success cases, or expect "That email is invalid!" when using dummy domains. Do not assume generic "Invalid email" regex errors.
