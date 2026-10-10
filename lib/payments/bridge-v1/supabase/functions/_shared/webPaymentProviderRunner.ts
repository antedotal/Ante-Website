/** One accepted provider engine; committed dispatch remains the only I/O admission. */
import { boundedPaymentBody, PAYMENT_RESPONSE_HEADERS } from "./webPaymentHttpIntake.ts";
import { exact } from "./webPaymentProviderContract.ts";
import { dispatchProviderJoint as dispatchProvider } from "../../../../owned-card-joint/supabase/functions/_shared/webPaymentProviderJoint.ts";
import type { GuardedTransport, Provisioning } from "../../../../owned-card-joint/supabase/functions/_shared/webPaymentProviderClientJoint.ts";
import { createPaymentProviderRepository, type PaymentSupabase } from "./webPaymentBrowserRepository.ts";
import type { PaymentLifetime } from "./webPaymentOwnerSupabase.ts";
export async function runPaymentProviderWork(services: PaymentSupabase, workerIdentity: string, limit: number, provision: Provisioning, credential: () => string, transport: GuardedTransport, observe: PaymentLifetime) {
  const repository = createPaymentProviderRepository(services, workerIdentity, observe), permits = await repository.claim(limit), results: unknown[] = [];
  // Sequential ownership avoids double dispatch and hidden autonomous retries.
  // A false/unknown dispatch ACK prevents credential/SDK/network construction.
  for (const permit of permits) results.push(await dispatchProvider(repository, permit, provision, credential, transport));
  await transport.quiescence();
  return Object.freeze({ claimed: permits.length, results });
}
/** Physical Fetch/body/disposal jobs stay owned until their genuine Promise settlement. */
export function createPaymentLifetime() {
  const outstanding = new Set<Promise<void>>();
  const observe: PaymentLifetime = work => {
    const settled = work.then(() => {}, () => {}); outstanding.add(settled);
    void settled.finally(() => outstanding.delete(settled));
  };
  return Object.freeze({ observe, active: () => outstanding.size, async quiescence() { while (outstanding.size) await Promise.all([...outstanding]); } });
}

/** Unbound private job route has one literal path/body and dedicated bearer;
 * no owner JWT, caller worker UUID or reconcile/SQL selector is accepted. */
export function createPaymentProviderHttp(options: { services: PaymentSupabase; workerIdentity: string; provision: Provisioning; credential(): string; transport: GuardedTransport }) {
  const frozen = Object.freeze({ ...options });
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: PAYMENT_RESPONSE_HEADERS });
    if (!frozen.services.ready()) return reply(503, { error_code: "activation_closed" });
    const lifetime = createPaymentLifetime();
    try {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/internal/v1/payments/work" || url.search || url.hash) return reply(400, { error_code: "invalid_input" });
      if (!frozen.services.workerRequestAccepted(request)) return reply(401, { error_code: "not_authenticated" });
      const input = await boundedPaymentBody(request, lifetime.observe);
      if (!exact(input, ["limit"]) || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 20) return reply(400, { error_code: "invalid_input" });
      const result = await runPaymentProviderWork(frozen.services, frozen.workerIdentity, Number(input.limit), frozen.provision, frozen.credential, frozen.transport, lifetime.observe);
      return reply(200, result);
    } catch { return reply(503, { error_code: "activation_closed" }); }
    finally { await frozen.transport.quiescence(); await lifetime.quiescence(); }
  };
}
