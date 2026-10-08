/** Closed byte reader: no index/config entrypoint, no arbitrary caller object paths. */
export function createProofRetentionAvailability(
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): (manifest: Record<string, unknown>, actorId: string) => Promise<boolean> {
  return async (manifest, _actorId) => {
    if (
      manifest.bucket !== "verification-proof-assets-v1" ||
      typeof manifest.asset_id !== "string" || !uuid.test(manifest.asset_id)
    ) return false;
    try {
      const result = await rpc("private_photo_retention_readable_v1", {
        p_purpose: "proof",
        p_asset_id: manifest.asset_id,
      });
      return !!result && typeof result === "object" && !Array.isArray(result) &&
        (result as Record<string, unknown>).error === null &&
        (result as Record<string, unknown>).data === true;
    } catch {
      return false;
    }
  };
}
import {
  privatePhotoStorageHeaders,
  privatePhotoStorageOrigin,
} from "./privatePhotoAssetStore.ts";
import { photoSha256 } from "./privatePhotoNormalizer.ts";
export interface PrivateProofPhotoReaderDependencies {
  enabled?: boolean;
  projectUrl: string;
  credential:
    string; /** Validate caller JWT and live actor/session; no forwarded owner headers. */
  authenticate(request: Request): Promise<{ actorId: string } | null>;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<
    { data: unknown; error: unknown }
  >; /** Positive availability attestation from authoritative retention state. Missing means closed. */
  isRetentionAvailable?: (
    manifest: Record<string, unknown>,
    actorId: string,
  ) => Promise<boolean>;
  acquireCapacity(actorId: string): Promise<(() => void) | null>;
  fetcher?: typeof fetch;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const headers = {
  "Cache-Control": "private, no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};
const error = (status: number, code: string) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
type Manifest = {
  owner_id: string;
  asset_id: string;
  task_id: string;
  attempt_id: string;
  bucket: string;
  object_key: string;
  normalized_sha256: string;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  byte_count: number;
  transform_version: string;
};
function manifestOf(
  value: unknown,
  taskId: string,
  attemptId: string,
): Manifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (
    m.code !== "OK" || m.kind !== "upload" || m.state !== "prepared" ||
    typeof m.owner_id !== "string" || !uuid.test(m.owner_id) ||
    typeof m.asset_id !== "string" || !uuid.test(m.asset_id) ||
    m.task_id !== taskId || m.attempt_id !== attemptId ||
    m.bucket !== "verification-proof-assets-v1" ||
    m.object_key !== `${m.owner_id}/${m.asset_id}` ||
    typeof m.normalized_sha256 !== "string" ||
    !/^\\x[0-9a-f]{64}$/.test(m.normalized_sha256) ||
    (m.mime !== "image/jpeg" && m.mime !== "image/png") ||
    typeof m.byte_count !== "number" || !Number.isSafeInteger(m.byte_count) ||
    m.byte_count < 1 || m.byte_count > 10485760 ||
    typeof m.width !== "number" || typeof m.height !== "number" ||
    !Number.isSafeInteger(m.width) || !Number.isSafeInteger(m.height) ||
    m.width < 1 || m.height < 1 ||
    !(m.width >= m.height
      ? m.width <= 1920 && m.height <= 1080
      : m.width <= 1080 && m.height <= 1920) ||
    typeof m.transform_version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(m.transform_version)
  ) return null;
  return Object.freeze({
    owner_id: m.owner_id,
    asset_id: m.asset_id,
    task_id: taskId,
    attempt_id: attemptId,
    bucket: m.bucket,
    object_key: m.object_key,
    normalized_sha256: m.normalized_sha256,
    mime: m.mime,
    width: m.width,
    height: m.height,
    byte_count: m.byte_count,
    transform_version: m.transform_version,
  });
}
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(Error("unavailable"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    if (signal.aborted) throw Error("unavailable");
    return await Promise.race([work, stopped]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
async function readBody(
  response: Response,
  cap: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw Error("unavailable");
  let count = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw Error("unavailable");
    while (true) {
      const { done, value } = await bounded(reader.read(), signal);
      if (done) break;
      count += value.length;
      if (count > cap) throw Error("unavailable");
      chunks.push(new Uint8Array(value));
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } catch (e) {
    cancel();
    throw e;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
export function createPrivateProofPhotoReader(
  d: PrivateProofPhotoReaderDependencies,
): (request: Request) => Promise<Response> {
  const { enabled, authenticate, rpc, isRetentionAvailable, acquireCapacity } =
    d;
  const origin = privatePhotoStorageOrigin(d.projectUrl),
    storageHeaders = privatePhotoStorageHeaders(d.credential),
    fetcher = d.fetcher ?? fetch;
  return async (request) => {
    if (enabled !== true || typeof isRetentionAvailable !== "function") {
      return error(503, "closed");
    }
    if (request.method !== "GET") return error(405, "method_not_allowed");
    const url = new URL(request.url),
      query = url.searchParams,
      taskId = query.get("taskId") ?? "",
      attemptId = query.get("attemptId") ?? "";
    if (
      !uuid.test(taskId) || !uuid.test(attemptId) ||
      query.getAll("taskId").length !== 1 ||
      query.getAll("attemptId").length !== 1 ||
      [...query.keys()].some((k) => k !== "taskId" && k !== "attemptId")
    ) return error(400, "invalid_input");
    if (!origin || !storageHeaders) return error(503, "unavailable");
    const controller = new AbortController(), signal = controller.signal;
    const cancel = () => controller.abort();
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timer = setTimeout(cancel, 20000);
    let release: (() => void) | null = null;
    try {
      const actor = await bounded(authenticate(request), signal);
      if (!actor || !uuid.test(actor.actorId)) {
        return error(401, "unauthenticated");
      }
      const actorId = actor.actorId;
      const args = {
        p_actor: actorId,
        p_task_id: taskId,
        p_attempt_id: attemptId,
      };
      const first = await bounded(
        rpc("friend_proof_read_manifest_v1", args),
        signal,
      );
      const manifest = first.error
        ? null
        : manifestOf(first.data, taskId, attemptId);
      if (!manifest) return error(404, "not_found");
      if (
        await bounded(isRetentionAvailable(manifest, actorId), signal) !== true
      ) return error(404, "not_found");
      const capacity = acquireCapacity(actorId);
      capacity.then((late) => {
        if (signal.aborted) late?.();
      }).catch(() => {});
      release = await bounded(capacity, signal);
      if (!release) return error(503, "busy");
      const pending = fetcher(
        `${origin}/storage/v1/object/authenticated/verification-proof-assets-v1/${manifest.object_key}`,
        {
          method: "GET",
          headers: new Headers(storageHeaders),
          redirect: "manual",
          signal,
        },
      );
      pending.then((late) => {
        if (signal.aborted) void late.body?.cancel().catch(() => {});
      }).catch(() => {});
      const fetched = await bounded(pending, signal);
      if (
        fetched.status !== 200 ||
        fetched.headers.get("Content-Type")?.split(";", 1)[0].trim()
            .toLowerCase() !== manifest.mime
      ) {
        void fetched.body?.cancel().catch(() => {});
        return error(503, "unavailable");
      }
      const bytes = await readBody(fetched, manifest.byte_count, signal);
      if (
        bytes.length !== manifest.byte_count ||
        await bounded(photoSha256(bytes), signal) !==
          manifest.normalized_sha256.slice(2)
      ) return error(503, "unavailable");
      // Reauthenticate the same actor, then recheck exact attempt access and availability after I/O.
      const liveActor = await bounded(authenticate(request), signal);
      if (!liveActor || liveActor.actorId !== actorId) {
        return error(401, "unauthenticated");
      }
      const second = await bounded(
        rpc("friend_proof_read_manifest_v1", args),
        signal,
      );
      const current = second.error
        ? null
        : manifestOf(second.data, taskId, attemptId);
      if (!current || JSON.stringify(current) !== JSON.stringify(manifest)) {
        return error(404, "not_found");
      }
      if (
        await bounded(isRetentionAvailable(current, actorId), signal) !== true
      ) return error(404, "not_found");
      if (signal.aborted) return error(503, "unavailable");
      return new Response(new Uint8Array(bytes), {
        headers: {
          ...headers,
          "Content-Type": manifest.mime,
          "Content-Length": String(bytes.length),
        },
      });
    } catch {
      return error(503, "unavailable");
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", cancel);
      controller.abort();
      release?.();
    }
  };
}
