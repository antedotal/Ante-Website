
## 2026-01-25 - Native Forms and Enter Key
**Learning:** Many "modern" React UI components use `div` wrappers and `onClick` handlers for form-like interactions, breaking the native "Enter to submit" behavior and accessibility.
**Action:** Always wrap input groups in a `<form>` element and use `type="submit"` buttons to ensure keyboard accessibility and expected user behavior.
