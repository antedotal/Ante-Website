/** Closed originating profile upload/clear factory. No HTTP index or activation. */
import {
  normalizePrivatePhoto,
  type PhotoCodec,
  readPrivatePhotoInputDigest,
} from "./privatePhotoNormalizer.ts";
import {
  type PreparedPrivatePhotoRecord,
  storePreparedPrivatePhoto,
} from "./privatePhotoAssetStore.ts";
export interface ConfiguredProfilePhotoPublicationDependencies {
  enabled?: boolean;
  projectUrl: string;
  credential: string; /** Capture live caller identity/session on the server. */
  authenticate(
    request: Request,
  ): Promise<
    { ownerId: string } | null
  >; /** Trusted distributed admission; count one operation only once, including retries. */
  admit(
    ownerId: string,
    operationId: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean>;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
  codec: PhotoCodec;
  fetcher?: typeof fetch;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (status: number, error: string) =>
  new Response(
    JSON.stringify({
      error,
      ...(status === 503 ? { retry: "retry_same_operation" } : {}),
    }),
    { status, headers },
  );
function receipt(
  value: unknown,
  revision: number,
): Record<string, unknown> | null {
  if (
    !record(value) || value.code !== "OK" ||
    typeof value.asset_id !== "string" || !uuid.test(value.asset_id) ||
    value.revision !== revision + 1 ||
    (value.mime !== "image/jpeg" && value.mime !== "image/png") ||
    typeof value.byte_count !== "number" ||
    !Number.isSafeInteger(value.byte_count) || value.byte_count < 1 ||
    value.byte_count > 2097152 || typeof value.width !== "number" ||
    typeof value.height !== "number" || !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) || value.width < 1 ||
    value.height < 1 ||
    !(value.width >= value.height
      ? value.width <= 1920 && value.height <= 1080
      : value.width <= 1080 && value.height <= 1920) ||
    typeof value.transform_version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.transform_version)
  ) return null;
  return {
    assetId: value.asset_id,
    purpose: "profile",
    contentType: value.mime,
    width: value.width,
    height: value.height,
    bytes: value.byte_count,
    transformVersion: value.transform_version,
    profileRevision: value.revision,
  };
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
export function createConfiguredProfilePhotoPublicationHandler(
  d: ConfiguredProfilePhotoPublicationDependencies,
): (request: Request) => Promise<Response> {
  const {
    enabled,
    authenticate,
    admit,
    rpc,
    codec,
    projectUrl,
    credential,
    fetcher,
  } = d;
  return async (request) => {
    if (enabled !== true) return reply(503, "closed");
    if (request.method !== "POST" && request.method !== "DELETE") {
      return reply(405, "method_not_allowed");
    }
    const operationId = request.headers.get("X-Operation-Id") ?? "",
      text = request.headers.get("X-Expected-Profile-Revision") ?? "",
      revision = Number(text);
    if (
      !uuid.test(operationId) || !/^\d+$/.test(text) ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      revision >= Number.MAX_SAFE_INTEGER ||
      (request.method === "POST" && !request.body) ||
      (request.method === "DELETE" && request.body)
    ) return reply(400, "invalid_input");
    const controller = new AbortController(),
      signal = controller.signal,
      cancel = () => controller.abort();
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timer = setTimeout(cancel, 60000);
    let replayLease: ReturnType<PhotoCodec["acquire"]> = null;
    try {
      const actor = await bounded(authenticate(request), signal);
      if (!actor || !uuid.test(actor.ownerId)) {
        return reply(401, "unauthenticated");
      }
      const ownerId = actor.ownerId,
        base = { p_owner: ownerId, p_operation_id: operationId };
      if (request.method === "DELETE") {
        if (!await bounded(admit(ownerId, operationId, 10, 60000), signal)) {
          return reply(429, "rate_limited");
        }
        const cleared = await bounded(
          rpc("clear_profile_photo_v1", {
            ...base,
            p_expected_revision: revision,
          }),
          signal,
        );
        if (cleared.error) return reply(503, "uncertain");
        if (!record(cleared.data) || cleared.data.code !== "OK") {
          return reply(409, "state_conflict");
        }
        if (
          cleared.data.revision !== revision + 1 ||
          cleared.data.current_asset_id !== null
        ) return reply(503, "uncertain");
        return new Response(
          JSON.stringify({
            purpose: "profile",
            profileRevision: cleared.data.revision,
            cleared: true,
          }),
          { headers },
        );
      }
      const reserved = await bounded(
        rpc("reserve_profile_photo_v1", {
          ...base,
          p_expected_revision: revision,
        }),
        signal,
      );
      if (reserved.error || !record(reserved.data)) {
        return reply(503, "uncertain");
      }
      const r = reserved.data;
      if (r.code === "BUSY") return reply(409, "busy_retry_same_operation");
      if (!["OK", "REPLAY_REQUIRED"].includes(String(r.code))) {
        return reply(409, "state_conflict");
      }
      if (
        r.owner_id !== ownerId || r.operation_id !== operationId ||
        r.expected_revision !== revision || r.kind !== "upload" ||
        typeof r.asset_id !== "string" || !uuid.test(r.asset_id) ||
        r.object_key !== `${ownerId}/${r.asset_id}`
      ) return reply(503, "uncertain");
      if (r.code === "REPLAY_REQUIRED") {
        replayLease = codec.acquire();
        if (!replayLease) return reply(503, "busy");
        const digest = await readPrivatePhotoInputDigest(
          request.body!,
          "profile",
          signal,
        );
        const replay = await bounded(
          rpc("replay_profile_photo_v1", {
            ...base,
            p_input_sha256: "\\x" + digest,
          }),
          signal,
        );
        if (replay.error) return reply(503, "uncertain");
        if (!record(replay.data) || replay.data.code !== "OK") {
          return reply(409, "idempotency_conflict");
        }
        const result = receipt(replay.data, revision);
        return result
          ? new Response(JSON.stringify(result), { headers })
          : reply(503, "uncertain");
      }
      if (!await bounded(admit(ownerId, operationId, 10, 60000), signal)) {
        return reply(429, "rate_limited");
      }
      if (
        !["reserved", "prepared"].includes(String(r.state)) ||
        typeof r.lease_epoch !== "number" ||
        !Number.isSafeInteger(r.lease_epoch) || r.lease_epoch < 1 ||
        typeof r.lease_until !== "string" ||
        !Number.isFinite(Date.parse(r.lease_until))
      ) return reply(503, "uncertain");
      const fenced = { ...base, p_lease_epoch: r.lease_epoch };
      const bindInput = async (digest: string, version: string) => {
        const bound = await bounded(
          rpc("bind_profile_photo_input_v1", {
            ...fenced,
            p_input_sha256: "\\x" + digest,
            p_transform_version: version,
          }),
          signal,
        );
        return !bound.error && record(bound.data) && bound.data.code === "OK";
      };
      const normalized = await normalizePrivatePhoto({
        stream: request.body!,
        purpose: "profile",
        codec,
        bindInput,
        signal,
      });
      if (normalized.status !== "ok") {
        return reply(
          normalized.status === "expired_lease"
            ? 409
            : normalized.status === "size_rejected"
            ? 413
            : normalized.status === "busy" ||
                normalized.status === "unavailable"
            ? 503
            : 422,
          normalized.status,
        );
      }
      const a = normalized.artifact;
      const prepared = await bounded(
        rpc("prepare_profile_photo_v1", {
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
      if (prepared.error) return reply(503, "uncertain");
      if (!record(prepared.data) || prepared.data.code !== "OK") {
        return reply(409, "state_conflict");
      }
      const p = prepared.data;
      if (
        p.owner_id !== ownerId || p.operation_id !== operationId ||
        p.asset_id !== r.asset_id || p.object_key !== r.object_key ||
        p.lease_epoch !== r.lease_epoch ||
        p.input_sha256 !== "\\x" + a.inputSha256 ||
        p.normalized_sha256 !== "\\x" + a.sha256 || p.mime !== a.mime ||
        p.width !== a.width || p.height !== a.height ||
        p.byte_count !== a.byteCount ||
        p.transform_version !== a.transformVersion
      ) return reply(503, "uncertain");
      const stored = await storePreparedPrivatePhoto({
        purpose: "profile",
        prepared: p as unknown as PreparedPrivatePhotoRecord,
        bytes: a.bytes,
        projectUrl,
        credential,
        fetcher,
        signal,
        isLeaseCurrent: () => bindInput(a.inputSha256, a.transformVersion),
      });
      if (stored.status !== "verified") {
        return reply(
          stored.status === "conflict" || stored.status === "expired_lease"
            ? 409
            : 503,
          "storage_unverified",
        );
      }
      const liveActor = await bounded(authenticate(request), signal);
      if (!liveActor || liveActor.ownerId !== ownerId) {
        return reply(401, "unauthenticated");
      }
      const published = await bounded(
        rpc("publish_profile_photo_v1", fenced),
        signal,
      );
      if (published.error) return reply(503, "uncertain");
      if (!record(published.data) || published.data.code !== "OK") {
        return reply(409, "state_conflict");
      }
      if (
        published.data.asset_id !== r.asset_id ||
        published.data.object_key !== r.object_key ||
        published.data.normalized_sha256 !== "\\x" + a.sha256 ||
        published.data.input_sha256 !== "\\x" + a.inputSha256 ||
        published.data.mime !== a.mime || published.data.width !== a.width ||
        published.data.height !== a.height ||
        published.data.byte_count !== a.byteCount ||
        published.data.transform_version !== a.transformVersion
      ) return reply(503, "uncertain");
      const result = receipt(published.data, revision);
      return result
        ? new Response(JSON.stringify(result), { headers })
        : reply(503, "uncertain");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return message === "size_rejected"
        ? reply(413, "size_rejected")
        : message === "unsupported_input"
        ? reply(422, "unsupported_input")
        : reply(503, "uncertain");
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", cancel);
      controller.abort();
      replayLease?.release();
    }
  };
}
