## 2024-05-22 - Form Accessibility Pattern
**Learning:** Found critical interactive elements (inputs, submit buttons) implemented without parent `<form>` tags, breaking native 'Enter to submit' behavior and mobile keyboard 'Go' actions.
**Action:** Always wrap input/button groups in `<form>` tags, even when using `framer-motion` or custom validation logic (use `noValidate` to keep custom UI).
