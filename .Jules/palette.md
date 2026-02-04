## 2026-02-04 - Native Form Submission with Custom UI
**Learning:** React buttons inside forms default to `type="submit"`, but developers often switch to `type="button"` + `onClick` to control validation UI, inadvertently breaking "Enter to submit" functionality.
**Action:** Always wrap form inputs in a `<form>` tag. If custom validation UI is required, use `noValidate` on the form to suppress browser bubbles while keeping `required` attributes for accessibility. Use `onSubmit` for logic.
