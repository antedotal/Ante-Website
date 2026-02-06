## 2024-05-23 - [Form Accessibility with Framer Motion]
**Learning:** When animating form elements with `framer-motion`, simply wrapping inputs in `<div>` breaks native form submission (Enter key). Using `<motion.form>` preserves animation context (variants propagation) while enabling native accessibility features like `onSubmit`.
**Action:** Use `<motion.form>` instead of `<div>` for input groups. Add `noValidate` to suppress browser bubbles if using custom error UI, but keep `type="submit"` on the button to support keyboard navigation.
