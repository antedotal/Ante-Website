/** Exact adapters feed the one frozen provider repository/executor, never another dispatcher. */
import { ProviderRepositoryJoint as ProviderRepository, type PrivateRpc } from "../../../../owned-card-joint/supabase/functions/_shared/webPaymentProviderRepositoryJoint.ts";
import { exact, internalId } from "./webPaymentProviderContract.ts";
import { createPaymentSupabase, type PaymentLifetime } from "./webPaymentOwnerSupabase.ts";
import { paymentDigest } from "./webPaymentHttpIntake.ts";
export type PaymentSupabase = ReturnType<typeof createPaymentSupabase>;
export type PaymentOwner = Awaited<ReturnType<PaymentSupabase["owner"]>>;
/** Internal B0 envelopes have a separate finite validator; ordinary browser parser stays frozen. */
export function internalBrowserEnvelope(value: unknown): Record<string, unknown> {
  if (!exact(value, ["browser_contract_version", "status", "result", "error_code", "retry_after_seconds"])) throw new Error("repository_unknown");
  const v = value as Record<string, unknown>;
  if (v.browser_contract_version !== 1 || !["completed", "denied", "conflict", "unknown"].includes(String(v.status)) || (v.error_code !== null && !["invalid_input", "not_found", "policy_changed", "payload_conflict", "configuration_missing", "activation_closed", "dependency_open", "rate_limited", "expired", "provider_unknown"].includes(String(v.error_code)))) throw new Error("repository_unknown");
  if (v.error_code === "rate_limited" ? !Number.isInteger(v.retry_after_seconds) || Number(v.retry_after_seconds) < 1 || Number(v.retry_after_seconds) > 60 : v.retry_after_seconds !== null) throw new Error("repository_unknown");
  if (v.status !== "completed" && v.result !== null || v.status === "completed" && (v.error_code !== null || !v.result || typeof v.result !== "object" || Array.isArray(v.result))) throw new Error("repository_unknown");
  return v;
}
/** Dropping p_worker is deliberate: approved SQL channel derives the principal.
 * The fixed local identity must match the repository constructor before wire I/O. */
export function createPaymentProviderRepository(services: PaymentSupabase, workerIdentity: string, observe: PaymentLifetime): ProviderRepository {
  if (!internalId(workerIdentity)) throw new Error("invalid_input");
  const port = services.service("provider_dispatch", observe);
  if (!("claim" in port)) throw new Error("activation_closed");
  const rpc: PrivateRpc = async (name, args) => {
    switch (name) {
      case "claim_v4": {
        if (!exact(args, ["p_limit", "p_worker"]) || args.p_worker !== workerIdentity) throw new Error("invalid_input");
        const reply = await port.claim!(Number(args.p_limit));
        if (!exact(reply, ["principal_id", "permits"]) || (reply as Record<string, unknown>).principal_id !== workerIdentity) throw new Error("repository_unknown");
        // This existing gateway owns only the original five card operations. The
        // selected Joint engine supports other purposes, but this port cannot
        // dispatch task, Premium or canonical-notice work through a card channel.
        const permits=(reply as Record<string, unknown>).permits;
        if(!Array.isArray(permits)||permits.some(p=>!p||typeof p!=='object'||!['customer.create','setup.create','setup.retrieve','customer.default','card.detach'].includes(String(p.kind))))throw new Error('repository_unknown');
        return permits;
      }
      case "record_dispatch_v4": if (!exact(args, ["p_subaction", "p_generation", "p_revision", "p_plan", "p_object_id"])) throw new Error("invalid_input"); return await port.dispatch!({ subaction_id: args.p_subaction, generation: args.p_generation, operation_revision: args.p_revision, plan: args.p_plan, object_id: args.p_object_id });
      case "record_observation_v4": if (!exact(args, ["p_subaction", "p_generation", "p_revision", "p_observation"])) throw new Error("invalid_input"); return await port.observation!({ subaction_id: args.p_subaction, generation: args.p_generation, operation_revision: args.p_revision, observation: args.p_observation });
      default: throw new Error("activation_closed");
    }
  };
  return new ProviderRepository(rpc, workerIdentity);
}
/** Continuation service sees one stored digest; final delivery uses genuine owner Auth/RPC. */
export async function createPaymentContinuationRepository(services: PaymentSupabase, owner: PaymentOwner, request: Record<string, unknown>, observe: PaymentLifetime) {
  const frozen = Object.freeze(structuredClone(request)), begun = internalBrowserEnvelope(await owner.beginContinuation(frozen)), result = begun.result as Record<string, unknown> | null;
  if (begun.status !== "completed" || !result || !exact(result, ["capability", "capability_digest", "expires_at"]) || typeof result.capability !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.capability) || !paymentDigest(result.capability_digest) || typeof result.expires_at !== "string") throw new Error("continuation_unavailable");
  // Correlate actual token/digest; this opaque capability never enters DTO/history.
  const bytes = new TextEncoder().encode(result.capability), hashed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
  if (hashed !== result.capability_digest) throw new Error("repository_unknown");
  const digest = result.capability_digest, port = services.service("owner_secret_read", observe); if (!("readContinuation" in port)) throw new Error("activation_closed");
  let ticket: string | null = null;
  const rpc: PrivateRpc = async (name, args) => {
    if (name === "continuation") {
      if (!exact(args, ["p_setup", "p_revision"]) || args.p_setup !== frozen.setup_id || args.p_revision !== frozen.setup_revision) throw new Error("invalid_input");
      const context = await port.readContinuation!(digest);
      if (context === null) return null;
      if (!exact(context, ["permit", "ticket"])) throw new Error("repository_unknown");
      const c = context as { permit: Record<string, unknown>; ticket: Record<string, unknown> };
      if (c.permit.owner_id !== owner.ownerId || c.permit.operation_id !== frozen.operation_id || c.ticket.owner_id !== owner.ownerId || c.ticket.operation_revision !== frozen.operation_revision || c.ticket.expires_at !== result.expires_at || !internalId(c.ticket.ticket_id)) throw new Error("repository_unknown");
      ticket = String(c.ticket.ticket_id); return context;
    }
    if (name === "consume_continuation") {
      if (!ticket || !exact(args, ["p_ticket"]) || args.p_ticket !== ticket) throw new Error("invalid_input");
      const consumed = internalBrowserEnvelope(await owner.consumeContinuation({ ...frozen, capability_digest: digest }));
      return consumed.status === "completed" && exact(consumed.result, ["consumed"]) && (consumed.result as Record<string, unknown>).consumed === true;
    }
    throw new Error("activation_closed");
  };
  return new ProviderRepository(rpc, owner.ownerId);
}
