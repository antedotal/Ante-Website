/** Closed payment HTTP handler: ordinary DTOs never contain provider permits or capsule metadata. */
import { parseBrowserOperation, parseBrowserReply } from "../../../scripts/backend/web-payment-browser-contract.mjs";
import { parseProviderReceipt } from "../../../scripts/backend/web-payment-provider-contract.mjs";
import { createReturnCapsule, returnCapsuleDigest, returnCapsuleMetadataHash } from "../../../scripts/backend/web-payment-browser-return-capsule.mjs";
import { exact } from "./webPaymentProviderContract.ts";
import { readProviderContinuation } from "./webPaymentProvider.ts";
import type { GuardedTransport, Provisioning } from "./webPaymentProviderClient.ts";
import { createPaymentContinuationRepository, internalBrowserEnvelope, type PaymentSupabase } from "./webPaymentBrowserRepository.ts";
import { createPaymentLifetime } from "./webPaymentProviderRunner.ts";
import { PAYMENT_RESPONSE_HEADERS, paymentDigest, paymentId, paymentRevision, readPaymentInput, type PaymentAction } from "./webPaymentHttpIntake.ts";
export interface PaymentReturnLineage {
  /** Trusted B2 host supplies original HttpOnly lineage; no query/body override. */
  browserDigest: string;
  returnAdmissionId: string;
  capsule?: string;
  /** Only this private sink may install the original HttpOnly capsule cookie. */
  installCapsule(token: string, expiresAtMicroseconds: string): Promise<void>;
}
export interface PaymentHttpOptions {
  services: PaymentSupabase;
  provider: { provision: Provisioning; credential(): string; transport: GuardedTransport };
  /** Required original immutable reference lookup; no latest-key/environment fallback. */
  loadReturnKey(reference: string, revision: number): Promise<Uint8Array | null>;
}
const failure = (): never => { throw new Error("invalid_receipt"); };
const errors = new Set(["invalid_input", "not_found", "configuration_missing", "activation_closed", "policy_changed", "revision_conflict", "payload_conflict", "dependency_open", "rate_limited", "provider_unknown", "provider_declined", "expired", "browser_lineage_required"]);
/** Task7 writes reuse frozen action/receipt validation through its independently tagged operation view. */
function task7Write(action: PaymentAction, value: unknown, operationId: unknown) {
  const v = value as Record<string, unknown>; if (!v || v.operation_id !== operationId) failure();
  const r = v.result as Record<string, unknown> | null, op = r?.operation as Record<string, unknown> | undefined;
  const subject = r?.customer_id ?? r?.consent_id ?? null;
  parseBrowserOperation({ summary: { operation_id: operationId, action, operation_revision: v.operation_revision, resource_id: subject, resource_revision: v.resource_revision, status: v.status, recovery: op?.recovery ?? "none", support_available: false }, original_contract: "task7_v1", original_receipt: v, current_contract: "task7_v1", current_receipt: v }); return v;
}
/** Bound frozen provider parser selectors without changing its historical contract. */
function providerDto(action: string, value: unknown, operationId?: unknown) {
  const v = parseProviderReceipt(action, value) as Record<string, unknown>;
  if (operationId !== undefined && v.operation_id !== operationId || v.operation_id !== null && !paymentId(v.operation_id) || v.operation_revision !== null && !paymentRevision(v.operation_revision)) failure();
  const r = v.result as Record<string, unknown> | null;
  if (r) {
    if (!paymentRevision(r.revision)) failure();
    for (const key of ["customer_id", "setup_id", "card_id"]) if (key in r && !paymentId(r[key])) failure();
    if (r.card !== undefined && r.card !== null) providerDto("card.read", { ...v, result: r.card });
  }
  return v;
}
/** Exact consent text hash is independently verified before approved bytes reach an owner DTO. */
async function consentRead(value: unknown, input: Readonly<Record<string, unknown>>) {
  if (!exact(value, ["contract_version", "operation_id", "operation_revision", "status", "resource_revision", "result", "error_code", "retry_after_seconds"])) failure();
  const v = value as Record<string, unknown>;
  if (v.contract_version !== 1 || v.operation_id !== null || v.operation_revision !== null || !["completed", "denied", "conflict"].includes(String(v.status)) || v.error_code !== null && !errors.has(String(v.error_code))) failure();
  if (v.error_code === "rate_limited" ? !paymentRevision(v.retry_after_seconds) || Number(v.retry_after_seconds) > 60 : v.retry_after_seconds !== null) failure();
  if (v.result === null) { if (v.status === "completed" || v.resource_revision !== null || v.error_code === null) failure(); return v; }
  const r = v.result as Record<string, unknown>;
  if (!exact(r, ["consent_id", "revision", "policy_id", "policy_version", "policy_hash", "approved_text", "scope_keys", "state", "accepted_at", "revoked_at"]) || !paymentId(r.policy_id) || typeof r.policy_version !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(r.policy_version) || !Array.isArray(r.scope_keys) || r.scope_keys.length > 20 || r.scope_keys.some(k => typeof k !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(k)) || new Set(r.scope_keys).size !== r.scope_keys.length || !["active", "revoked", "unavailable"].includes(String(r.state))) failure();
  // Policy previews have no acceptance identity/timestamps; historical replies
  // bind the exact requested consent and canonical immutable ordered scopes.
  const stamp = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(x) && Number.isFinite(Date.parse(x));
  if (v.status !== "completed" || v.error_code !== null || v.resource_revision !== r.revision || (r.scope_keys as string[]).some((x, n, a) => n > 0 && String(a[n - 1]) >= String(x))) failure();
  if (input.consent_id !== undefined) {
    if (r.consent_id !== input.consent_id || !paymentId(r.consent_id) || !stamp(r.accepted_at) || r.state === "unavailable" || (r.state === "revoked" ? !stamp(r.revoked_at) || String(r.revoked_at) < String(r.accepted_at) : r.revoked_at !== null)) failure();
  } else if (r.policy_id !== input.policy_id || r.policy_version !== input.version || r.consent_id !== null || r.accepted_at !== null || r.revoked_at !== null || r.state === "revoked") failure();
  if (r.state === "unavailable") { if (r.approved_text !== null || r.policy_hash !== null || r.revision !== 0 || r.consent_id !== null || (r.scope_keys as unknown[]).length !== 0) failure(); }
  else {
    if (!paymentRevision(r.revision) || !paymentDigest(r.policy_hash) || typeof r.approved_text !== "string") failure();
    const bytes = new TextEncoder().encode(r.approved_text as string); if (bytes.byteLength > 65536) failure();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join(""); if (digest !== r.policy_hash) failure();
  }
  return v;
}
/** Fixed status translation preserves truthful pending/unknown and bounded durable quota retry. */
function response(value: unknown, code?: string): Response {
  const safeCode = code === undefined ? undefined : errors.has(code) || ["not_authenticated", "transport_unknown", "repository_unknown", "invalid_receipt", "continuation_unavailable"].includes(code) ? code : "activation_closed";
  const v = value as Record<string, unknown>, error = safeCode ?? (typeof v?.error_code === "string" ? v.error_code : undefined), status = error === "rate_limited" ? 429 : error === "invalid_input" ? 400 : error === "not_authenticated" ? 401 : error === "not_found" ? 404 : ["revision_conflict", "payload_conflict", "policy_changed"].includes(error ?? "") ? 409 : ["activation_closed", "configuration_missing", "transport_unknown", "repository_unknown", "invalid_receipt", "continuation_unavailable"].includes(error ?? "") ? 503 : 200;
  const headers = new Headers(PAYMENT_RESPONSE_HEADERS);
  if (status === 429) { const retry = Number(v.retry_after_seconds); if (!Number.isInteger(retry) || retry < 1 || retry > 60) return response(null, "invalid_receipt"); headers.set("retry-after", String(retry)); }
  return new Response(JSON.stringify(safeCode ? { error_code: errors.has(safeCode) || safeCode === "not_authenticated" ? safeCode : "activation_closed" } : value), { status, headers });
}
/** Public handler delegates quotas once to fixed SQL and closes before any Auth/key/SDK work when unapproved. */
export function createPaymentOwnerHttp(options: PaymentHttpOptions) {
  const services = options.services, provider = Object.freeze({ ...options.provider }), loadKey = options.loadReturnKey;
  return async (request: Request, lineage?: PaymentReturnLineage): Promise<Response> => {
    if (!services.ready()) return response(null, "activation_closed");
    const lifetime = createPaymentLifetime();
    try {
      const { action, input } = await readPaymentInput(request, lifetime.observe), owner = await services.owner(request, lifetime.observe);
      if (action === "continuation") {
        const repository = await createPaymentContinuationRepository(services, owner, input, lifetime.observe), ticket = await readProviderContinuation(repository, String(input.setup_id), Number(input.setup_revision), provider.provision, provider.credential, provider.transport);
        await provider.transport.quiescence();
        if (!ticket || ticket.operation_id !== input.operation_id || ticket.operation_revision !== input.operation_revision || ticket.setup_id !== input.setup_id || ticket.setup_revision !== input.setup_revision || ticket.return_route_key !== "account_payments") throw new Error("continuation_unavailable");
        return response(ticket);
      }
      if (action === "return" || action === "return.consume") {
        if (!lineage || !paymentDigest(lineage.browserDigest) || !paymentId(lineage.returnAdmissionId)) throw new Error("browser_lineage_required");
        const captured = Object.freeze({ ...lineage });
        if (action === "return.consume") {
          if (!captured.capsule) throw new Error("browser_lineage_required");
          const value = await owner.consumeReturn({ state_digest: returnCapsuleDigest(captured.capsule), browser_digest: captured.browserDigest });
          providerDto("card.setup.complete", value); return response(value);
        }
        const issuance = { request: { ...input, return_admission_id: captured.returnAdmissionId }, browser_digest: captured.browserDigest };
        let result: Record<string, unknown>;
        try { result = internalBrowserEnvelope(await owner.createReturn(issuance)); }
        catch { result = internalBrowserEnvelope(await owner.readReturn(issuance)); }
        if (result.status !== "completed") return response(result);
        const r = result.result as Record<string, unknown>;
        if (r.state !== "issuable") {
          if (r.state === "consumed" && exact(r, ["state", "original_receipt", "operation"])) { providerDto("card.setup.complete", r.original_receipt); if (r.operation !== null) parseBrowserOperation(r.operation); return response({ state: "consumed", operation: r.operation }); }
          if (r.state === "expired" && exact(r, ["state", "operation"])) { if (r.operation !== null) parseBrowserOperation(r.operation); return response({ state: "expired", operation: r.operation }); } failure();
        }
        if (!exact(r, ["state", "metadata", "metadata_hash", "state_digest"]) || !paymentDigest(r.metadata_hash)) failure();
        const metadata = r.metadata as Record<string, unknown>;
        if (returnCapsuleMetadataHash(metadata) !== r.metadata_hash || metadata.owner_id !== owner.ownerId || metadata.browser_digest !== captured.browserDigest || metadata.return_admission_id !== captured.returnAdmissionId || metadata.begin_operation_id !== input.operation_id || metadata.begin_operation_revision !== input.operation_revision || metadata.setup_id !== input.setup_id || metadata.setup_revision !== input.setup_revision) failure();
        const key = await loadKey(String(metadata.key_reference_id), Number(metadata.key_reference_revision)); if (!key) throw new Error("continuation_unavailable");
        const capsule = createReturnCapsule(metadata, key); if (r.state_digest !== null && r.state_digest !== capsule.token_digest) failure();
        const binder = services.service("return_capsule_bind", lifetime.observe); if (!("bindReturn" in binder)) throw new Error("activation_closed");
        try {
          const bound = internalBrowserEnvelope(await binder.bindReturn!({ family_id: metadata.family_id, metadata_hash: capsule.metadata_hash, key_reference_id: metadata.key_reference_id, key_reference_revision: metadata.key_reference_revision, state_digest: capsule.token_digest }));
          if (bound.status !== "completed" || !exact(bound.result, ["state", "family_id", "metadata_hash"]) || (bound.result as Record<string, unknown>).state !== "bound" || (bound.result as Record<string, unknown>).family_id !== metadata.family_id || (bound.result as Record<string, unknown>).metadata_hash !== capsule.metadata_hash) failure();
        } catch {
          const read = internalBrowserEnvelope(await owner.readReturn(issuance)), recovered = read.result as Record<string, unknown>;
          if (read.status !== "completed" || recovered?.state !== "issuable" || recovered.state_digest !== capsule.token_digest || recovered.metadata_hash !== capsule.metadata_hash || returnCapsuleMetadataHash(recovered.metadata) !== capsule.metadata_hash) throw new Error("continuation_unavailable");
        }
        // Fresh owner/context read after key loading/binding prevents delivery of
        // an expired/revoked/consumed family; original expiry is never renewed.
        const final = internalBrowserEnvelope(await owner.readReturn(issuance)), current = final.result as Record<string, unknown>;
        if (final.status !== "completed" || current?.state !== "issuable" || current.state_digest !== capsule.token_digest || current.metadata_hash !== capsule.metadata_hash || returnCapsuleMetadataHash(current.metadata) !== capsule.metadata_hash) throw new Error("continuation_unavailable");
        // Local time can only refuse delivery; SQL's locked original expiry
        // remains the authority and is never extended or regenerated here.
        if (BigInt(Date.now()) * 1000n >= BigInt(String(metadata.expires_at_unix_microseconds))) throw new Error("continuation_unavailable");
        await captured.installCapsule(capsule.token, String(metadata.expires_at_unix_microseconds));
        return response({ state: "pending", operation_id: input.operation_id });
      }
      const value = await owner.ordinary(action, input);
      if (["context", "operations", "operation", "history"].includes(action)) parseBrowserReply(action, value);
      else if (action.startsWith("card.") && action !== "card.list") providerDto(action, value, input.operation_id);
      else if (action === "consent.read") await consentRead(value, input);
      else if (["customer.ensure", "consent.accept", "consent.revoke"].includes(action)) task7Write(action, value, input.operation_id);
      else if (action === "card.list") {
        if (!exact(value, ["cards", "customer_revision", "next_cursor"]) && !exact(value, ["error_code", "retry_after_seconds"]) && !exact(value, ["error_code"])) failure();
        const list = value as Record<string, unknown>; if (list.cards !== undefined && (!Array.isArray(list.cards) || list.cards.length > Number(input.limit) || list.next_cursor !== null && !paymentId(list.next_cursor))) failure();
        if (list.cards !== undefined) {
          if (!(list.customer_revision === 0 || paymentRevision(list.customer_revision))) failure();
          for (const card of list.cards as unknown[]) providerDto("card.read", { provider_contract_version: 1, operation_id: null, operation_revision: null, status: "completed", result: card, error_code: null, retry_after_seconds: null });
        } else if (!["invalid_input", "rate_limited"].includes(String(list.error_code))) failure();
      }
      return response(value);
    } catch (error) { return response(null, error instanceof Error ? error.message : "activation_closed"); }
    finally { await lifetime.quiescence(); }
  };
}
