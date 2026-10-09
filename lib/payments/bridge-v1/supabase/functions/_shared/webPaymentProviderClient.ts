// eslint-disable-next-line import/no-unresolved -- Exact Deno npm lock/type import is checked separately.
import Stripe from "stripe";
import {
  API_VERSION,
  exact,
  parsePermit,
  type Permit,
  SDK_VERSION,
} from "./webPaymentProviderContract.ts";
export type Provisioning = {
  enabled: boolean;
  provider_account: string;
  environment: "test" | "live";
  sandbox_id: string;
  credential_reference: string;
  provisioning_hash: string;
  api_version: string;
  sdk_version: string;
  adapter_version: string;
  fixture_only: boolean;
};
export type GuardedTransport = {
  fetch: typeof fetch;
  run: <T>(work: () => Promise<T>) => Promise<T>;
  quiescence: () => Promise<void>;
};
// One explicit SDK call owns one physical request. This also blocks the SDK's special ECONNRESET retry.
// Deadline settlement remains separate from physical I/O/cancel quiescence; late work remains observed.
export function guardedTransport(
  rawFetch: typeof fetch,
  { timeoutMs = 5000, maxBytes = 65536, now = Date.now }: {
    timeoutMs?: number;
    maxBytes?: number;
    now?: () => number;
  } = {},
): GuardedTransport {
  if (
    typeof AbortController !== "function" || !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 || timeoutMs > 10000 || !Number.isInteger(maxBytes) ||
    maxBytes < 1 || maxBytes > 65536
  ) throw new Error("transport_closed");
  const physical = new Set<Promise<unknown>>();
  let scope:
    | { deadline: number; calls: number; controller: AbortController }
    | null = null;
  const own = (work: Promise<unknown>) => {
    physical.add(work);
    work.catch(() => {}).finally(() => physical.delete(work));
    return work;
  };
  const safeFetch: typeof fetch = async (input, init) => {
    const current = scope;
    if (!current || ++current.calls !== 1) throw new Error("transport_closed");
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url,
    );
    if (
      url.protocol !== "https:" || url.hostname !== "api.stripe.com" ||
      url.port !== "" || url.username || url.password || url.hash ||
      !/^\/v1\/(customers|setup_intents|payment_methods)(\/[^/]+)?(\/detach)?$/
        .test(url.pathname) ||
      !["POST", "GET"].includes(init?.method ?? "GET") ||
      typeof init?.body !== "string" && init?.body != null ||
      new TextEncoder().encode(String(init?.body ?? "")).byteLength > 8192
    ) throw new Error("transport_closed");
    const external = init?.signal;
    const abort = () => current.controller.abort();
    external?.addEventListener("abort", abort, { once: true });
    if (external?.aborted) abort();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      let failed = true;
      try {
        const response = await rawFetch(url, {
          ...init,
          redirect: "manual",
          signal: current.controller.signal,
        });
        reader = response.body?.getReader();
        if (
          response.status >= 300 && response.status < 400 ||
          response.redirected || response.type === "opaqueredirect"
        ) throw new Error("provider_unknown");
        const length = response.headers.get("content-length");
        if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
          throw new Error("provider_unknown");
        }
        const chunks: Uint8Array[] = [];
        let count = 0;
        while (reader) {
          if (now() >= current.deadline || current.controller.signal.aborted) {
            throw new Error("provider_unknown");
          }
          const chunk = await reader.read();
          if (chunk.done) break;
          count += chunk.value.byteLength;
          if (count > maxBytes) throw new Error("provider_unknown");
          chunks.push(chunk.value);
        }
        if (now() >= current.deadline || current.controller.signal.aborted) {
          throw new Error("provider_unknown");
        }
        const bytes = new Uint8Array(count);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        // SDK sees only a JSON body and bounded safe request/version identifiers; Stripe-Notice is stripped.
        const headers = new Headers({ "content-type": "application/json" });
        for (const name of ["request-id", "stripe-version"]) {
          const v = response.headers.get(name);
          if (v && /^[A-Za-z0-9._-]{1,256}$/.test(v)) headers.set(name, v);
        }
        failed = false;
        return new Response(bytes, { status: response.status, headers });
      } finally {
        if (failed && reader) await reader.cancel().catch(() => {});
        reader?.releaseLock();
      }
    })();
    own(work);
    try {
      return await Promise.race([
        work,
        new Promise<Response>((_, reject) => {
          timer = setTimeout(() => {
            current.controller.abort();
            reject(new Error("provider_unknown"));
          }, Math.max(1, current.deadline - now()));
        }),
      ]);
    } catch {
      current.controller.abort();
      if (reader) own(reader.cancel().catch(() => {}));
      throw new Error("provider_unknown");
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", abort);
    }
  };
  return {
    fetch: safeFetch,
    async run<T>(work: () => Promise<T>) {
      if (scope || physical.size) throw new Error("transport_closed");
      const current = {
        deadline: now() + timeoutMs,
        calls: 0,
        controller: new AbortController(),
      };
      scope = current;
      try {
        return await work();
      } finally {
        scope = null;
      }
    },
    async quiescence() {
      while (physical.size) await Promise.allSettled([...physical]);
    },
  };
}
// Provisioning evidence must match the persisted permit before secret resolution or SDK construction.
export function createProviderClient(
  value: Permit,
  provision: Provisioning,
  credential: () => string,
  transport: GuardedTransport,
  now = Date.now(),
) {
  const p = parsePermit(value), c = p.configuration;
  if (
    !exact(
      provision,
      "enabled provider_account environment sandbox_id credential_reference provisioning_hash api_version sdk_version adapter_version fixture_only"
        .split(" "),
    ) || !provision.enabled || c.fixture_only !== provision.fixture_only ||
    Object.keys(provision).some((k) =>
      k !== "enabled" &&
      provision[k as keyof Provisioning] !== c[k as keyof typeof c]
    ) || !Number.isFinite(now) || now < Date.parse(c.effective_at) ||
    now >= Date.parse(c.expires_at) || now >= Date.parse(p.lease_expires_at) ||
    c.fixture_only && !provision.fixture_only ||
    c.api_version !== API_VERSION || c.sdk_version !== SDK_VERSION
  ) throw new Error("activation_closed");
  const key = credential();
  if (!key || typeof key !== "string") throw new Error("activation_closed");
  const sdk = new Stripe(key, {
    apiVersion: API_VERSION,
    maxNetworkRetries: 0,
    timeout: 5000,
    telemetry: false,
    emitEventBodies: false,
    httpClient: Stripe.createFetchHttpClient(transport.fetch),
  });
  return { sdk, transport, permit: p };
}
