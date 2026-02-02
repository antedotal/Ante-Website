# Palette's Journal - Critical UX/A11y Learnings

## 2024-05-22 - Semantic Forms with Framer Motion
**Learning:** Standard `<form>` tags can sometimes interfere with Framer Motion contexts or lack direct animation capabilities. However, using `div`s for forms hurts accessibility (no enter-to-submit, poor screen reader support).
**Action:** Use `<motion.form>` from `framer-motion`. It preserves the animation capabilities of a motion component while maintaining the semantic benefits of a native HTML form (handling `onSubmit`, supporting `type="submit"` buttons).
