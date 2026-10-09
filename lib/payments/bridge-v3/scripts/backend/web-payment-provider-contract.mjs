// Provider-v1 reuses the frozen canonical encoding/hash instead of inventing another framework.
import {
  canonicalRequest,
  internalId,
  paymentRequestHash,
  providerId,
} from "./web-payment-contract.mjs";
export { canonicalRequest, internalId, paymentRequestHash, providerId };
export const CARD_ACTIONS = Object.freeze([
  "card.setup.begin",
  "card.setup.complete",
  "card.default.set",
  "card.remove",
]);
export const PROVIDER_KINDS = Object.freeze([
  "customer.create",
  "setup.create",
  "setup.retrieve",
  "customer.default",
  "card.detach",
]);
// Exact plain JSON keys reject coercion, prototype fields and accidental secret/provider selectors.
export function exact(value, keys) {
  return !!value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
export function parseCardRequest(action, value) {
  const keys = action === "card.setup.begin"
    ? ["operation_id", "customer_revision", "consent_id", "return_route_key"]
    : action === "card.setup.complete"
    ? ["operation_id", "setup_id", "setup_revision"]
    : ["operation_id", "customer_revision", "card_id", "card_revision"];
  if (!CARD_ACTIONS.includes(action) || !exact(value, keys)) {
    throw new TypeError("invalid_input");
  }
  for (const k of keys) {
    if (
      k.endsWith("revision") &&
      (!Number.isSafeInteger(value[k]) || value[k] < 1 || value[k] > 999999999)
    ) throw new TypeError("invalid_input");
    if (
      k.endsWith("id") &&
      (!internalId(value[k]) || value[k] !== value[k].toLowerCase())
    ) throw new TypeError("invalid_input");
  }
  if (
    action === "card.setup.begin" &&
    value.return_route_key !== "account_payments"
  ) throw new TypeError("invalid_input");
  return structuredClone(value);
}

export function parseProviderReceipt(action, value) {
  if (![...CARD_ACTIONS, "customer.ensure", "card.read"].includes(action)) {
    throw new TypeError("invalid_receipt");
  }
  if (
    !exact(value, [
      "provider_contract_version",
      "operation_id",
      "operation_revision",
      "status",
      "result",
      "error_code",
      "retry_after_seconds",
    ]) || value.provider_contract_version !== 1 ||
    ![
      "completed",
      "pending",
      "requires_action",
      "unknown",
      "denied",
      "conflict",
    ].includes(value.status) ||
    value.operation_id !== null && !internalId(value.operation_id) ||
    value.operation_revision !== null &&
      (!Number.isSafeInteger(value.operation_revision) ||
        value.operation_revision < 1) ||
    value.error_code !== null &&
      ![
        "invalid_input",
        "not_found",
        "configuration_missing",
        "policy_changed",
        "revision_conflict",
        "payload_conflict",
        "dependency_open",
        "rate_limited",
        "provider_unknown",
        "provider_declined",
      ].includes(value.error_code) ||
    value.retry_after_seconds !== null &&
      (!Number.isInteger(value.retry_after_seconds) ||
        value.retry_after_seconds < 1 || value.retry_after_seconds > 60)
  ) throw new TypeError("invalid_receipt");
  const r = value.result;
  if (r !== null) {
    const keys = action === "customer.ensure"
      ? ["customer_id", "revision", "state"]
      : action === "card.setup.begin" || action === "card.setup.complete"
      ? ["setup_id", "revision", "state", "card"]
      : [
        "card_id",
        "revision",
        "state",
        "brand",
        "last4",
        "expiry_month",
        "expiry_year",
        "is_default",
      ];
    if (!exact(r, keys) || !Number.isInteger(r.revision) || r.revision < 1) {
      throw new TypeError("invalid_receipt");
    }
    if (
      action === "customer.ensure" &&
      (!internalId(r.customer_id) ||
        !["reserved", "creating", "ready", "unknown", "blocked"].includes(
          r.state,
        ))
    ) throw new TypeError("invalid_receipt");
    if (
      action.startsWith("card.setup.") &&
      (!internalId(r.setup_id) ||
        ![
          "pending",
          "requires_action",
          "succeeded",
          "canceled",
          "failed",
          "unknown",
        ].includes(r.state))
    ) throw new TypeError("invalid_receipt");
    if (
      action === "card.default.set" || action === "card.remove" ||
      action === "card.read"
    ) {
      if (
        !internalId(r.card_id) ||
        !["active", "removal_pending", "detached", "unknown"].includes(
          r.state,
        ) || typeof r.is_default !== "boolean" ||
        !/^[a-z_]{1,32}$/.test(r.brand) || !/^[0-9]{4}$/.test(r.last4) ||
        !Number.isInteger(r.expiry_month) || r.expiry_month < 1 ||
        r.expiry_month > 12 || !Number.isInteger(r.expiry_year) ||
        r.expiry_year < 2000 || r.expiry_year > 2200
      ) throw new TypeError("invalid_receipt");
    }
    if (action.startsWith("card.setup.") && r.card !== null) {
      parseProviderReceipt("card.read", { ...value, result: r.card });
    }
  }
  return structuredClone(value);
}

// Versioned trusted capability catalog reserves future semantic keys in the same ledger.
// A future reviewed adapter revision must extend eligibility/observation validation and this support set.
export const RESERVED_PROVIDER_KINDS = Object.freeze([
  "authorization.create",
  "authorization.capture",
  "authorization.cancel",
  "collection.create",
  "refund.create",
  "subscription.create",
  "subscription.cancel",
]);
export function providerActionSupport(kind) {
  return PROVIDER_KINDS.includes(kind)
    ? "implemented"
    : RESERVED_PROVIDER_KINDS.includes(kind)
    ? "reserved"
    : "unsupported";
}
