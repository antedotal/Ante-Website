## 2025-05-20 - Accessible Waitlist Form
**Learning:** Even "coming soon" pages need semantic HTML. Using `<div>`s for inputs and `type="button"` breaks the natural "Enter to submit" flow that users expect.
**Action:** Always wrap inputs in a `<form>` and use `type="submit"`, even if the form submission is handled via AJAX/state.
