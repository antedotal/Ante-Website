## 2024-05-22 - [Form Accessibility]
**Learning:** React state-controlled forms often miss the native `<form>` element, breaking "Enter to submit" and screen reader form mode.
**Action:** Always wrap input+submit button groups in `<form onSubmit={...}>` and ensure the submit button has `type="submit"`.
