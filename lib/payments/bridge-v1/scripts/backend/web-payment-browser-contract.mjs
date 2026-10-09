// Additive browser-v1 validation preserves the accepted Task7/provider families.
// These selectors are bounded data, never owner/provider/transport authority.
import { internalId } from "./web-payment-contract.mjs";
import {
  CARD_ACTIONS,
  exact,
  parseProviderReceipt,
} from "./web-payment-provider-contract.mjs";
const actions = Object.freeze([
  "customer.ensure",
  "consent.accept",
  "consent.revoke",
  ...CARD_ACTIONS,
]);
const statuses = Object.freeze([
  "completed",
  "pending",
  "requires_action",
  "unknown",
  "denied",
  "conflict",
]);
const errors = Object.freeze([
  "invalid_input",
  "not_found",
  "configuration_missing",
  "activation_closed",
  "policy_changed",
  "revision_conflict",
  "payload_conflict",
  "dependency_open",
  "rate_limited",
  "provider_unknown",
  "provider_declined",
  "expired",
  "browser_lineage_required",
]);
const id = (v) => internalId(v) && v === v.toLowerCase();
const revision = (v) => Number.isSafeInteger(v) && v >= 1 && v <= 999999999;
const digest = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const timestamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v);
const setupKeys = Object.freeze([
  "operation_id",
  "operation_revision",
  "setup_id",
  "setup_revision",
]);
const requestKeys = Object.freeze({
  context: [],
  operation: ["operation_id"],
  operations: ["after", "limit"],
  history: ["after", "limit"],
  "continuation.begin": setupKeys,
  "continuation.consume": [...setupKeys, "capability_digest"],
  "return.create": [...setupKeys, "return_route_key", "return_admission_id"],
  "return.create.internal": ["request", "browser_digest"],
  "return.issuance": ["request", "browser_digest"],
  "return.consume": ["state_digest", "browser_digest"],
});
function requireValue(ok, code = "invalid_receipt") {
  if (!ok) throw new TypeError(code);
}
// The public/server-owner SQL forms are finite. Browser HTTP intake must reject
// duplicate wire keys separately before JSON parsing, as selected for B1/B2.
export function parseBrowserRequest(kind, value) {
  const keys = requestKeys[kind];
  requireValue(keys && exact(value, keys), "invalid_input");
  for (const k of keys) {
    const v = value[k];
    let ok;
    if (k === "request") {
      // Internal issuance accepts the already-validated six ordinary fields
      // and a cookie association digest, with no entropy or owner override.
      parseBrowserRequest("return.create", v);
      ok = true;
    } else if (k === "after") ok = v === null || id(v);
    else if (k === "limit") ok = Number.isInteger(v) && v >= 1 && v <= 50;
    else if (k.endsWith("_revision")) ok = revision(v);
    else if (k.endsWith("_id")) ok = id(v);
    else if (k.endsWith("_digest")) ok = digest(v);
    else ok = v === "account_payments";
    requireValue(ok, "invalid_input");
  }
  return structuredClone(value);
}
// Support has no accepted authority adapter in this source version. A caller
// boolean cannot promote it or select an unimplemented financial purpose.
export function parseBrowserSummary(value) {
  requireValue(
    exact(value, [
      "operation_id",
      "action",
      "operation_revision",
      "resource_id",
      "resource_revision",
      "status",
      "recovery",
      "support_available",
    ]),
  );
  requireValue(
    id(value.operation_id) &&
      actions.includes(value.action) &&
      revision(value.operation_revision) &&
      statuses.includes(value.status) &&
      value.support_available === false,
  );
  requireValue(
    (value.resource_id === null && value.resource_revision === null) ||
      (id(value.resource_id) && revision(value.resource_revision)),
  );
  requireValue(
    [
      "none",
      "reconcile",
      "customer_action",
      "await_policy",
      "manual_required",
    ].includes(value.recovery),
  );
  requireValue(
    !["completed", "denied", "conflict"].includes(value.status) ||
      value.recovery === "none",
  );
  return structuredClone(value);
}
function scopes(value) {
  requireValue(
    Array.isArray(value) &&
      value.length <= 20 &&
      value.every(
        (x) => typeof x === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(x),
      ),
  );
  requireValue(
    new Set(value).size === value.length &&
      JSON.stringify([...value].sort()) === JSON.stringify(value),
  );
}
const consentKeys = Object.freeze([
  "consent_id",
  "revision",
  "policy_id",
  "policy_version",
  "policy_hash",
  "scope_keys",
  "state",
  "accepted_at",
  "revoked_at",
]);
function consent(value) {
  requireValue(exact(value, consentKeys));
  requireValue(
    id(value.consent_id) &&
      revision(value.revision) &&
      id(value.policy_id) &&
      typeof value.policy_version === "string" &&
      /^[A-Za-z0-9._-]{1,64}$/.test(value.policy_version) &&
      digest(value.policy_hash) &&
      ["active", "revoked"].includes(value.state) &&
      timestamp(value.accepted_at) &&
      (value.revoked_at === null || timestamp(value.revoked_at)),
  );
  scopes(value.scope_keys);
}
// Task7 has no JS receipt parser export; validate its actual immutable eight
// fields and action-specific projections here, using its accepted UUID helper.
function task7(action, value) {
  requireValue(
    exact(value, [
      "contract_version",
      "operation_id",
      "operation_revision",
      "status",
      "resource_revision",
      "result",
      "error_code",
      "retry_after_seconds",
    ]),
  );
  requireValue(
    value.contract_version === 1 &&
      id(value.operation_id) &&
      revision(value.operation_revision) &&
      statuses.includes(value.status) &&
      (value.resource_revision === null || revision(value.resource_revision)) &&
      (value.error_code === null || errors.includes(value.error_code)) &&
      (value.retry_after_seconds === null ||
        (Number.isInteger(value.retry_after_seconds) &&
          value.retry_after_seconds >= 1 &&
          value.retry_after_seconds <= 60)),
  );
  if (value.result !== null) {
    const result = value.result;
    if (action === "customer.ensure")
      requireValue(
        exact(result, ["customer_id", "revision", "state", "operation"]) &&
          id(result.customer_id) &&
          revision(result.revision) &&
          ["reserved", "creating", "ready", "unknown", "blocked"].includes(
            result.state,
          ),
      );
    else {
      requireValue(
        ["consent.accept", "consent.revoke"].includes(action) &&
          exact(result, [...consentKeys, "approved_text", "operation"]),
      );
      const selected = Object.fromEntries(
        consentKeys.map((k) => [k, result[k]]),
      );
      consent(selected);
      requireValue(result.approved_text === null);
    }
    const op = result.operation;
    requireValue(
      exact(op, [
        "operation_id",
        "operation_revision",
        "action",
        "resource_id",
        "resource_revision",
        "status",
        "recovery",
        "continuation_token",
        "action_expires_at",
      ]),
    );
    requireValue(
      op.operation_id === value.operation_id &&
        op.action === action &&
        revision(op.operation_revision) &&
        statuses.includes(op.status) &&
        id(op.resource_id) &&
        revision(op.resource_revision) &&
        ["none", "await_policy"].includes(op.recovery) &&
        op.continuation_token === null &&
        op.action_expires_at === null &&
        op.resource_id === (result.customer_id ?? result.consent_id) &&
        op.resource_revision === result.revision &&
        value.resource_revision === result.revision,
    );
  }
  return structuredClone(value);
}
function receipt(family, action, value) {
  if (family === "task7_v1") return task7(action, value);
  requireValue(family === "provider_v1");
  try {
    const parsed = parseProviderReceipt(action, value);
    // The original and current provider receipts both retain their own bounded
    // revision domain; the current summary alone cannot validate the original.
    requireValue(revision(parsed.operation_revision));
    if (parsed.result !== null) requireValue(revision(parsed.result.revision));
    return parsed;
  } catch {
    throw new TypeError("invalid_receipt");
  }
}
// Parse each tagged family independently, then correlate immutable operation
// identity and admitted selectors. Only exact ensure-child lineage may change
// family; SQL proves its stored request hash/owner/customer provenance.
export function parseBrowserOperation(value) {
  requireValue(
    exact(value, [
      "summary",
      "original_contract",
      "original_receipt",
      "current_contract",
      "current_receipt",
    ]),
  );
  const summary = parseBrowserSummary(value.summary),
    action = summary.action;
  requireValue(
    value.original_contract === value.current_contract ||
      (action === "customer.ensure" &&
        value.original_contract === "task7_v1" &&
        value.current_contract === "provider_v1"),
  );
  requireValue(
    CARD_ACTIONS.includes(action)
      ? value.original_contract === "provider_v1"
      : value.original_contract === "task7_v1",
  );
  const original = receipt(
      value.original_contract,
      action,
      value.original_receipt,
    ),
    current = receipt(value.current_contract, action, value.current_receipt);
  requireValue(
    original.operation_id === summary.operation_id &&
      current.operation_id === summary.operation_id &&
      current.operation_revision === summary.operation_revision &&
      current.status === summary.status,
  );
  // A well-typed newer receipt does not authorize a different original
  // subject. Revisions/status evolve; the admitted internal identity does not.
  const resourceId = (r) =>
    r.customer_id ?? r.setup_id ?? r.card_id ?? r.consent_id;
  if (original.result !== null && current.result !== null)
    requireValue(resourceId(original.result) === resourceId(current.result));
  const resource = current.result ?? original.result;
  if (resource === null) {
    // Frozen pending default receipts omit their admitted card projection;
    // SQL resolves the immutable subaction's owned subject. Denied/conflicting
    // originals still expose no selector when neither receipt has a resource.
    if (original.status === "denied" || original.status === "conflict")
      requireValue(
        summary.resource_id === null && summary.resource_revision === null,
      );
    else
      requireValue(
        summary.resource_id === null ||
          ["card.default.set", "card.remove"].includes(action),
      );
  } else
    requireValue(
      summary.resource_id ===
        (resource.customer_id ??
          resource.setup_id ??
          resource.card_id ??
          resource.consent_id) &&
        summary.resource_revision === resource.revision,
    );
  return structuredClone(value);
}
// Context/history pages carry only nonsecret selectors. Internal family or
// capability metadata uses separate protected ports and cannot fit this DTO.
export function parseBrowserReply(kind, value) {
  // Register the finite reply family before accepting a nullable denial; an
  // unknown RPC spelling never acquires a parser through an empty result.
  requireValue(
    ["operation", "history", "operations", "context"].includes(kind),
  );
  requireValue(
    exact(value, [
      "browser_contract_version",
      "status",
      "result",
      "error_code",
      "retry_after_seconds",
    ]),
  );
  requireValue(
    value.browser_contract_version === 1 &&
      statuses.includes(value.status) &&
      (value.error_code === null || errors.includes(value.error_code)),
  );
  requireValue(
    value.error_code === "rate_limited"
      ? Number.isInteger(value.retry_after_seconds) &&
          value.retry_after_seconds >= 1 &&
          value.retry_after_seconds <= 60
      : value.retry_after_seconds === null,
  );
  if (value.result === null) {
    requireValue(["denied", "conflict", "unknown"].includes(value.status));
    return structuredClone(value);
  }
  requireValue(value.status === "completed" && value.error_code === null);
  if (kind === "operation") parseBrowserOperation(value.result);
  else if (kind === "history" || kind === "operations") {
    const key = kind === "history" ? "entries" : "operations";
    requireValue(exact(value.result, [key, "next_cursor"]));
    requireValue(
      Array.isArray(value.result[key]) &&
        value.result[key].length <= 50 &&
        (value.result.next_cursor === null || id(value.result.next_cursor)),
    );
    value.result[key].forEach(
      kind === "history" ? consent : parseBrowserSummary,
    );
  } else if (kind === "context") {
    const v = value.result;
    requireValue(
      exact(v, [
        "customer",
        "policies",
        "consents",
        "unfinished_operations",
        "next_cursor",
        "support_available",
      ]),
    );
    requireValue(
      v.support_available === false &&
        (v.next_cursor === null || id(v.next_cursor)),
    );
    if (v.customer !== null) {
      const c = v.customer;
      requireValue(
        exact(c, [
          "customer_id",
          "reservation_revision",
          "provider_revision",
          "reservation_state",
          "provider_state",
        ]) &&
          id(c.customer_id) &&
          revision(c.reservation_revision) &&
          (c.provider_revision === null || revision(c.provider_revision)) &&
          ["reserved", "creating", "ready", "unknown", "blocked"].includes(
            c.reservation_state,
          ) &&
          (c.provider_state === null ||
            ["reserved", "creating", "ready", "unknown", "blocked"].includes(
              c.provider_state,
            )),
      );
    }
    requireValue(Array.isArray(v.policies) && v.policies.length === 3);
    const purposes = ["card.save", "accountability", "premium"];
    v.policies.forEach((p, i) => {
      requireValue(
        exact(p, [
          "purpose",
          "available",
          "policy_id",
          "policy_version",
          "policy_revision",
          "policy_hash",
        ]) &&
          p.purpose === purposes[i] &&
          typeof p.available === "boolean",
      );
      if (p.available)
        requireValue(
          i === 0 &&
            id(p.policy_id) &&
            revision(p.policy_revision) &&
            digest(p.policy_hash) &&
            typeof p.policy_version === "string" &&
            /^[A-Za-z0-9._-]{1,64}$/.test(p.policy_version),
        );
      else
        requireValue(
          p.policy_id === null &&
            p.policy_version === null &&
            p.policy_revision === null &&
            p.policy_hash === null,
        );
    });
    requireValue(
      Array.isArray(v.consents) &&
        v.consents.length <= 20 &&
        Array.isArray(v.unfinished_operations) &&
        v.unfinished_operations.length <= 20,
    );
    v.consents.forEach(consent);
    v.unfinished_operations.forEach((x) => {
      parseBrowserSummary(x);
      requireValue(!["completed", "denied", "conflict"].includes(x.status));
    });
  } else throw new TypeError("invalid_receipt");
  return structuredClone(value);
}
