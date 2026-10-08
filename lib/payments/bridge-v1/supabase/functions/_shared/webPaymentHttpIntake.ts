/** Finite payment HTTP grammar; no parsed field can select SQL, owner or provider identity. */
export const PAYMENT_ROUTES = Object.freeze({
  "GET /context": { action: "context", keys: [] },
  "GET /operations": { action: "operations", keys: ["after", "limit"] },
  "GET /operation": { action: "operation", keys: ["operation_id"] },
  "POST /customer/ensure": { action: "customer.ensure", keys: ["operation_id", "customer_revision"] },
  "GET /consent": { action: "consent.read", keys: [] },
  "GET /consents/history": { action: "history", keys: ["after", "limit"] },
  "POST /consent/accept": { action: "consent.accept", keys: ["operation_id", "customer_revision", "policy_id", "policy_version", "policy_revision", "policy_hash", "affirmative"] },
  "POST /consent/revoke": { action: "consent.revoke", keys: ["operation_id", "consent_id", "consent_revision"] },
  "GET /cards": { action: "card.list", keys: ["after", "limit"] },
  "POST /setup/begin": { action: "card.setup.begin", keys: ["operation_id", "customer_revision", "consent_id", "return_route_key"] },
  "POST /setup/complete": { action: "card.setup.complete", keys: ["operation_id", "setup_id", "setup_revision"] },
  "POST /card/default": { action: "card.default.set", keys: ["operation_id", "customer_revision", "card_id", "card_revision"] },
  "POST /card/remove": { action: "card.remove", keys: ["operation_id", "customer_revision", "card_id", "card_revision"] },
  "POST /setup/continuation": { action: "continuation", keys: ["operation_id", "operation_revision", "setup_id", "setup_revision"] },
  "POST /setup/return": { action: "return", keys: ["operation_id", "operation_revision", "setup_id", "setup_revision", "return_route_key"] },
  "POST /setup/return/consume": { action: "return.consume", keys: [] },
} as const);
/** Identical privacy headers cover owner and private job replies. */
export const PAYMENT_RESPONSE_HEADERS = Object.freeze({ "content-type": "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
export type PaymentAction = typeof PAYMENT_ROUTES[keyof typeof PAYMENT_ROUTES]["action"];
export const paymentId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const paymentRevision = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 999999999;
export const paymentDigest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const invalid = (): never => { throw new Error("invalid_input"); };
/** Walk JSON before native parsing loses duplicate keys, including escaped aliases. */
export function strictPaymentJson(text: string): Record<string, unknown> {
  let at = 0;
  const space = () => { while (/\s/.test(text[at] ?? "") && at < text.length) at++; };
  const string = (): string => {
    const start = at++; let escaped = false;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"' && !escaped) { try { return JSON.parse(text.slice(start, at)); } catch { return invalid(); } }
      if (c === "\\" && !escaped) escaped = true; else escaped = false;
    }
    return invalid();
  };
  const value = (depth: number): void => {
    if (depth > 20) invalid(); space();
    if (text[at] === '"') { string(); return; }
    if (text[at] === "{" || text[at] === "[") {
      const object = text[at++] === "{", end = object ? "}" : "]", keys = new Set<string>(); space();
      if (text[at] === end) { at++; return; }
      while (true) {
        if (object) {
          if (text[at] !== '"') invalid(); const key = string();
          if (keys.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) invalid(); keys.add(key); space();
          if (text[at++] !== ":") invalid();
        }
        value(depth + 1); space(); if (text[at] === end) { at++; return; }
        if (text[at++] !== ",") invalid(); space();
      }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!match) invalid(); at += match![0].length;
  };
  value(0); space(); if (at !== text.length) invalid();
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { return invalid(); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") invalid();
  return parsed as Record<string, unknown>;
}
/** Complete stream ownership survives cancellation; observation covers disposal too. */
export async function boundedPaymentBody(request: Request, observe: (work: Promise<void>) => void): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || (request.headers.get("content-encoding") ?? "identity") !== "identity") invalid();
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) invalid();
  const work = (async () => {
    if (!request.body) invalid(); const reader = request.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0, interrupted = false;
    const cancel = () => { interrupted = true; void reader.cancel().catch(() => {}); };
    const timer = setTimeout(cancel, 10000); request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) invalid(); chunks.push(value); }
      if (interrupted) throw new Error("transport_unknown");
      if (length !== null && Number(length) !== size) invalid(); const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return invalid(); }
      return strictPaymentJson(text);
    } finally { try { await reader.cancel(); } finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); } }
  })(); observe(work.then(() => {}, () => {})); return await work;
}
/** Canonical scalar bounds are shared by query and JSON routes after exact key checks. */
export function validatePaymentInput(action: PaymentAction, input: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(input)) {
    if (key === "after") { if (value !== null && !paymentId(value)) invalid(); }
    else if (key === "limit") { if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50) invalid(); }
    else if (key.endsWith("_id")) { if (!paymentId(value)) invalid(); }
    else if (key === "customer_revision" && action === "customer.ensure" && value === 0) continue;
    else if (key === "policy_version" || key === "version") { if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(value)) invalid(); }
    else if (key.endsWith("_revision")) { if (!paymentRevision(value)) invalid(); }
    else if (key === "policy_hash") { if (!paymentDigest(value)) invalid(); }
    else if (key === "affirmative") { if (value !== true) invalid(); }
    else if (key === "return_route_key") { if (value !== "account_payments") invalid(); }
    else invalid();
  }
  return input;
}
/** Method/path are literal registry entries; duplicate or unknown query fields always deny. */
export async function readPaymentInput(request: Request, observe: (work: Promise<void>) => void) {
  const url = new URL(request.url), key = `${request.method} ${url.pathname.replace(/^\/v1\/payments/, "")}` as keyof typeof PAYMENT_ROUTES;
  if (!url.pathname.startsWith("/v1/payments/") || !Object.hasOwn(PAYMENT_ROUTES, key) || url.hash) invalid();
  const route = PAYMENT_ROUTES[key]; let input: Record<string, unknown>;
  if (request.method === "POST") { if (url.search) invalid(); input = await boundedPaymentBody(request, observe); }
  else {
    input = {}; for (const [name, value] of url.searchParams) { if (Object.hasOwn(input, name)) invalid(); input[name] = value; }
    for (const name of ["limit"]) if (Object.hasOwn(input, name)) { if (!/^[1-9][0-9]{0,8}$/.test(String(input[name]))) invalid(); input[name] = Number(input[name]); }
    if (["operations", "history", "card.list"].includes(route.action)) { input.after ??= null; input.limit ??= 20; }
  }
  const expected: readonly string[] = route.action === "consent.read" ? (Object.hasOwn(input, "consent_id") ? ["consent_id"] : ["policy_id", "version"]) : route.keys;
  if (Object.keys(input).length !== expected.length || !expected.every(k => Object.hasOwn(input, k))) invalid();
  return Object.freeze({ action: route.action, input: Object.freeze(validatePaymentInput(route.action, input)) });
}
