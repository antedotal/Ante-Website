## 2025-02-18 - Framer Motion and Forms
**Learning:** When using `framer-motion` for animated inputs/cards, elements must be wrapped in a `<form>` (or `motion.form`) to ensure native 'Enter to submit' functionality works for accessibility.
**Action:** Always wrap input groups in a `<form>` tag, even if layout requires nested motion components.
