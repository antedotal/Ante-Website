## 2024-03-24 - [Skip to Content]
**Learning:** Adding a "Skip to Content" link is a critical accessibility feature that allows keyboard users to bypass repetitive navigation. It requires a hidden anchor link at the top of the body and a target element with `id="main-content"` and `tabIndex={-1}` to ensure programmatic focus works correctly.
**Action:** Always verify that the skip link target is focusable and that the link becomes visible on focus.
