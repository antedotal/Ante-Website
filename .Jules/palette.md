# Palette's Journal

## 2025-02-18 - [Semantic Forms in Next.js]
**Learning:** React state-controlled forms often miss semantic HTML structure, breaking native accessibility and behavior (like Enter to submit).
**Action:** Always wrap input fields and submit buttons in a `<form>` tag, even if using client-side state handling. Use `noValidate` if custom UI is preferred over browser bubbles.
