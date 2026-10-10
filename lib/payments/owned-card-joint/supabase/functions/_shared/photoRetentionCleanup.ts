import { createPrivatePhotoObservationLifetime } from "./privatePhotoTransport.ts";
import {
  privatePhotoStorageHeaders,
  privatePhotoStorageOrigin,
} from "./privatePhotoAssetStore.ts";

export interface RetentionClaim {
  status: "claimed";
  purpose: "proof" | "profile";
  asset_id: string;
  owner_id: string;
  bucket: string;
  object_key: string;
  claim_id: string;
  worker_operation_id: string;
  worker_lease_epoch: number;
  quiescence_receipt: string;
}
export interface RetentionCleanupDependencies {
  enabled: boolean;
  projectUrl: string;
  credential: string;
  rpc: (
    name: string,
    args: Record<string, unknown>,
    observePhysicalLifetime?: (work: Promise<void>) => void,
    signal?: AbortSignal,
  ) => Promise<{ data: unknown; error: unknown }>;
  // The receipt must cover ALL dispatches for this asset/operation, including stale epochs
  // and uncertain HTTP POSTs. Current epoch binds identity; it never proves quiescence.
  // Lease expiry or a deployment-wide flag cannot implement this callback.
  confirmQuiescence: (claim: RetentionClaim) => Promise<boolean>;
  fetcher?: typeof fetch;
  /** Caller cancellation and absolute cutoff never imply physical settlement. */
  signal?: AbortSignal;
  deadline?: number;
  observePhysicalLifetime?: (work: Promise<void>) => void;
  /** Propagate a child cutoff to the containing pass; normal completion does not call this. */
  onCutoff?: () => void;
}
export type RetentionCleanupResult = {
  status: "closed" | "invalid_input" | "held" | "busy" | "unknown" | "deleted";
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOTAL_MS = 30_000;
const REQUEST_MS = 10_000;
const MAX_REPLY = 16_384;
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}
function claimOf(
  v: unknown,
  purpose: string,
  asset: string,
  claimId: string,
): RetentionClaim | null {
  const c = record(v);
  if (
    !c || Object.keys(c).length !== 10 || c.status !== "claimed" ||
    c.purpose !== purpose ||
    c.asset_id !== asset || c.claim_id !== claimId ||
    typeof c.owner_id !== "string" || !UUID.test(c.owner_id) ||
    c.bucket !==
      (purpose === "proof"
        ? "verification-proof-assets-v1"
        : "profile-photos") ||
    c.object_key !== `${c.owner_id}/${asset}` ||
    typeof c.worker_operation_id !== "string" ||
    !UUID.test(c.worker_operation_id) ||
    typeof c.quiescence_receipt !== "string" ||
    !UUID.test(c.quiescence_receipt) ||
    !Number.isSafeInteger(c.worker_lease_epoch) ||
    Number(c.worker_lease_epoch) < 1
  ) return null;
  return c as unknown as RetentionClaim;
}
/** One logical budget retains late Fetch/RPC/read/cancel work for its parent's ownership. */
export function createRetentionWorkScope(options: {
  signal?: AbortSignal;
  deadline?: number;
  observePhysicalLifetime?: (work: Promise<void>) => void;
  onCutoff?: () => void;
}) {
  const deadline = Math.min(
    options.deadline ?? Infinity,
    Date.now() + TOTAL_MS,
  );
  const observation = createPrivatePhotoObservationLifetime(
    options.observePhysicalLifetime,
  );
  const controller = new AbortController();
  const stop = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    options.onCutoff?.();
  };
  const timer = setTimeout(stop, Math.max(0, deadline - Date.now()));
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  const active = () => !controller.signal.aborted && Date.now() < deadline;
  return {
    signal: controller.signal,
    deadline,
    active,
    stop,
    retain: observation.retain,
    observe: (work: Promise<void>) => {
      observation.retain(work);
    },
    /** Defer invocation until after checking the cutoff; eager promises can dispatch too late. */
    async run<T>(start: () => Promise<T>): Promise<T> {
      if (!active()) throw Error("stopped");
      let requestTimer: ReturnType<typeof setTimeout> | undefined;
      let abort: () => void = () => {};
      const stopped = new Promise<never>((_, reject) => {
        abort = () => reject(Error("stopped"));
        controller.signal.addEventListener("abort", abort, { once: true });
        requestTimer = setTimeout(
          stop,
          Math.max(1, Math.min(REQUEST_MS, deadline - Date.now())),
        );
      });
      try {
        const result = await Promise.race([
          observation.retain(start()),
          stopped,
        ]);
        if (!active()) throw Error("stopped");
        return result;
      } finally {
        clearTimeout(requestTimer);
        controller.signal.removeEventListener("abort", abort);
      }
    },
    finish() {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", stop);
      controller.abort();
      observation.finishAfter(Promise.resolve());
    },
  };
}

/** Keep Storage disposal/read lifetimes owned even when the bounded caller already returned. */
async function storageRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  scope: ReturnType<typeof createRetentionWorkScope>,
): Promise<{ status: number; body: string } | null> {
  if (!scope.active()) return null;
  const controller = new AbortController();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let disposed = false;
  let disposal: Promise<unknown> | undefined;
  const dispose = () => {
    if (!response || disposed) return;
    disposed = true;
    try {
      disposal = scope.retain(
        Promise.resolve(reader ? reader.cancel() : response.body?.cancel())
          .catch(() => {}),
      );
    } catch { /* Cancellation failure supplies no absence evidence. */ }
  };
  const stop = () => {
    controller.abort();
    dispose();
  };
  scope.signal.addEventListener("abort", stop, { once: true });
  // Establish the shared cutoff before abort-aware I/O can settle and clear scope.run's timer.
  // Ordinary failure/disposal still uses local stop so non-timeout absence recovery remains valid.
  const timer = setTimeout(
    scope.stop,
    Math.max(1, Math.min(REQUEST_MS, scope.deadline - Date.now())),
  );
  try {
    return await scope.run(async () => {
      response = await fetcher(url, {
        ...init,
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
      });
      if (controller.signal.aborted || !scope.active()) {
        dispose();
        throw Error("stopped");
      }
      if (
        response.redirected || (response.url && response.url !== url) ||
        response.headers.has("content-range")
      ) throw Error("invalid response");
      if (init.method !== "GET" || response.status !== 404) {
        dispose();
        return { status: response.status, body: "" };
      }
      const encoding = response.headers.get("content-encoding");
      if (encoding && encoding.toLowerCase() !== "identity") {
        throw Error("encoding");
      }
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_REPLY)
      ) throw Error("length");
      reader = response.body?.getReader();
      if (!reader) throw Error("missing body");
      // Allocate one bounded buffer; empty/tiny chunks cannot grow a pieces array indefinitely.
      const bytes = new Uint8Array(MAX_REPLY);
      let size = 0;
      try {
        while (true) {
          if (controller.signal.aborted || !scope.active()) {
            throw Error("stopped");
          }
          const { done, value } = await reader.read();
          if (controller.signal.aborted || !scope.active()) {
            throw Error("stopped");
          }
          if (done) break;
          if (size + value.byteLength > MAX_REPLY) throw Error("oversize");
          bytes.set(value, size);
          size += value.byteLength;
        }
        if (length !== null && Number(length) !== size) {
          throw Error("truncated");
        }
        return {
          status: response.status,
          body: new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size),
          ),
        };
      } finally {
        dispose();
        await disposal;
        reader.releaseLock();
      }
    });
  } catch {
    stop();
    return null;
  } finally {
    clearTimeout(timer);
    scope.signal.removeEventListener("abort", stop);
  }
}
function objectAbsent(r: { status: number; body: string } | null): boolean {
  if (r?.status !== 404) return false;
  try {
    const e = record(JSON.parse(r.body));
    return !!e &&
      (e.code === "NoSuchKey" ||
        e.error === "not_found" && e.message === "Object not found");
  } catch {
    return false;
  }
}
// Closed service runner: no route, scheduler, grant or production quiescence producer.
export async function cleanupPrivatePhoto(
  input: { purpose: "proof" | "profile"; assetId: string; claimId: string },
  deps: RetentionCleanupDependencies,
): Promise<RetentionCleanupResult> {
  if (deps.enabled !== true) return { status: "closed" };
  const origin = privatePhotoStorageOrigin(deps.projectUrl),
    headers = privatePhotoStorageHeaders(deps.credential);
  if (
    !input || !["proof", "profile"].includes(input.purpose) ||
    !UUID.test(input.assetId) || !UUID.test(input.claimId) || !origin ||
    !headers
  ) return { status: "invalid_input" };
  const scope = createRetentionWorkScope(deps);
  const args = {
    p_purpose: input.purpose,
    p_asset_id: input.assetId,
    p_claim_id: input.claimId,
  };
  try {
    const first = await scope.run(() =>
      deps.rpc(
        "claim_private_photo_delete_v1",
        args,
        scope.observe,
        scope.signal,
      )
    );
    if (first.error) return { status: "unknown" };
    const status = record(first.data)?.status;
    if (status === "held" || status === "busy" || status === "deleted") {
      return { status };
    }
    const claim = claimOf(
      first.data,
      input.purpose,
      input.assetId,
      input.claimId,
    );
    if (
      !claim || await scope.run(() => deps.confirmQuiescence(claim)) !== true
    ) return { status: "held" };
    const second = await scope.run(() =>
      deps.rpc(
        "claim_private_photo_delete_v1",
        args,
        scope.observe,
        scope.signal,
      )
    );
    const checked = !second.error &&
      claimOf(second.data, input.purpose, input.assetId, input.claimId);
    if (
      !checked ||
      Object.keys(claim).some((k) =>
        claim[k as keyof RetentionClaim] !== checked[k as keyof RetentionClaim]
      )
    ) return { status: "unknown" };
    headers.set("content-type", "application/json");
    headers.set("cache-control", "no-store");
    headers.set("accept-encoding", "identity");
    const fetcher = deps.fetcher ?? fetch;
    await storageRequest(
      fetcher,
      `${origin}/storage/v1/object/${claim.bucket}`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({ prefixes: [claim.object_key] }),
      },
      scope,
    );
    const absent = await storageRequest(
      fetcher,
      `${origin}/storage/v1/object/authenticated/${claim.bucket}/${claim.object_key}`,
      { method: "GET", headers },
      scope,
    );
    if (!objectAbsent(absent)) return { status: "unknown" };
    const final = await scope.run(() =>
      deps.rpc(
        "reconcile_private_photo_delete_v1",
        {
          ...args,
          p_object_absent: true,
        },
        scope.observe,
        scope.signal,
      )
    );
    return {
      status: !final.error && record(final.data)?.status === "deleted"
        ? "deleted"
        : "unknown",
    };
  } catch {
    return { status: "unknown" };
  } finally {
    scope.finish();
  }
}
