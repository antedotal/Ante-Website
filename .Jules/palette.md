## 2026-01-21 - Component Prop Spreading & Accessibility

**Learning:** When building polymorphic UI components (like a button that can be a link), explicitly spreading props to the underlying elements (Link/a) is crucial for accessibility. Without this, attributes like `aria-label` are lost, making the component inaccessible for keyboard and screen reader users, even if visual text exists.
**Action:** Always test custom UI components by passing standard HTML attributes (aria-*, id, etc.) and verifying they appear in the DOM.
