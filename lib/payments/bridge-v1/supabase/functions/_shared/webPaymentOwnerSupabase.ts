/** Real bearer-preserving PostgREST binding; configuration is trusted server input. */
import { createPrivatePhotoSupabaseServices } from "./privatePhotoSupabase.ts";
import { privatePhotoStorageOrigin } from "./privatePhotoAssetStore.ts";
import { type PaymentAction, paymentDigest, paymentId } from "./webPaymentHttpIntake.ts";
export type PaymentLifetime = (work: Promise<void>) => void;
export type PaymentTransportPurpose = "owner_gateway" | "provider_dispatch" | "owner_secret_read" | "return_capsule_bind";
export interface PaymentSupabaseConfig {
  projectUrl: string;
  publicKey: string;
  enabled?: boolean;
  /** This source never establishes hosted JWT/OID/header/grant acceptance. */
  transportAccepted?: boolean;
  acceptedB0AuthoritySha256: string;
  gatewayCredential?: string;
  dispatchCredential?: string;
  secretReadCredential?: string;
  capsuleBindCredential?: string;
  dispatchBearer?: string;
  secretReadBearer?: string;
  capsuleBindBearer?: string;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
}
const B0_AUTHORITY = "6799e95ac25d0fa3c2a6a2f89dd0113d25f2bdcc3cb06c1b4a766c551b978f89";
const BEARER = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const headerNames = Object.freeze({ owner_gateway: "x-ante-payment-owner-gateway", provider_dispatch: "x-ante-payment-dispatch", owner_secret_read: "x-ante-payment-secret-read", return_capsule_bind: "x-ante-payment-capsule-bind" });
const secret = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(v);
const bearer = (v: unknown): v is string => typeof v === "string" && v.length <= 8199 && BEARER.test(v);
// Public apikey classification is not caller authentication. Reuse the accepted
// publishable/legacy-anon grammar without its unrelated service-credential gate.
function publicPaymentKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)) return true;
  const parts = value.split("."); if (parts.length !== 3 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const decode = (p: string) => JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return decode(parts[0])?.alg === "HS256" && decode(parts[1])?.role === "anon";
  } catch { return false; }
}
const unavailable = (): never => { throw new Error("activation_closed"); };
/** One deadline covers Fetch, full bounded reply and stream disposal. Redirects and compression deny. */
async function paymentRpc(config: Readonly<PaymentSupabaseConfig>, authorization: string, purpose: PaymentTransportPurpose, credential: string, name: string, args: Record<string, unknown>, maximum: number, observe: PaymentLifetime, signal?: AbortSignal): Promise<unknown> {
  const origin = new URL(config.projectUrl).origin, fetcher = config.fetcher ?? fetch, controller = new AbortController(), timeout = config.requestTimeoutMs ?? 10000;
  const headers = new Headers({ apikey: config.publicKey, authorization, "content-type": "application/json", "accept-encoding": "identity", [headerNames[purpose]]: credential });
  const body = JSON.stringify(args); if (new TextEncoder().encode(body).byteLength > 4096) throw new Error("invalid_input");
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false, expire: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { expire = reject; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); void reader?.cancel().catch(() => {}); expire(new Error("transport_unknown")); }, timeout);
  const work = (async () => {
    try {
      const response = await fetcher(`${origin}/rest/v1/rpc/${name}`, { method: "POST", headers, body, redirect: "error", signal: controller.signal });
      // Own the response stream before validating metadata so rejected status,
      // encoding or length replies are physically canceled and observed too.
      if (response.body) reader = response.body.getReader();
      if (response.redirected || response.status !== 200 || !/^application\/json(?:;.*)?$/i.test(response.headers.get("content-type") ?? "") || ![null, "identity"].includes(response.headers.get("content-encoding"))) throw new Error("transport_unknown");
      const length = response.headers.get("content-length"); if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new Error("transport_unknown");
      if (!reader) throw new Error("transport_unknown"); let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximum) throw new Error("transport_unknown"); chunks.push(part.value); }
      if (timedOut || controller.signal.aborted || length !== null && Number(length) !== size) throw new Error("transport_unknown");
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { throw new Error("transport_unknown"); }
    finally { try { await reader?.cancel(); } finally { reader?.releaseLock(); clearTimeout(timer); signal?.removeEventListener("abort", abort); } }
  })();
  observe(work.then(() => {}, () => {})); return await Promise.race([work, deadline]);
}
/** Literal action/argument mapping is private; no exported string RPC proxy exists. */
function ownerCall(action: PaymentAction, input: Readonly<Record<string, unknown>>): [string, Record<string, unknown>] {
  switch (action) {
    case "context": return ["http_read_my_payment_browser_context_v1", {}];
    case "operation": return ["http_read_my_payment_browser_operation_v1", { p_operation_id: input.operation_id }];
    case "operations": return ["http_list_my_payment_browser_operations_v1", { p_after: input.after, p_limit: input.limit }];
    case "history": return ["http_list_my_payment_consent_history_v1", { p_after: input.after, p_limit: input.limit }];
    case "card.list": return ["http_list_my_payment_cards_provider_v1", { p_after: input.after, p_limit: input.limit }];
    case "customer.ensure": return ["http_ensure_my_payment_customer_v1", { p_operation_id: input.operation_id, p_customer_revision: input.customer_revision }];
    case "consent.read": return ["http_read_my_payment_consent_v1", { p_policy_id: input.policy_id ?? null, p_version: input.version ?? null, p_consent_id: input.consent_id ?? null }];
    case "consent.accept": return ["http_accept_my_payment_consent_v1", { p_operation_id: input.operation_id, p_customer_revision: input.customer_revision, p_policy_id: input.policy_id, p_policy_version: input.policy_version, p_policy_revision: input.policy_revision, p_policy_hash: input.policy_hash, p_affirmative: input.affirmative }];
    case "consent.revoke": return ["http_revoke_my_payment_consent_v1", { p_operation_id: input.operation_id, p_consent_id: input.consent_id, p_consent_revision: input.consent_revision }];
    case "card.setup.begin": return ["http_begin_my_payment_card_setup_provider_v1", { p_request: input }];
    case "card.setup.complete": return ["http_complete_my_payment_card_setup_provider_v1", { p_request: input }];
    case "card.default.set": return ["http_set_my_payment_default_card_provider_v1", { p_request: input }];
    case "card.remove": return ["http_remove_my_payment_card_provider_v1", { p_request: input }];
    default: throw new Error("invalid_input");
  }
}
/** Owner session captures one real bearer; no caller-supplied UID enters any SQL body. */
export function createPaymentSupabase(config: PaymentSupabaseConfig) {
  const frozen = Object.freeze({ ...config }), auth = createPrivatePhotoSupabaseServices(frozen), timeout = frozen.requestTimeoutMs ?? 10000;
  const ready = () => frozen.enabled === true && frozen.transportAccepted === true && !!privatePhotoStorageOrigin(frozen.projectUrl) && publicPaymentKey(frozen.publicKey) && frozen.acceptedB0AuthoritySha256 === B0_AUTHORITY && Number.isInteger(timeout) && timeout >= 1 && timeout <= 10000 && secret(frozen.gatewayCredential);
  const ensureReady = () => { if (!ready()) unavailable(); };
  return Object.freeze({
    ready,
    async owner(request: Request, observe: PaymentLifetime) {
      ensureReady(); const authorization = request.headers.get("authorization"); if (!bearer(authorization)) throw new Error("not_authenticated");
      // Rebuild the Auth request from captured headers so mutating the incoming
      // Headers after any await cannot switch the owner or final bearer.
      const captured = new Request(new URL("/v1/payments/context", frozen.projectUrl), { headers: { authorization }, signal: request.signal }), actor = await auth.authenticateActor(captured, observe);
      if (!actor || !paymentId(actor.actorId)) throw new Error("not_authenticated");
      const fresh = async () => { const next = await auth.authenticateActor(captured, observe); if (!next || next.actorId !== actor.actorId) throw new Error("not_authenticated"); };
      const call = (name: string, args: Record<string, unknown>, cap = 65536) => paymentRpc(frozen, authorization, "owner_gateway", frozen.gatewayCredential!, name, args, cap, observe, request.signal);
      return Object.freeze({
        ownerId: actor.actorId,
        fresh,
        ordinary(action: PaymentAction, input: Readonly<Record<string, unknown>>) { const [name, args] = ownerCall(action, input); return call(name, args, action === "consent.read" ? 524288 : 65536); },
        beginContinuation(input: Record<string, unknown>) { return call("http_begin_my_payment_setup_continuation_v1", { p_request: input }); },
        async consumeContinuation(input: Record<string, unknown>) { await fresh(); return await call("http_consume_my_payment_setup_continuation_v1", { p_request: input }); },
        createReturn(input: Record<string, unknown>) { return call("http_create_my_payment_setup_return_state_v1", { p_request: input }); },
        async readReturn(input: Record<string, unknown>) { await fresh(); return await call("http_read_my_payment_setup_return_issuance_v1", { p_request: input }); },
        async consumeReturn(input: Record<string, unknown>) { await fresh(); return await call("http_consume_my_payment_setup_return_state_v1", { p_request: input }); },
      });
    },
    /** Internal job entry proves possession of the exact configured dedicated
     * bearer; the same bearer is then actually authenticated by PostgREST SQL. */
    workerRequestAccepted(request: Request) {
      ensureReady(); const actual = request.headers.get("authorization"), expected = frozen.dispatchBearer;
      if (!bearer(actual) || !bearer(expected) || actual.length !== expected.length) return false;
      let different = 0; for (let n = 0; n < actual.length; n++) different |= actual.charCodeAt(n) ^ expected.charCodeAt(n);
      return different === 0;
    },
    /** Purpose-specific closures never receive an owner bearer or final-consume port. */
    service(purpose: Exclude<PaymentTransportPurpose, "owner_gateway">, observe: PaymentLifetime) {
      ensureReady(); const credential = purpose === "provider_dispatch" ? frozen.dispatchCredential : purpose === "owner_secret_read" ? frozen.secretReadCredential : frozen.capsuleBindCredential,
        authorization = purpose === "provider_dispatch" ? frozen.dispatchBearer : purpose === "owner_secret_read" ? frozen.secretReadBearer : frozen.capsuleBindBearer;
      if (!secret(credential) || !bearer(authorization)) unavailable();
      const call = (name: string, args: Record<string, unknown>) => paymentRpc(frozen, authorization!, purpose, credential!, name, args, 65536, observe);
      if (purpose === "provider_dispatch") return Object.freeze({
        claim(limit: number) { if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("invalid_input"); return call("http_claim_payment_provider_browser_work_v1", { p_limit: limit }); },
        dispatch(input: Record<string, unknown>) { return call("http_record_payment_provider_browser_dispatch_v1", { p_request: input }); },
        observation(input: Record<string, unknown>) { return call("http_record_payment_provider_browser_observation_v1", { p_request: input }); },
      });
      if (purpose === "owner_secret_read") return Object.freeze({ readContinuation(digest: string) { if (!paymentDigest(digest)) throw new Error("invalid_input"); return call("http_read_payment_setup_continuation_capability_v1", { p_request: { capability_digest: digest } }); } });
      return Object.freeze({ bindReturn(input: Record<string, unknown>) { return call("http_bind_payment_setup_return_capsule_v1", { p_request: input }); } });
    },
  });
}
