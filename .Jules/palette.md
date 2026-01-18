## 2026-01-18 - Semantic Forms in Animated Components
**Learning:** High-fidelity animated components (using `motion.div` structures) often neglect semantic HTML, breaking basic keyboard accessibility like "Enter to submit".
**Action:** When inspecting animated "cards" or "modals" that contain inputs, always verify they are wrapped in a `<form>` tag, even if `motion.form` is required to preserve animation props.
