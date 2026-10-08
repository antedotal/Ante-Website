/** Closed, request-local observer. Durable SQL authorization precedes every physical Storage dispatch. */
import {
  type PreparedPrivatePhotoRecord,
  privatePhotoSha256,
  privatePhotoStorageHeaders,
  privatePhotoStorageManifest,
  privatePhotoStorageOrigin,
} from "./privatePhotoAssetStore.ts";
import {
  createConfiguredProofPhotoPublicationHandler,
  type RpcResult,
} from "./proofPhotoPublication.ts";
import {
  type ConfiguredProfilePhotoPublicationDependencies,
  createConfiguredProfilePhotoPublicationHandler,
} from "./profilePhotoPublication.ts";
import type { RetentionClaim } from "./photoRetentionCleanup.ts";

export type PhotoTransportRpc = (
  name: string,
  args: Record<string, unknown>,
  /** Service-private per-call seam for bounded RPC adapters to retain their actual wire/disposal work. */
  observePhysicalLifetime?: (work: Promise<void>) => void,
) => Promise<RpcResult>;
export interface PhotoTransportObservationOptions {
  /** Trusted runtime retains its reservation using only this lifetime; it conveys no receipt or secrets. */
  observeLifetime?: (work: Promise<void>) => void;
  /** Bounded observer deadline, independently of caller settlement; default/max thirty seconds. */
  observationTimeoutMs?: number;
  /** Per-journal-call deadline, default/max ten seconds; at most three idempotent acknowledgements. */
  journalTimeoutMs?: number;
}
export interface TrackedPrivatePhotoFetcherOptions
  extends PhotoTransportObservationOptions {
  prepared: PreparedPrivatePhotoRecord & { input_sha256: string };
  purpose: "proof" | "profile";
  journal: PhotoTransportRpc;
  projectUrl: string;
  credential: string;
  fetcher?: typeof fetch;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BYTEA = /^\\x[0-9a-f]{64}$/;
const unavailable = () => Error("SERVICE_UNAVAILABLE");
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Share Promise-only lifetime bookkeeping between Storage observers and bounded physical RPC adapters. */
export function createPrivatePhotoObservationLifetime(
  notify?: (work: Promise<void>) => void,
) {
  const pending = new Set<Promise<unknown>>();
  let resolveLifetime: () => void = () => {};
  const lifetime = new Promise<void>((resolve) => {
    resolveLifetime = resolve;
  });
  try {
    notify?.(lifetime);
  } catch (error) {
    resolveLifetime();
    throw error;
  }
  return {
    lifetime,
    retain<T>(work: Promise<T>): Promise<T> {
      pending.add(work);
      // Forget settled reads promptly so tiny/empty chunks cannot accumulate bookkeeping.
      void work.then(() => pending.delete(work), () => pending.delete(work));
      return work;
    },
    finishAfter(work: Promise<unknown>) {
      // Losing physical races can append late disposal work while the drain is awaiting them.
      void work.catch(() => {}).then(async () => {
        while (pending.size > 0) await Promise.allSettled(Array.from(pending));
        resolveLifetime();
      });
    },
  };
}

/** Bound caller work while separately retaining genuinely unsettled underlying promises. */
async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), Math.max(1, ms));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Exact snapshot: later mutable preparation/header/body changes cannot replace the authorized artifact. */
export function createTrackedPrivatePhotoFetcher(
  options: TrackedPrivatePhotoFetcherOptions,
): typeof fetch {
  const p = Object.freeze({ ...options.prepared });
  const { purpose, journal, observeLifetime } = options;
  const fetcher = options.fetcher ?? fetch;
  const origin = privatePhotoStorageOrigin(options.projectUrl);
  const serviceHeaders = privatePhotoStorageHeaders(options.credential);
  const cap = purpose === "proof" ? 10_485_760 : 2_097_152;
  const manifest = privatePhotoStorageManifest(p, cap);
  const observationMs = options.observationTimeoutMs ?? 30_000;
  const journalMs = options.journalTimeoutMs ?? 10_000;
  const bucket = purpose === "proof"
    ? "verification-proof-assets-v1"
    : "profile-photos";
  const valid = !!origin && !!serviceHeaders && !!manifest &&
    BYTEA.test(p.input_sha256) &&
    BYTEA.test(p.normalized_sha256) &&
    (purpose === "proof" || purpose === "profile") &&
    typeof journal === "function" && typeof fetcher === "function" &&
    (observeLifetime === undefined || typeof observeLifetime === "function") &&
    Number.isInteger(observationMs) && observationMs >= 1 &&
    observationMs <= 30_000 &&
    Number.isInteger(journalMs) && journalMs >= 1 && journalMs <= 10_000;
  // PostgreSQL jsonb array text has comma-space separators and all seven source ->> values are strings.
  const manifestText = "[" +
    [
      p.input_sha256,
      p.normalized_sha256,
      p.mime,
      String(p.width),
      String(p.height),
      String(p.byte_count),
      p.transform_version,
    ]
      .map((v) => JSON.stringify(v)).join(", ") +
    "]";
  return (input, init) => {
    // Native Request streams and inherited defaults are deliberately outside this narrow accepted adapter.
    let url: string,
      headers: Headers,
      body: Uint8Array<ArrayBuffer> | undefined;
    const method = init?.method;
    const callerSignal = init?.signal;
    try {
      if (
        !valid || !(typeof input === "string" || input instanceof URL) ||
        (method !== "POST" && method !== "GET") ||
        (callerSignal !== undefined && callerSignal !== null &&
          !(callerSignal instanceof AbortSignal)) ||
        callerSignal?.aborted
      ) throw unavailable();
      url = String(input);
      const expected = `${origin}/storage/v1/object/${
        method === "GET" ? "authenticated/" : ""
      }${bucket}/${p.object_key}`;
      if (
        url !== expected ||
        (init?.redirect !== undefined && init.redirect !== "manual")
      ) throw unavailable();
      headers = new Headers(init?.headers);
      const expectedHeaders = new Headers(serviceHeaders!);
      expectedHeaders.set(
        "cache-control",
        method === "POST" ? "private, no-store" : "no-store",
      );
      if (method === "POST") {
        expectedHeaders.set("content-type", manifest!.mime);
        expectedHeaders.set("x-upsert", "false");
        if (
          !(init?.body instanceof Uint8Array) ||
          init.body.byteLength !== p.byte_count
        ) throw unavailable();
        body = new Uint8Array(init.body);
      } else if (init?.body !== undefined && init.body !== null) {
        throw unavailable();
      }
      if (
        Array.from(headers).length !== Array.from(expectedHeaders).length ||
        Array.from(expectedHeaders).some(([key, value]) =>
          headers.get(key) !== value
        )
      ) throw unavailable();
      headers.set("accept-encoding", "identity");
    } catch {
      return Promise.reject(unavailable());
    }

    let observation: ReturnType<typeof createPrivatePhotoObservationLifetime>;
    try {
      observation = createPrivatePhotoObservationLifetime(observeLifetime);
    } catch {
      return Promise.reject(unavailable());
    }
    const { retain } = observation;
    // Pass a Promise-only hook for each exact journal call; bounded facades must not hide physical work.
    const dispatchJournal: PhotoTransportRpc = (name, args) =>
      journal(name, args, (physical) => {
        retain(physical);
      });
    const controller = new AbortController();
    const abortPhysical = () => controller.abort();
    callerSignal?.addEventListener("abort", abortPhysical, { once: true });
    const deadline = Date.now() + observationMs;
    const remaining = () => Math.max(1, deadline - Date.now());
    const dispose = (response: Response) => {
      try {
        retain(Promise.resolve(response.body?.cancel()));
      } catch { /* Unresolved journal remains held. */ }
    };
    const operation = (async () => {
      if (body && await privatePhotoSha256(body) !== manifest!.hash) {
        throw unavailable();
      }
      const hash = await privatePhotoSha256(
        new TextEncoder().encode(manifestText),
      );
      if (callerSignal?.aborted || Date.now() >= deadline) throw unavailable();
      const dispatch = crypto.randomUUID();
      const registered = await within(
        retain(dispatchJournal("begin_private_photo_dispatch_v1", {
          p_purpose: purpose,
          p_asset_id: p.asset_id,
          p_operation_id: p.operation_id,
          p_lease_epoch: p.lease_epoch,
          p_dispatch_id: dispatch,
          p_method: method,
        })),
        Math.min(journalMs, remaining()),
      );
      const expected = {
        status: "registered",
        dispatch_id: dispatch,
        purpose,
        asset_id: p.asset_id,
        operation_id: p.operation_id,
        lease_epoch: p.lease_epoch,
        bucket,
        object_key: p.object_key,
        manifest_sha256: hash,
        normalized_sha256: manifest!.hash,
        mime: p.mime,
        width: p.width,
        height: p.height,
        byte_count: p.byte_count,
        transform_version: p.transform_version,
      };
      if (
        registered.error || !record(registered.data) ||
        Object.keys(registered.data).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([key, value]) =>
          (registered.data as Record<string, unknown>)[key] !== value
        ) ||
        callerSignal?.aborted || Date.now() >= deadline
      ) throw unavailable();
      let expired = false;
      let cancelObservation = () => {};
      const physical = retain((async () => {
        // Frozen explicit init excludes credential/destination substitutions via unvalidated Fetch options.
        const response = await fetcher(url, {
          method,
          headers,
          body,
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
        if (expired || Date.now() >= deadline) {
          dispose(response);
          throw unavailable();
        }
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
          const encoding = response.headers.get("content-encoding");
          const lengthText = response.headers.get("content-length");
          const length = lengthText === null ? null : Number(lengthText);
          const responseCap = method === "POST" ? 16_384 : cap;
          if (
            response.redirected || response.url && response.url !== url ||
            response.status < 200 ||
            response.status >= 300 && response.status < 400 ||
            response.status === 206 ||
            response.headers.has("content-range") ||
            response.headers.has("range-unit") ||
            encoding !== null && encoding.trim().toLowerCase() !== "identity" ||
            lengthText !== null &&
              (!/^(0|[1-9]\d*)$/.test(lengthText) ||
                !Number.isSafeInteger(length) || length! > responseCap) ||
            !response.body && response.status !== 204 ||
            response.status === 204 && length !== null && length !== 0
          ) throw unavailable();
          reader = response.body?.getReader();
          cancelObservation = () => {
            if (reader) {
              try {
                retain(reader.cancel());
              } catch { /* Retain unresolved disposal. */ }
            } else dispose(response);
          };
          // One bounded buffer avoids per-chunk object growth for adversarial tiny or empty chunks.
          const buffer = new Uint8Array(length ?? responseCap);
          let size = 0;
          while (reader) {
            const item = await retain(reader.read());
            if (expired || Date.now() >= deadline) throw unavailable();
            if (item.done) break;
            const nextSize = size + item.value.byteLength;
            if (nextSize > buffer.byteLength) throw unavailable();
            buffer.set(item.value, size);
            size = nextSize;
          }
          if (length !== null && size !== length) throw unavailable();
          // Empty streamed 200/201 replies are header-only evidence too; only explicit 204 may be bodyless.
          if (
            method === "POST" &&
            (response.status === 200 || response.status === 201) && size === 0
          ) throw unavailable();
          return { response, bytes: buffer.slice(0, size) };
        } catch {
          if (reader) {
            try {
              retain(reader.cancel());
            } catch { /* Disposal cannot prove quiescence. */ }
          } else dispose(response);
          throw unavailable();
        } finally {
          try {
            reader?.releaseLock();
          } catch { /* Pending read stays in the lifetime. */ }
        }
      })());
      // Bound physical observation without allowing a losing late Fetch to publish evidence after its deadline.
      let observed: Awaited<typeof physical>;
      try {
        observed = await within(physical, remaining());
      } catch {
        expired = true;
        controller.abort();
        cancelObservation();
        throw unavailable();
      }
      const status = observed.response.status;
      if (
        method === "GET" || status === 200 || status === 201 || status === 204
      ) {
        for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
          try {
            const ack = await within(
              retain(dispatchJournal("acknowledge_private_photo_dispatch_v1", {
                p_dispatch_id: dispatch,
                p_response_status: status,
              })),
              Math.min(journalMs, remaining()),
            );
            if (
              !ack.error && record(ack.data) &&
              Object.keys(ack.data).length === 1 &&
              ack.data.status === "acknowledged"
            ) break;
            if (
              !ack.error && record(ack.data) && ack.data.status === "denied"
            ) break;
          } catch {
            /* Only the original dispatch/status is retried; uncertainty remains durable. */
          }
        }
      }
      return new Response(status === 204 ? null : observed.bytes, {
        status,
        statusText: observed.response.statusText,
        headers: new Headers(observed.response.headers),
      });
    })();
    observation.finishAfter(operation);
    void observation.lifetime.then(() =>
      callerSignal?.removeEventListener("abort", abortPhysical)
    );
    let rejectCaller: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      rejectCaller = reject;
    });
    const cancelCaller = () => {
      abortPhysical();
      rejectCaller(unavailable());
    };
    callerSignal?.addEventListener("abort", cancelCaller, { once: true });
    if (callerSignal?.aborted) cancelCaller();
    return Promise.race([operation, stopped]).catch(() => {
      throw unavailable();
    }).finally(() => {
      callerSignal?.removeEventListener("abort", cancelCaller);
    });
  };
}

/** Exact SQL receipt confirmation is the only cleanup authority; timeout/lease/readback do not replace it. */
export function createRegistryQuiescenceConfirmer(rpc: PhotoTransportRpc) {
  return async (claim: RetentionClaim): Promise<boolean> => {
    const c = { ...claim };
    if (
      (c.purpose !== "proof" && c.purpose !== "profile") ||
      !UUID.test(c.asset_id) ||
      !UUID.test(c.worker_operation_id) || !UUID.test(c.quiescence_receipt) ||
      !Number.isSafeInteger(c.worker_lease_epoch) || c.worker_lease_epoch < 1
    ) return false;
    try {
      const result = await within(
        rpc("confirm_private_photo_transport_v1", {
          p_purpose: c.purpose,
          p_asset_id: c.asset_id,
          p_operation_id: c.worker_operation_id,
          p_lease_epoch: c.worker_lease_epoch,
          p_receipt: c.quiescence_receipt,
        }),
        10_000,
      );
      return !result.error && result.data === true;
    } catch {
      return false;
    }
  };
}

type ProofConfig = Parameters<
  typeof createConfiguredProofPhotoPublicationHandler
>[0];
type TrackedConfig = PhotoTransportObservationOptions;
/** Capture prepare DTOs on the real RPC path; each handler invocation owns its own manifest and observer. */
function requestTransport(
  d: TrackedConfig & {
    rpc: PhotoTransportRpc;
    projectUrl: string;
    credential: string;
    fetcher?: typeof fetch;
  },
  purpose: "proof" | "profile",
) {
  let prepared:
    | (PreparedPrivatePhotoRecord & { input_sha256: string })
    | undefined;
  const rpc: PhotoTransportRpc = async (name, args) => {
    const result = await d.rpc(name, args);
    if (
      name ===
        (purpose === "proof"
          ? "prepare_friend_proof_upload_v1"
          : "prepare_profile_photo_v1")
    ) {
      prepared =
        !result.error && record(result.data) && result.data.code === "OK"
          ? Object.freeze({ ...result.data }) as unknown as typeof prepared
          : undefined;
      // Return a separate snapshot so publishers cannot share mutable provider-owned objects.
      return { ...result, data: prepared ? { ...prepared } : result.data };
    }
    return result;
  };
  const fetcher: typeof fetch = (input, init) => {
    if (!prepared) return Promise.reject(unavailable());
    return createTrackedPrivatePhotoFetcher({
      ...d,
      purpose,
      prepared,
      journal: d.rpc,
    })(input, init);
  };
  return { rpc, fetcher };
}
/** Reuse accepted proof business logic; distributed admission/capacity and closed defaults remain required. */
export function createTransportTrackedProofPublicationHandler(
  d: ProofConfig & TrackedConfig,
) {
  const snapshot = { ...d };
  return (request: Request) =>
    createConfiguredProofPhotoPublicationHandler({
      ...snapshot,
      ...requestTransport(snapshot, "proof"),
    })(request);
}
/** Reuse accepted profile normalization, identity revalidation, publication and clear/replay behavior. */
export function createTransportTrackedProfilePublicationHandler(
  d: ConfiguredProfilePhotoPublicationDependencies & TrackedConfig,
) {
  const snapshot = { ...d };
  return (request: Request) =>
    createConfiguredProfilePhotoPublicationHandler({
      ...snapshot,
      ...requestTransport(snapshot, "profile"),
    })(request);
}
