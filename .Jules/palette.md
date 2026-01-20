## 2025-02-19 - The Case of the Missing Props
**Learning:** Custom UI wrappers often forget to pass down `props` to the underlying element, breaking accessibility attributes like `aria-label`.
**Action:** Always check `...props` spreading in UI component libraries, especially those returning multiple variations (Link/a/button).
