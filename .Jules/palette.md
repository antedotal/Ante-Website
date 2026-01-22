## 2025-10-26 - [Missing Props in Custom Links]
**Learning:** Custom UI components (like `ShimmerButton`) that wrap `next/link` or `<a>` must explicitly spread `...props` to the underlying interactive element. Without this, accessibility attributes (`aria-label`, `aria-disabled`) and event handlers (`onClick`) passed by consumers are silently swallowed, breaking accessibility and interactivity.
**Action:** Always verify that "as-link" variants of UI components spread `...props` (and handle type compatibility if needed, e.g. with `as any` or proper discrimination).
