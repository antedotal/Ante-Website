import {
  exact,
  type Observation,
  observation,
  type Permit,
  providerId,
} from "./webPaymentProviderContract.ts";
import {
  createProviderClient,
  type GuardedTransport,
  type Provisioning,
} from "./webPaymentProviderClient.ts";
import type { ProviderRepository } from "./webPaymentProviderRepository.ts";
// Only this fixed operation adapter touches the guarded private SDK; no arbitrary SDK proxy is exposed.
export async function executeProvider(
  p: Permit,
  provision: Provisioning,
  credential: () => string,
  transport: GuardedTransport,
): Promise<Observation> {
  let result = observation(p, "unknown");
  try {
    const { sdk } = createProviderClient(p, provision, credential, transport),
      params = p.parameters,
      c = p.configuration;
    const options = { idempotencyKey: p.provider_key, maxNetworkRetries: 0 };
    let raw: unknown;
    if (p.kind === "customer.create") {
      if (!exact(params, ["metadata"])) throw new Error("identity_mismatch");
      raw = await transport.run(() =>
        p.plan === "retrieve"
          ? sdk.customers.retrieve(p.object_id!, undefined, {
            maxNetworkRetries: 0,
          })
          : sdk.customers.create({
            metadata: params.metadata as Record<string, string>,
          }, options)
      );
    } else if (p.kind === "setup.create") {
      if (
        !exact(params, [
          "customer",
          "usage",
          "allowed_payment_method_types",
          "payment_method_configuration",
          "metadata",
        ]) || params.usage !== "off_session" ||
        JSON.stringify(params.allowed_payment_method_types) !== '["card"]' ||
        params.payment_method_configuration !== c.method_configuration
      ) throw new Error("identity_mismatch");
      raw = await transport.run(() =>
        p.plan === "retrieve"
          ? sdk.setupIntents.retrieve(p.object_id!, undefined, {
            maxNetworkRetries: 0,
          })
          : sdk.setupIntents.create({
            customer: String(params.customer),
            usage: "off_session",
            allowed_payment_method_types: ["card"],
            payment_method_configuration: c.method_configuration,
            metadata: params.metadata as Record<string, string>,
          }, options)
      );
    } else if (p.kind === "setup.retrieve") {
      if (
        !exact(params, ["setup_id", "customer", "payment_method_configuration"])
      ) throw new Error("identity_mismatch");
      raw = await transport.run(() =>
        sdk.setupIntents.retrieve(String(params.setup_id), undefined, {
          maxNetworkRetries: 0,
        })
      );
    } else if (p.kind === "customer.default") {
      if (
        !exact(params, ["customer", "invoice_settings"]) ||
        c.default_policy !== "invoice"
      ) throw new Error("identity_mismatch");
      const desired = params.invoice_settings as {
        default_payment_method: string;
      };
      if (
        !exact(desired, ["default_payment_method"]) ||
        !providerId(desired.default_payment_method)
      ) throw new Error("identity_mismatch");
      raw = await transport.run(() =>
        p.plan === "retrieve"
          ? sdk.customers.retrieve(String(params.customer), undefined, {
            maxNetworkRetries: 0,
          })
          : sdk.customers.update(String(params.customer), {
            invoice_settings: desired,
          }, options)
      );
    } else {
      if (
        !exact(params, ["method_id", "customer"]) ||
        c.removal_policy !== "block_dependencies"
      ) throw new Error("identity_mismatch");
      const original = await transport.run(() =>
        sdk.paymentMethods.retrieve(String(params.method_id), undefined, {
          maxNetworkRetries: 0,
        })
      );
      if (
        original.id !== params.method_id || original.type !== "card" ||
        original.livemode !== (c.environment === "live") ||
        original.customer !== params.customer && original.customer !== null
      ) throw new Error("identity_mismatch");
      // Reconciliation never re-detaches an attached target after an uncertain/expired-key write.
      // The same recorded method can only be observed detached; unresolved attachment stays unknown.
      if (p.plan === "retrieve" && original.customer !== null) {
        throw new Error("provider_unknown");
      }
      raw = original.customer === null
        ? original
        : await transport.run(() =>
          sdk.paymentMethods.detach(String(params.method_id), {}, options)
        );
    }
    if (!raw || typeof raw !== "object") throw new Error("identity_mismatch");
    const object = raw as Record<string, unknown>;
    if (
      !providerId(object.id) || object.deleted ||
      object.livemode !== (c.environment === "live")
    ) throw new Error("identity_mismatch");
    if (p.object_id && object.id !== p.object_id) {
      throw new Error("identity_mismatch");
    }
    result = {
      ...result,
      outcome: "verified",
      transport_outcome: "received",
      safe_error_code: null,
      object_id: String(object.id),
      livemode: Boolean(object.livemode),
    };
    // Header absence cannot establish merchant identity: trusted provisioning was checked before I/O.
    const last = object.lastResponse as {
      requestId?: string;
      apiVersion?: string;
    } | undefined;
    if (last?.apiVersion && last.apiVersion !== c.api_version) {
      throw new Error("identity_mismatch");
    }
    if (providerId(last?.requestId)) result.request_id = last!.requestId!;
    if (p.kind === "customer.create") {
      const metadata = object.metadata as Record<string, string>;
      if (
        object.object !== "customer" ||
        metadata?.ante_operation !== p.operation_id ||
        metadata?.ante_customer !== p.customer_id
      ) throw new Error("identity_mismatch");
    } else if (p.kind === "customer.default") {
      const settings = object.invoice_settings as Record<string, unknown>;
      if (
        object.object !== "customer" || object.id !== params.customer ||
        settings?.default_payment_method !==
          (params.invoice_settings as Record<string, unknown>)
            .default_payment_method
      ) throw new Error("identity_mismatch");
      result.customer_id = String(params.customer);
      result.default_method_id = String(settings.default_payment_method);
    } else if (p.kind === "card.detach") {
      if (
        object.object !== "payment_method" || object.id !== params.method_id ||
        object.type !== "card" || object.customer !== null
      ) throw new Error("identity_mismatch");
      result.method_type = "card";
    } else {
      const config = object.payment_method_configuration_details as {
        id?: string;
      } | null;
      if (
        object.object !== "setup_intent" ||
        object.customer !== params.customer || object.usage !== "off_session" ||
        config?.id !== c.method_configuration ||
        JSON.stringify(object.allowed_payment_method_types) !== '["card"]' ||
        JSON.stringify(object.payment_method_types) !== '["card"]'
      ) throw new Error("identity_mismatch");
      if (p.kind === "setup.create") {
        const metadata = object.metadata as Record<string, string>;
        if (
          metadata?.ante_operation !== p.operation_id ||
          metadata?.ante_setup !== p.subject_id
        ) throw new Error("identity_mismatch");
      }
      result.customer_id = String(params.customer);
      result.usage = "off_session";
      result.method_configuration = c.method_configuration;
      switch (object.status) {
        case "succeeded": {
          if (
            p.kind !== "setup.retrieve" || !providerId(object.payment_method)
          ) throw new Error("identity_mismatch");
          const method = await transport.run(() =>
            sdk.paymentMethods.retrieve(
              String(object.payment_method),
              undefined,
              { maxNetworkRetries: 0 },
            )
          );
          if (
            method.id !== object.payment_method || method.type !== "card" ||
            method.customer !== params.customer ||
            method.livemode !== (c.environment === "live") || !method.card ||
            !/^[0-9]{4}$/.test(method.card.last4) ||
            !/^[a-z_]{1,32}$/.test(method.card.brand) ||
            method.card.exp_month < 1 || method.card.exp_month > 12 ||
            method.card.exp_year < 2000 || method.card.exp_year > 2200
          ) throw new Error("identity_mismatch");
          result = {
            ...result,
            setup_state: "succeeded",
            method_id: method.id,
            method_type: "card",
            brand: method.card.brand,
            last4: method.card.last4,
            expiry_month: method.card.exp_month,
            expiry_year: method.card.exp_year,
          };
          break;
        }
        case "requires_action":
          result = {
            ...result,
            outcome: "requires_action",
            setup_state: "requires_action",
          };
          break;
        case "canceled":
          result = { ...result, outcome: "pending", setup_state: "canceled" };
          break;
        case "requires_payment_method":
          if (object.last_setup_error) {
            result = observation(p, "declined");
            result.safe_error_code = "provider_declined";
          } else {result = {
              ...result,
              outcome: "pending",
              setup_state: "pending",
            };}
          break;
        case "requires_confirmation":
        case "processing":
          result = { ...result, outcome: "pending", setup_state: "pending" };
          break;
        default:
          throw new Error("identity_mismatch");
      }
    }
    return result;
  } catch {
    return observation(p, "unknown");
  }
}
// DB dispatch binds the exact claimed plan/object before credential/client construction.
// Changed reconciliation denies the claim; local recording failure stays unknown.
// The caller owns quiescence separately; logical return cannot authorize a second physical effect.
export async function dispatchProvider(
  repository: ProviderRepository,
  permit: Permit,
  provision: Provisioning,
  credential: () => string,
  transport: GuardedTransport,
) {
  if (!await repository.recordDispatch(permit)) {
    return { status: "denied" as const };
  }
  const result = await executeProvider(
    permit,
    provision,
    credential,
    transport,
  );
  try {
    return await repository.recordObservation(permit, result);
  } catch {
    return { status: "unknown" as const };
  }
}

// Ephemeral owner continuation retrieves only a recorded SetupIntent under a persisted one-use ticket.
// No secret reaches observations/history/logs; local expiry does not invalidate Stripe's secret.
export async function readProviderContinuation(
  repository: ProviderRepository,
  setupId: string,
  revision: number,
  provision: Provisioning,
  credential: () => string,
  transport: GuardedTransport,
) {
  try {
    const ctx = await repository.continuation(setupId, revision);
    if (!ctx) return null;
    const p = ctx.permit, c = p.configuration;
    const { sdk } = createProviderClient(p, provision, credential, transport);
    const setup = await transport.run(() =>
      sdk.setupIntents.retrieve(p.object_id!, undefined, {
        maxNetworkRetries: 0,
      })
    );
    if (
      setup.id !== p.object_id || setup.customer !== p.parameters.customer ||
      setup.livemode !== (c.environment === "live") ||
      setup.usage !== "off_session" ||
      setup.payment_method_configuration_details?.id !==
        c.method_configuration ||
      JSON.stringify(setup.allowed_payment_method_types) !== '["card"]' ||
      JSON.stringify(setup.payment_method_types) !== '["card"]' ||
      !["requires_action", "requires_confirmation", "requires_payment_method"]
        .includes(setup.status) ||
      setup.metadata?.ante_operation !== p.operation_id ||
      setup.metadata?.ante_setup !== p.subject_id || !setup.client_secret ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(setup.client_secret) ||
      Date.now() >= Date.parse(ctx.ticket.expires_at) ||
      !await repository.consumeContinuation(ctx)
    ) return null;
    return {
      operation_id: p.operation_id,
      operation_revision: p.operation_revision,
      setup_id: setupId,
      setup_revision: revision,
      client_secret: setup.client_secret,
      expires_at: ctx.ticket.expires_at,
      return_route_key: "account_payments" as const,
    };
  } catch {
    return null;
  }
}
