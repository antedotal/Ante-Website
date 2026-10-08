/** Server-only Auth/RPC binding for the accepted, closed private-photo handlers. */
import {
  privatePhotoStorageHeaders,
  privatePhotoStorageOrigin,
} from "./privatePhotoAssetStore.ts";
import {
  createPrivatePhotoObservationLifetime,
  createRegistryQuiescenceConfirmer,
  createTransportTrackedProfilePublicationHandler,
  createTransportTrackedProofPublicationHandler,
  type PhotoTransportObservationOptions,
} from "./privatePhotoTransport.ts";
import type { PhotoCodec } from "./privatePhotoNormalizer.ts";
import {
  createPrivateProofPhotoReader,
  createProofRetentionAvailability,
} from "./privateProofPhotoReader.ts";
import { createConfiguredProfilePhotoPublicationHandler } from "./profilePhotoPublication.ts";
import { createConfiguredProofPhotoPublicationHandler } from "./proofPhotoPublication.ts";

export interface PrivatePhotoSupabaseConfig {
  projectUrl: string;
  publicKey: string;
  serviceCredential?: string;
  fetcher?: typeof fetch;
  /** One deadline covers Fetch and complete JSON consumption; never exceed ten seconds. */
  requestTimeoutMs?: number;
}
export interface ConnectedPrivatePhotoConfig
  extends PrivatePhotoSupabaseConfig {
  codec: PhotoCodec;
  enabled?: boolean;
  /** Trusted distributed sensitive-write admission; no local fallback is installed. */
  admitProof(owner: string, limit: number, windowMs: number): Promise<boolean>;
  admitProfile(
    owner: string,
    operationId: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean>;
  acquireCapacity(actor: string): Promise<(() => void) | null>;
}
const MAX_JSON_BYTES = 65_536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BEARER_LENGTH = 8199;
const BEARER = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i;
// Exact names prevent routing callers into financial/admin RPCs or path substitution.
const RPC_NAMES = new Set([
  // Closed decision lookup shares task/native release policy and carries no policy mutation authority.
  "authorize_task_proof_photo_release_v1",
  "consume_private_photo_admission_v1",
  "acquire_private_photo_capacity_v1",
  "finish_private_photo_capacity_v1",
  "profile_photo_state_v1",
  "reserve_profile_photo_v1",
  "bind_profile_photo_input_v1",
  "prepare_profile_photo_v1",
  "publish_profile_photo_v1",
  "replay_profile_photo_v1",
  "clear_profile_photo_v1",
  "profile_photo_read_manifest_v1",
  "reserve_friend_proof_upload_v1",
  "bind_friend_proof_input_v1",
  "prepare_friend_proof_upload_v1",
  "publish_friend_proof_upload_v1",
  "replay_friend_proof_upload_v1",
  "abort_friend_proof_upload_v1",
  "friend_proof_read_manifest_v1",
  "private_photo_retention_readable_v1",
  "claim_private_photo_delete_v1",
  "reconcile_private_photo_delete_v1",
  "process_friend_proof_deadlines_v1",
  "begin_private_photo_dispatch_v1",
  "acknowledge_private_photo_dispatch_v1",
  "seal_private_photo_transport_v1",
  "confirm_private_photo_transport_v1",
  "attest_private_photo_retention_v2",
  "list_private_photo_retention_candidates_v1",
]);
// Preserve only the domain messages interpreted by the existing proof handler.
const DOMAIN_ERRORS = new Set([
  "NOT_AUTHORIZED_OR_NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_MANIFEST",
  "IDEMPOTENCY_CONFLICT",
  "REVISION_CONFLICT",
  "EXPIRED_LEASE",
  "DEADLINE_EXPIRED",
  "TASK_NOT_SUBMITTABLE",
  "UNSUPPORTED_LEGACY_TASK",
  "SUBMISSION_THROTTLED",
]);
const unavailable = () => ({
  data: null,
  error: { message: "SERVICE_UNAVAILABLE" },
});
const failure = () => new Error("SERVICE_UNAVAILABLE");
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Classify public configuration only; decoded caller claims never determine identity. */
function publicKeyValid(key: unknown): key is string {
  if (typeof key !== "string") return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return true;
  const parts = key.split(".");
  if (
    parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  ) return false;
  try {
    const decode = (part: string) =>
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return decode(parts[0])?.alg === "HS256" &&
      decode(parts[1])?.role === "anon";
  } catch {
    return false;
  }
}

/** Validate the full privileged runtime configuration before any Auth/RPC/Storage dispatch. */
export function privatePhotoSupabaseConfigurationValid(
  config: PrivatePhotoSupabaseConfig,
): boolean {
  const timeout = config.requestTimeoutMs ?? 10_000;
  return (
    !!privatePhotoStorageOrigin(config.projectUrl) &&
    publicKeyValid(config.publicKey) &&
    !!privatePhotoStorageHeaders(config.serviceCredential) &&
    (config.fetcher === undefined || typeof config.fetcher === "function") &&
    Number.isInteger(timeout) &&
    timeout >= 1 &&
    timeout <= 10_000
  );
}

/** Pin the destination and race the entire response consumption against one deadline. */
async function requestJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  mode: "auth" | "rpc",
  callerSignal?: AbortSignal,
  observePhysicalLifetime?: (work: Promise<void>) => void,
): Promise<{ status: number; value: unknown }> {
  if (callerSignal?.aborted) throw failure();
  const observation = createPrivatePhotoObservationLifetime(
    observePhysicalLifetime,
  );
  const { retain } = observation;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let ended = false;
  let disposalStarted = false;
  // Disposal remains outside bounded result settlement but inside the exact physical RPC lifetime.
  const disposeResponse = () => {
    if (!response || disposalStarted) return;
    disposalStarted = true;
    try {
      retain(
        Promise.resolve(reader ? reader.cancel() : response.body?.cancel())
          .catch(() => {}),
      );
    } catch { /* A rejected cancellation cannot create response evidence. */ }
  };
  let rejectStopped: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  const stop = () => {
    controller.abort();
    rejectStopped(failure());
    disposeResponse();
  };
  const timer = setTimeout(stop, timeoutMs);
  callerSignal?.addEventListener("abort", stop, { once: true });
  const work = retain((async () => {
    // Keep wire Content-Length comparable to returned bytes: Fetch may transparently decompress.
    const headers = new Headers(init.headers);
    headers.set("Accept-Encoding", "identity");
    const pending = fetcher(url, {
      ...init,
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    response = await pending;
    if (ended || controller.signal.aborted || Date.now() >= deadline) {
      disposeResponse();
      throw failure();
    }
    if (
      response.redirected || (response.url && response.url !== url) ||
      response.status < 200 ||
      (response.status >= 300 && response.status < 400) ||
      response.status === 206
    ) throw failure();
    // A provider that contradicts identity negotiation cannot supply a complete identity reply.
    const encoding = response.headers.get("content-encoding");
    if (encoding !== null && encoding.trim().toLowerCase() !== "identity") {
      throw failure();
    }
    if (
      mode === "auth" && (response.status === 401 || response.status === 403)
    ) {
      disposeResponse();
      return { status: response.status, value: null };
    }
    const range = response.headers.get("content-range");
    const unit = response.headers.get("range-unit");
    // PostgREST emits this exact scalar envelope; arbitrary/partial ranges remain forbidden.
    const scalarRange = mode === "rpc" && response.status === 200 &&
      range === "0-0/*" &&
      (unit === null || unit === "items");
    if (
      (range !== null && !scalarRange) ||
      (unit !== null && (mode === "auth" || unit !== "items"))
    ) throw failure();
    if (
      response.headers.get("content-type")?.split(";", 1)[0].trim()
        .toLowerCase() !== "application/json"
    ) throw failure();
    const lengthText = response.headers.get("content-length");
    const length = lengthText === null ? null : Number(lengthText);
    if (
      lengthText !== null && (!/^(0|[1-9]\d*)$/.test(lengthText) ||
        !Number.isSafeInteger(length) || (length ?? 0) > MAX_JSON_BYTES)
    ) throw failure();
    reader = response.body?.getReader();
    if (!reader) throw failure();
    let count = 0;
    // Fixed contiguous storage bounds bookkeeping even for arbitrarily many empty chunks.
    const buffer = new Uint8Array(MAX_JSON_BYTES);
    while (true) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted || Date.now() >= deadline) throw failure();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_JSON_BYTES) throw failure();
      buffer.set(value, count - value.byteLength);
    }
    if (length !== null && count !== length) throw failure();
    const bytes = buffer.subarray(0, count);
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (scalarRange && Array.isArray(value)) throw failure();
    if (controller.signal.aborted || Date.now() >= deadline) throw failure();
    return { status: response.status, value };
  })());
  try {
    return await Promise.race([work, stopped]);
  } catch {
    stop();
    disposeResponse();
    throw failure();
  } finally {
    ended = true;
    observation.finishAfter(work);
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", stop);
    try {
      reader?.releaseLock();
    } catch { /* Pending reads are already outside the deadline result. */ }
  }
}

/** Capture configuration once; Auth authority always comes from the verified remote response. */
export function createPrivatePhotoSupabaseServices(
  config: PrivatePhotoSupabaseConfig,
) {
  const origin = privatePhotoStorageOrigin(config.projectUrl);
  const publicKey = config.publicKey;
  const serviceHeaders = privatePhotoStorageHeaders(config.serviceCredential);
  const fetcher = config.fetcher ?? fetch;
  const timeout = config.requestTimeoutMs ?? 10_000;
  const configured = !!origin && typeof fetcher === "function" &&
    Number.isInteger(timeout) && timeout >= 1 && timeout <= 10_000;
  const authenticate = async (
    request: Request,
    observePhysicalLifetime?: (work: Promise<void>) => void,
  ): Promise<string | null> => {
    const authorization = request.headers.get("authorization");
    if (
      !authorization || authorization.length > MAX_BEARER_LENGTH ||
      !BEARER.test(authorization)
    ) return null;
    if (!configured || !publicKeyValid(publicKey)) throw failure();
    const reply = await requestJson(
      fetcher,
      `${origin}/auth/v1/user`,
      {
        method: "GET",
        headers: { apikey: publicKey, Authorization: authorization },
      },
      timeout,
      "auth",
      request.signal,
      observePhysicalLifetime,
    );
    if (reply.status === 401 || reply.status === 403) return null;
    if (
      reply.status !== 200 || !record(reply.value) ||
      typeof reply.value.id !== "string" || !UUID.test(reply.value.id)
    ) throw failure();
    return reply.value.id;
  };
  return {
    authenticateOwner: async (
      request: Request,
      observePhysicalLifetime?: (work: Promise<void>) => void,
    ): Promise<{ ownerId: string } | null> => {
      const id = await authenticate(request, observePhysicalLifetime);
      return id === null ? null : { ownerId: id };
    },
    authenticateActor: async (
      request: Request,
      observePhysicalLifetime?: (work: Promise<void>) => void,
    ): Promise<{ actorId: string } | null> => {
      const id = await authenticate(request, observePhysicalLifetime);
      return id === null ? null : { actorId: id };
    },
    /** Exact caller-role resolver: the public key and captured bearer preserve auth.uid(). */
    resolveProfilePhoto: async (
      request: Request,
      ownerId: string,
      observePhysicalLifetime?: (work: Promise<void>) => void,
    ): Promise<{ data: unknown; error: unknown }> => {
      // Snapshot all mutable inputs before the first await; never accept an actor or RPC name.
      const authorization = request.headers.get("authorization");
      const signal = request.signal;
      if (
        !configured || !publicKeyValid(publicKey) ||
        typeof ownerId !== "string" ||
        !UUID.test(ownerId) || !authorization ||
        authorization.length > MAX_BEARER_LENGTH ||
        !BEARER.test(authorization)
      ) return unavailable();
      const body = JSON.stringify({ p_owner: ownerId });
      try {
        const reply = await requestJson(
          fetcher,
          `${origin}/rest/v1/rpc/resolve_profile_photo_v1`,
          {
            method: "POST",
            headers: {
              apikey: publicKey,
              Authorization: authorization,
              "Content-Type": "application/json",
            },
            body,
          },
          timeout,
          "rpc",
          signal,
          observePhysicalLifetime,
        );
        return reply.status === 200
          ? { data: reply.value, error: null }
          : unavailable();
      } catch {
        return unavailable();
      }
    },
    /** Allowlisted service-only JSON transport; provider details never escape this boundary. */
    rpc: async (
      name: string,
      args: Record<string, unknown>,
      /** Trusted Promise-only physical lifetime for this exact RPC; no metadata enters the hook. */
      observePhysicalLifetime?: (work: Promise<void>) => void,
      signal?: AbortSignal,
    ): Promise<{ data: unknown; error: unknown }> => {
      if (
        !configured || !serviceHeaders || !RPC_NAMES.has(name) || !record(args)
      ) return unavailable();
      try {
        const body = JSON.stringify(args);
        if (
          typeof body !== "string" ||
          new TextEncoder().encode(body).byteLength > MAX_JSON_BYTES
        ) return unavailable();
        const headers = new Headers(serviceHeaders);
        headers.set("Content-Type", "application/json");
        const reply = await requestJson(
          fetcher,
          `${origin}/rest/v1/rpc/${name}`,
          { method: "POST", headers, body },
          timeout,
          "rpc",
          signal,
          observePhysicalLifetime,
        );
        if (reply.status >= 200 && reply.status < 300) {
          return { data: reply.value, error: null };
        }
        if (
          reply.status >= 400 && reply.status < 500 && record(reply.value) &&
          typeof reply.value.message === "string" &&
          DOMAIN_ERRORS.has(reply.value.message)
        ) {
          return { data: null, error: { message: reply.value.message } };
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}

/** Reuse accepted factories and retention attestation without installing routes or activation. */
export function createConnectedPrivatePhotoHandlers(
  config: ConnectedPrivatePhotoConfig,
) {
  return connectPrivatePhotoHandlers(config, false);
}

/** Explicit durable composition; still requires accepted distributed admission/capacity and codec. */
export function createConnectedTransportTrackedPrivatePhotoHandlers(
  config: ConnectedPrivatePhotoConfig & PhotoTransportObservationOptions,
) {
  const handlers = connectPrivatePhotoHandlers(config, true);
  return {
    ...handlers,
    confirmQuiescence: createRegistryQuiescenceConfirmer(
      createPrivatePhotoSupabaseServices({ ...config }).rpc,
    ),
  };
}

/** Share configuration validation/read wiring so tracked opt-in never changes existing closed defaults. */
function connectPrivatePhotoHandlers(
  config: ConnectedPrivatePhotoConfig & PhotoTransportObservationOptions,
  tracked: boolean,
) {
  const snapshot = { ...config };
  const services = createPrivatePhotoSupabaseServices(snapshot);
  const enabled = snapshot.enabled === true &&
    !!privatePhotoStorageOrigin(snapshot.projectUrl) &&
    publicKeyValid(snapshot.publicKey) &&
    !!privatePhotoStorageHeaders(snapshot.serviceCredential) &&
    typeof snapshot.codec?.acquire === "function" &&
    typeof snapshot.admitProof === "function" &&
    typeof snapshot.admitProfile === "function" &&
    typeof snapshot.acquireCapacity === "function";
  const transport = {
    enabled,
    projectUrl: snapshot.projectUrl,
    credential: snapshot.serviceCredential ?? "",
    fetcher: snapshot.fetcher,
    rpc: services.rpc,
    ...(tracked
      ? {
        observeLifetime: snapshot.observeLifetime,
        observationTimeoutMs: snapshot.observationTimeoutMs,
        journalTimeoutMs: snapshot.journalTimeoutMs,
      }
      : {}),
  };
  return {
    proofPublication:
      (tracked
        ? createTransportTrackedProofPublicationHandler
        : createConfiguredProofPhotoPublicationHandler)({
          ...transport,
          authenticate: services.authenticateOwner,
          admit: snapshot.admitProof,
          acquireCapacity: snapshot.acquireCapacity,
          codec: snapshot.codec,
        }),
    profilePublication:
      (tracked
        ? createTransportTrackedProfilePublicationHandler
        : createConfiguredProfilePhotoPublicationHandler)({
          ...transport,
          authenticate: services.authenticateOwner,
          admit: snapshot.admitProfile,
          codec: snapshot.codec,
        }),
    proofRead: createPrivateProofPhotoReader({
      ...transport,
      authenticate: services.authenticateActor,
      acquireCapacity: snapshot.acquireCapacity,
      isRetentionAvailable: createProofRetentionAvailability(services.rpc),
    }),
  };
}
