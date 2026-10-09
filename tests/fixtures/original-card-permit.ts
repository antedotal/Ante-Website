// Test-only fixture extracted from the pinned accepted V2 test helpers; it never dispatches or imports predecessor test cases.
import {paymentRequestHash,type Permit} from "../../lib/payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderContractJoint";
import type {Provisioning} from "../../lib/payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderClientJoint";
export function fixture(kind: "customer.create" | "setup.create" | "setup.retrieve" | "customer.default" | "card.detach" = "customer.create"): Permit {
  const configuration = {
    configuration_id: crypto.randomUUID(),
    revision: 1,
    task7_configuration_id: crypto.randomUUID(),
    approval_id: crypto.randomUUID(),
    approval_hash: "a".repeat(64),
    provider_account: "fixture-account",
    environment: "test" as const,
    sandbox_id: "fixture-sandbox",
    credential_reference: "fixture-ref",
    provisioning_hash: "b".repeat(64),
    api_version: "2026-09-30.endive",
    sdk_version: "23.0.0",
    adapter_version: "provider-v1",
    policy_id: crypto.randomUUID(),
    policy_version: "fixture-v1",
    policy_hash: "c".repeat(64),
    method_configuration: "pmc_fixture",
    dispatch_enabled: true,
    fixture_only: true,
    default_policy: "invoice" as const,
    removal_policy: "block_dependencies" as const,
    allow_default_removal: true,
    allow_last_card_removal: true,
    retention_seconds: 82800,
    lease_seconds: 30,
    continuation_seconds: 60,
    effective_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  const operation_id = crypto.randomUUID(),
    customer_id = crypto.randomUUID(),
    subject_id = kind === "customer.create" ? customer_id : crypto.randomUUID(),
    subaction_id = crypto.randomUUID();
  const parameters = kind === "customer.create"
    ? { metadata: { ante_operation: operation_id, ante_customer: customer_id } }
    : kind === "setup.create"
    ? {
      customer: "cus_fixture",
      usage: "off_session",
      allowed_payment_method_types: ["card"],
      payment_method_configuration: "pmc_fixture",
      metadata: { ante_operation: operation_id, ante_setup: subject_id },
    }
    : kind === "setup.retrieve"
    ? {
      setup_id: "seti_fixture",
      customer: "cus_fixture",
      payment_method_configuration: "pmc_fixture",
    }
    : kind === "customer.default"
    ? {
      customer: "cus_fixture",
      invoice_settings: { default_payment_method: "pm_fixture" },
    }
    : { method_id: "pm_fixture", customer: "cus_fixture" };
  return {
    subaction_id,
    owner_id: crypto.randomUUID(),
    operation_id,
    parent_action: kind === "customer.create"
      ? "customer.ensure"
      : "card.setup.begin",
    kind,
    customer_id,
    subject_id,
    subject_revision: 1,
    customer_revision: 2,
    configuration_id: configuration.configuration_id,
    configuration_hash: paymentRequestHash(configuration),
    consent_id: kind === "customer.create" ? null : crypto.randomUUID(),
    request_hash: "d".repeat(64),
    parameters,
    parameter_hash: paymentRequestHash(parameters),
    provider_key: `ante:provider-v1:${subaction_id}:${kind}`,
    created_at: new Date().toISOString(),
    configuration,
    lease_generation: 1,
    lease_expires_at: new Date(Date.now() + 30000).toISOString(),
    operation_revision: 1,
    plan: "effect",
    object_id: null,
  };
}
export function provision(p: Permit): Provisioning {
  const c = p.configuration;
  return {
    enabled: true,
    provider_account: c.provider_account,
    environment: c.environment,
    sandbox_id: c.sandbox_id,
    credential_reference: c.credential_reference,
    provisioning_hash: c.provisioning_hash,
    api_version: c.api_version,
    sdk_version: c.sdk_version,
    adapter_version: c.adapter_version,
    fixture_only: true,
  };
}
