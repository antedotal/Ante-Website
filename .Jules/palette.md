## 2024-10-24 - Skip to Content Implementation
**Learning:** In Next.js App Router, purely ID-based navigation for "Skip to content" can fail to shift focus programmatically if the target container isn't focusable.
**Action:** Always add `tabIndex={-1}` and `outline-none` to the target `<main>` or container element when implementing skip links to ensure the browser actually moves focus context, not just the viewport scroll position.
