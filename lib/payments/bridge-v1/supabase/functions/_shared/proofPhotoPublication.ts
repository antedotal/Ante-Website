import {
  inspectPreparedProofPhoto,
  PROOF_PHOTO_PREPARATION_VERSION,
} from "../../../lib/proofPhotos/preparedProofPhoto.ts";
/** Closed server orchestration; there is deliberately no deployable route/index. */
import {
  normalizePrivatePhoto,
  type PhotoCodec,
  photoSha256,
  readPrivatePhotoInputDigest,
} from "./privatePhotoNormalizer.ts";
import {
  type PreparedPrivatePhotoRecord,
  storePreparedPrivatePhoto,
} from "./privatePhotoAssetStore.ts";
export type RpcResult = { data: unknown; error: unknown };
export type ProofArtifact = {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  byteCount: number;
  sha256: string;
  inputSha256: string;
  transformVersion: string;
};
export interface ProofPublicationDependencies {
  enabled?: boolean;
  authenticate(request: Request): Promise<{ ownerId: string } | null>;
  /** Trusted distributed admission: ten fresh sensitive writes per minute. */
  admit(ownerId: string, limit: number, windowMs: number): Promise<boolean>;
  acquireCapacity(ownerId: string): Promise<(() => void) | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  normalize(
    input: {
      stream: ReadableStream<Uint8Array>;
      purpose: "proof";
      signal: AbortSignal;
      bindInput: (digest: string, version: string) => Promise<boolean>;
    },
  ): Promise<{ status: string; artifact?: ProofArtifact }>;
  store(
    input: {
      purpose: "proof";
      prepared: Record<string, unknown>;
      bytes: Uint8Array;
      signal: AbortSignal;
      isLeaseCurrent: () => Promise<boolean>;
    },
  ): Promise<{ status: string }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const response = (status: number, code: string) =>
  new Response(
    JSON.stringify({
      error: code,
      ...(status === 503 ? { retry: "retry_same_operation" } : {}),
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
function rpcFailure(error: unknown): Response {
  const status: Record<string, number> = {
    NOT_AUTHORIZED_OR_NOT_FOUND: 403,
    INVALID_INPUT: 400,
    INVALID_MANIFEST: 422,
    IDEMPOTENCY_CONFLICT: 409,
    REVISION_CONFLICT: 409,
    EXPIRED_LEASE: 409,
    DEADLINE_EXPIRED: 409,
    TASK_NOT_SUBMITTABLE: 409,
    UNSUPPORTED_LEGACY_TASK: 409,
    SUBMISSION_THROTTLED: 429,
  };
  const message = isRecord(error) && typeof error.message === "string"
    ? error.message
    : "";
  return status[message]
    ? response(status[message], message.toLowerCase())
    : response(503, "uncertain");
}
type OriginatingProofIntent = {
  ownerId: string;
  taskId: string;
  operationId: string;
  expectedRevision: number;
};
function refused(
  status: 409 | 413 | 422,
  error: string,
  intent: OriginatingProofIntent,
): Response {
  return new Response(
    JSON.stringify({
      error,
      publication: "not_published",
      refusalVersion: 1,
      ...intent,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
/** Lazy dispatch and post-await fencing prevent timed-out work from starting another stage. */
async function bounded<T>(
  dispatch: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(Error("uncertain"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    if (signal.aborted) throw Error("uncertain");
    const result = await Promise.race([dispatch(), stopped]);
    if (signal.aborted) throw Error("uncertain");
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
function receipt(
  value: unknown,
  taskRevision: number,
): Record<string, unknown> | null {
  if (
    !isRecord(value) || !uuid.test(String(value.assetId)) ||
    !uuid.test(String(value.attemptId)) || value.purpose !== "proof" ||
    !["image/jpeg", "image/png"].includes(String(value.contentType)) ||
    typeof value.replayed !== "boolean" ||
    value.taskRevision !== taskRevision ||
    typeof value.transformVersion !== "string" ||
    new TextEncoder().encode(value.transformVersion).length < 1 ||
    new TextEncoder().encode(value.transformVersion).length > 128
  ) return null;
  for (const k of ["width", "height", "bytes"]) {
    if (
      typeof value[k] !== "number" || !Number.isInteger(value[k]) ||
      value[k] < 1
    ) return null;
  }
  if (
    (value.bytes as number) > 10485760 ||
    !(((value.width as number) >= (value.height as number) &&
      (value.width as number) <= 1920 && (value.height as number) <= 1080) ||
      ((value.width as number) < (value.height as number) &&
        (value.width as number) <= 1080 && (value.height as number) <= 1920))
  ) return null;
  return Object.fromEntries(
    [
      "assetId",
      "attemptId",
      "purpose",
      "contentType",
      "width",
      "height",
      "bytes",
      "transformVersion",
      "taskRevision",
      "replayed",
    ].map((k) => [k, value[k]]),
  );
}
/** Factory defaults closed. Dependencies supply caller JWT validation, service RPC, codec and Storage transport. */
export function createProofPhotoPublicationHandler(
  d: ProofPublicationDependencies,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (d.enabled !== true) return response(503, "closed");
    if (req.method !== "POST") return response(405, "method_not_allowed");
    const capacity: { release: (() => void) | null } = { release: null };
    const controller = new AbortController(), signal = controller.signal;
    const cancel = () => {
      controller.abort();
      // Locked intake owns its cancellation listener; otherwise cancel the unused body here.
      if (req.body && !req.body.locked) void req.body.cancel().catch(() => {});
    };
    req.signal.addEventListener("abort", cancel, { once: true });
    if (req.signal.aborted) cancel();
    const deadline = Date.now() + 60000;
    const timer = setTimeout(cancel, 60000);
    try {
      const taskId = req.headers.get("X-Task-Id") ?? "",
        operationId = req.headers.get("X-Operation-Id") ?? "",
        revisionText = req.headers.get("X-Expected-Revision") ?? "";
      const revision = Number(revisionText);
      if (
        !uuid.test(taskId) || !uuid.test(operationId) ||
        !/^\d+$/.test(revisionText) || !Number.isSafeInteger(revision) ||
        revision < 1 || revision >= 2147483647 || !req.body
      ) return response(400, "invalid_input");
      const stream = req.body;
      const auth = await bounded(() => d.authenticate(req), signal);
      if (!auth || !uuid.test(auth.ownerId)) {
        return response(401, "unauthenticated");
      }
      const ownerId = auth.ownerId;
      const base = { p_owner: ownerId, p_operation_id: operationId };
      const intent = {
        ownerId,
        taskId,
        operationId,
        expectedRevision: revision,
      };
      const certifyAbort = async (status: 409 | 413 | 422, error: string) => {
        // A durable immutable tombstone, rather than a lease window or HTTP
        // failure, rules out all future publication of this exact identity.
        const aborted = await bounded(
          () =>
            d.rpc("abort_friend_proof_upload_v1", {
              ...base,
              p_task_id: taskId,
              p_expected_revision: revision,
            }),
          signal,
        );
        const value = aborted.data;
        if (
          aborted.error || !isRecord(value) ||
          Object.keys(value).length !== 6 ||
          value.code !== "ABORTED" || value.state !== "aborted" ||
          value.owner_id !== ownerId || value.operation_id !== operationId ||
          value.task_id !== taskId || value.expected_revision !== revision
        ) {
          // Publication may have won the lock, or the abort acknowledgement
          // may be unknown. Keep the original operation for reconciliation.
          return response(503, "uncertain");
        }
        return refused(status, error, intent);
      };
      const reserved = await bounded(
        () =>
          d.rpc("reserve_friend_proof_upload_v1", {
            ...base,
            p_task_id: taskId,
            p_expected_revision: revision,
          }),
        signal,
      );
      if (reserved.error) {
        if (
          isRecord(reserved.error) && reserved.error.code === "P0001" &&
          reserved.error.message === "REVISION_CONFLICT" &&
          reserved.data === null
        ) {
          return await certifyAbort(409, "revision_conflict");
        }
        if (
          isRecord(reserved.error) && reserved.error.code === "P0001" &&
          reserved.error.message === "IDEMPOTENCY_CONFLICT" &&
          reserved.data === null
        ) {
          // A lost abort acknowledgement can be reconciled only by the exact
          // tombstone; conflicting or completed identities are never retired.
          return await certifyAbort(409, "operation_aborted");
        }
        return rpcFailure(reserved.error);
      }
      if (!isRecord(reserved.data)) return response(503, "uncertain");
      if (reserved.data.code === "BUSY") {
        return response(409, "busy_retry_same_operation");
      }
      if (
        !["OK", "REPLAY_REQUIRED"].includes(String(reserved.data.code)) ||
        reserved.data.owner_id !== ownerId ||
        reserved.data.operation_id !== operationId ||
        reserved.data.task_id !== taskId ||
        reserved.data.expected_revision !== revision ||
        !uuid.test(String(reserved.data.asset_id)) ||
        reserved.data.object_key !== ownerId + "/" + reserved.data.asset_id
      ) return response(503, "uncertain");
      const capacityAcquired = await bounded(async () => {
        const acquired = await d.acquireCapacity(ownerId);
        if (acquired) {
          let released = false;
          // Adopt before bounded's post-await fence can reject the handoff.
          // The same handle also owns acquisitions arriving after finally.
          capacity.release = () => {
            if (released) return;
            released = true;
            acquired();
          };
          if (signal.aborted) {
            capacity.release();
            throw Error("uncertain");
          }
        }
        return !!acquired;
      }, signal);
      if (!capacityAcquired) return response(503, "busy");
      if (reserved.data.code === "REPLAY_REQUIRED") {
        const digest = await bounded(
          () => readPrivatePhotoInputDigest(stream, "proof", signal),
          signal,
        );
        const replay = await bounded(
          () =>
            d.rpc("replay_friend_proof_upload_v1", {
              ...base,
              p_input_sha256: "\\x" + digest,
            }),
          signal,
        );
        if (replay.error) return rpcFailure(replay.error);
        const result = receipt(replay.data, revision + 1);
        return result
          ? new Response(JSON.stringify(result), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "private, no-store",
            },
          })
          : response(503, "uncertain");
      }
      if (!await bounded(() => d.admit(ownerId, 10, 60000), signal)) {
        return response(429, "rate_limited");
      }
      const epoch = reserved.data.lease_epoch;
      if (
        typeof epoch !== "number" || !Number.isSafeInteger(epoch) ||
        epoch < 1 ||
        !["reserved", "prepared"].includes(String(reserved.data.state)) ||
        typeof reserved.data.lease_until !== "string" ||
        !Number.isFinite(Date.parse(reserved.data.lease_until)) ||
        // Avoid dispatching processing that can outlive its acknowledged fence.
        Date.parse(reserved.data.lease_until) < deadline
      ) return response(503, "uncertain");
      const fenced = { ...base, p_lease_epoch: epoch };
      let bindingFailure: Response | null = null;
      const bindInput = async (digest: string, version: string) => {
        if (signal.aborted || !hex.test(digest) || !version) return false;
        let bound: RpcResult;
        try {
          bound = await bounded(() =>
            d.rpc("bind_friend_proof_input_v1", {
              ...fenced,
              p_input_sha256: "\\x" + digest,
              p_transform_version: version,
            }), signal);
        } catch {
          bindingFailure = response(503, "uncertain");
          return false;
        }
        if (bound.error) {
          bindingFailure = rpcFailure(bound.error);
          return false;
        }
        if (!isRecord(bound.data) || bound.data.code !== "OK") {
          bindingFailure = response(503, "uncertain");
          return false;
        }
        return true;
      };
      const normalized = await bounded(() =>
        d.normalize({
          stream,
          purpose: "proof",
          signal,
          bindInput,
        }), signal);
      if (bindingFailure) return bindingFailure;
      if (normalized.status !== "ok" || !normalized.artifact) {
        if (
          ["unsupported_input", "corrupt_input", "size_rejected"].includes(
            normalized.status,
          )
        ) {
          return await certifyAbort(
            normalized.status === "size_rejected" ? 413 : 422,
            "input_rejected",
          );
        }
        return response(
          normalized.status === "size_rejected"
            ? 413
            : normalized.status === "expired_lease"
            ? 409
            : ["busy", "unavailable", "resource_rejected"].includes(
                normalized.status,
              )
            ? 503
            : 422,
          "input_rejected",
        );
      }
      const a = normalized.artifact;
      if (
        !hex.test(a.sha256) || !hex.test(a.inputSha256) ||
        !(a.bytes instanceof Uint8Array) || a.bytes.length !== a.byteCount
      ) return response(422, "invalid_normalized_artifact");
      if (
        a.transformVersion !== PROOF_PHOTO_PREPARATION_VERSION ||
        a.sha256 !== a.inputSha256 || await photoSha256(a.bytes) !== a.sha256
      ) return response(422, "invalid_normalized_artifact");
      try {
        const inspected = inspectPreparedProofPhoto(a.bytes);
        if (
          inspected.mime !== a.mime || inspected.width !== a.width ||
          inspected.height !== a.height || inspected.byteCount !== a.byteCount
        ) return response(422, "invalid_normalized_artifact");
      } catch {
        return response(422, "invalid_normalized_artifact");
      }
      const prepared = await bounded(
        () =>
          d.rpc("prepare_friend_proof_upload_v1", {
            ...fenced,
            p_input_sha256: "\\x" + a.inputSha256,
            p_normalized_sha256: "\\x" + a.sha256,
            p_mime: a.mime,
            p_width: a.width,
            p_height: a.height,
            p_byte_count: a.byteCount,
            p_transform_version: a.transformVersion,
          }),
        signal,
      );
      if (prepared.error) return rpcFailure(prepared.error);
      if (
        !isRecord(prepared.data) || prepared.data.code !== "OK" ||
        prepared.data.state !== "prepared" ||
        prepared.data.owner_id !== ownerId ||
        prepared.data.operation_id !== operationId ||
        prepared.data.asset_id !== reserved.data.asset_id ||
        prepared.data.object_key !== reserved.data.object_key ||
        prepared.data.lease_epoch !== epoch ||
        prepared.data.normalized_sha256 !== "\\x" + a.sha256 ||
        prepared.data.input_sha256 !== "\\x" + a.inputSha256 ||
        prepared.data.mime !== a.mime || prepared.data.width !== a.width ||
        prepared.data.height !== a.height ||
        prepared.data.byte_count !== a.byteCount ||
        prepared.data.transform_version !== a.transformVersion
      ) return response(503, "uncertain");
      const preparedManifest = prepared.data;
      const stored = await bounded(() =>
        d.store({
          purpose: "proof",
          prepared: preparedManifest,
          bytes: a.bytes,
          signal,
          isLeaseCurrent: () => bindInput(a.inputSha256, a.transformVersion),
        }), signal);
      if (bindingFailure) return bindingFailure;
      if (stored.status !== "verified") {
        return response(
          stored.status === "conflict" ? 409 : 503,
          "storage_unverified",
        );
      }
      const committed = await bounded(
        () => d.rpc("publish_friend_proof_upload_v1", fenced),
        signal,
      );
      if (committed.error) return response(503, "uncertain");
      const result = receipt(committed.data, revision + 1);
      return result
        ? new Response(JSON.stringify(result), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
          },
        })
        : response(503, "uncertain");
    } catch {
      return response(503, "uncertain");
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", cancel);
      // Cancellation releases local resources only: it proves neither RPC/Storage
      // transport quiescence nor permission to delete a durable operation or asset.
      cancel();
      capacity.release?.();
    }
  };
}
/** Concrete isolated-codec/Storage wiring, still closed unless separately enabled and released. */
export function createConfiguredProofPhotoPublicationHandler(
  d: Omit<ProofPublicationDependencies, "normalize" | "store"> & {
    codec: PhotoCodec;
    projectUrl: string;
    credential: string;
    fetcher?: typeof fetch;
  },
): (req: Request) => Promise<Response> {
  const { codec, projectUrl, credential, fetcher } = d;
  return createProofPhotoPublicationHandler({
    ...d,
    normalize: (input) => normalizePrivatePhoto({ ...input, codec }),
    store: (input) =>
      storePreparedPrivatePhoto({
        ...input,
        prepared: input.prepared as unknown as PreparedPrivatePhotoRecord,
        projectUrl,
        credential,
        fetcher,
      }),
  });
}
