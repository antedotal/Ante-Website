## 2025-05-23 - Prop Forwarding in Polymorphic Components
**Learning:** Custom UI components that wrap semantic elements (like Link/Button) must explicitly forward `...props` to the underlying element. Failing to do so breaks accessibility features like `aria-label` and custom event handlers, even if the component interface accepts them.
**Action:** Always check that `...props` or `...rest` is spread onto the final semantic DOM element in UI library components.
