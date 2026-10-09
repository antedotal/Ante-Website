// Frozen canonical JSON/UUID/provider bounds are reused unchanged.
import {
  exact,
  internalId,
  paymentRequestHash,
  providerActionSupport,
  providerId,
} from "../../../scripts/backend/web-payment-provider-contract.mjs";
export { exact, internalId, paymentRequestHash, providerId };
export const API_VERSION = "2026-09-30.endive" as const;
export const SDK_VERSION = "23.0.0" as const;
export type Kind =
  | "customer.create"
  | "setup.create"
  | "setup.retrieve"
  | "customer.default"
  | "card.detach";
export type Outcome =
  | "verified"
  | "pending"
  | "requires_action"
  | "declined"
  | "unknown"
  | "denied";
export type Configuration = {
  configuration_id: string;
  revision: number;
  task7_configuration_id: string;
  approval_id: string;
  approval_hash: string;
  provider_account: string;
  environment: "test" | "live";
  sandbox_id: string;
  credential_reference: string;
  provisioning_hash: string;
  api_version: string;
  sdk_version: string;
  adapter_version: string;
  policy_id: string;
  policy_version: string;
  policy_hash: string;
  method_configuration: string;
  dispatch_enabled: boolean;
  fixture_only: boolean;
  default_policy: "invoice" | "internal" | null;
  removal_policy: "block_dependencies" | null;
  allow_default_removal: boolean | null;
  allow_last_card_removal: boolean | null;
  retention_seconds: number;
  lease_seconds: number;
  continuation_seconds: number;
  effective_at: string;
  expires_at: string;
};
export type Permit = {
  subaction_id: string;
  owner_id: string;
  operation_id: string;
  parent_action: string;
  kind: Kind;
  customer_id: string;
  subject_id: string;
  subject_revision: number;
  customer_revision: number;
  configuration_id: string;
  configuration_hash: string;
  consent_id: string | null;
  request_hash: string;
  parameters: Record<string, unknown>;
  parameter_hash: string;
  provider_key: string;
  created_at: string;
  configuration: Configuration;
  lease_generation: number;
  lease_expires_at: string;
  operation_revision: number;
  plan: "effect" | "retrieve";
  object_id: string | null;
};
export type Observation = {
  kind: Kind;
  outcome: Outcome;
  observed_at: string;
  request_id: string | null;
  transport_outcome: "received" | "unknown" | "not_dispatched";
  safe_error_code:
    | "provider_declined"
    | "provider_unknown"
    | "identity_mismatch"
    | "activation_closed"
    | null;
  object_id: string | null;
  customer_id: string | null;
  method_id: string | null;
  method_type: string | null;
  livemode: boolean | null;
  provider_account: string;
  sandbox_id: string;
  configuration_id: string;
  configuration_hash: string;
  operation_id: string;
  subject_id: string;
  parameter_hash: string;
  usage: string | null;
  method_configuration: string | null;
  setup_state:
    | "pending"
    | "requires_action"
    | "succeeded"
    | "canceled"
    | "failed"
    | null;
  brand: string | null;
  last4: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  default_method_id: string | null;
};
const permitKeys =
  "subaction_id owner_id operation_id parent_action kind customer_id subject_id subject_revision customer_revision configuration_id configuration_hash consent_id request_hash parameters parameter_hash provider_key created_at configuration lease_generation lease_expires_at operation_revision plan object_id"
    .split(" ");
const configKeys =
  "configuration_id revision task7_configuration_id approval_id approval_hash provider_account environment sandbox_id credential_reference provisioning_hash api_version sdk_version adapter_version policy_id policy_version policy_hash method_configuration dispatch_enabled fixture_only default_policy removal_policy allow_default_removal allow_last_card_removal retention_seconds lease_seconds continuation_seconds effective_at expires_at"
    .split(" ");
// Only the private persisted repository creates this permit; strict decoding precedes credentials/SDK.
export function parsePermit(value: unknown): Permit {
  if (!exact(value, permitKeys)) throw new Error("invalid_permit");
  const p = value as Permit, c = p.configuration;
  if (
    !exact(c, configKeys) ||
    providerActionSupport(p.kind) !== "implemented" ||
    !["effect", "retrieve"].includes(p.plan)
  ) throw new Error("invalid_permit");
  for (
    const k of [
      "subaction_id",
      "owner_id",
      "operation_id",
      "customer_id",
      "subject_id",
      "configuration_id",
    ] as const
  ) if (!internalId(p[k])) throw new Error("invalid_permit");
  for (
    const k of ["configuration_hash", "request_hash", "parameter_hash"] as const
  ) if (!/^[0-9a-f]{64}$/.test(p[k])) throw new Error("invalid_permit");
  if (
    !Number.isSafeInteger(p.lease_generation) || p.lease_generation < 1 ||
    !Number.isSafeInteger(p.operation_revision) || p.operation_revision < 0 ||
    p.configuration_id !== c.configuration_id ||
    p.configuration_hash !== paymentRequestHash(c) ||
    p.parameter_hash !== paymentRequestHash(p.parameters) ||
    p.provider_key !== `ante:provider-v1:${p.subaction_id}:${p.kind}`
  ) throw new Error("invalid_permit");
  if (
    c.api_version !== API_VERSION || c.sdk_version !== SDK_VERSION ||
    c.adapter_version !== "provider-v1" ||
    !["test", "live"].includes(c.environment) || !c.dispatch_enabled ||
    !providerId(c.provider_account) || !providerId(c.sandbox_id) ||
    !providerId(c.credential_reference) ||
    !providerId(c.method_configuration) ||
    !Number.isInteger(c.retention_seconds) || c.retention_seconds < 1 ||
    c.retention_seconds >= 86400
  ) throw new Error("invalid_permit");
  if (
    ![p.created_at, p.lease_expires_at, c.effective_at, c.expires_at].every(
      (v) => typeof v === "string" && Number.isFinite(Date.parse(v)),
    ) || p.kind !== "customer.create" && !internalId(p.consent_id) ||
    !Number.isInteger(c.continuation_seconds) || c.continuation_seconds < 1 ||
    c.continuation_seconds > 300 || !Number.isInteger(p.subject_revision) ||
    p.subject_revision < 1 || !Number.isInteger(p.customer_revision) ||
    p.customer_revision < 1
  ) throw new Error("invalid_permit");
  return structuredClone(p);
}
// Build a fixed safe observation shape; raw SDK objects/errors/secrets cannot be persisted.
export function observation(
  p: Permit,
  outcome: Outcome,
  now = Date.now(),
): Observation {
  return {
    kind: p.kind,
    outcome,
    observed_at: new Date(now).toISOString(),
    request_id: null,
    transport_outcome: outcome === "denied" ? "not_dispatched" : "unknown",
    safe_error_code: outcome === "denied"
      ? "activation_closed"
      : outcome === "unknown"
      ? "provider_unknown"
      : null,
    object_id: null,
    customer_id: null,
    method_id: null,
    method_type: null,
    livemode: null,
    provider_account: p.configuration.provider_account,
    sandbox_id: p.configuration.sandbox_id,
    configuration_id: p.configuration_id,
    configuration_hash: p.configuration_hash,
    operation_id: p.operation_id,
    subject_id: p.subject_id,
    parameter_hash: p.parameter_hash,
    usage: null,
    method_configuration: null,
    setup_state: null,
    brand: null,
    last4: null,
    expiry_month: null,
    expiry_year: null,
    default_method_id: null,
  };
}
