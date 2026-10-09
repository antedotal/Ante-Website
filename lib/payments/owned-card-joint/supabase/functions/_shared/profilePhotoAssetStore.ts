/** Server-only transport for a prepared, already-normalized profile artifact. */
export interface PreparedProfilePhotoRecord {
  code: string;
  kind: string;
  state: string;
  owner_id: string;
  asset_id: string;
  object_key: string;
  normalized_sha256: string; // PostgreSQL JSON bytea: \\x followed by 64 hex digits.
  mime: string;
  width: number;
  height: number;
  byte_count: number;
  transform_version: string;
}

export interface StorePreparedProfilePhotoInput {
  prepared: PreparedProfilePhotoRecord;
  bytes: Uint8Array;
  projectUrl: string;
  credential: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export type ProfilePhotoStoreResult = {
  status: "verified" | "conflict" | "invalid_input" | "unavailable";
};

const MAX_OUTPUT = 2_097_152;
const MAX_REPLY = 16_384;
const REQUEST_MS = 10_000;
const TOTAL_MS = 20_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BYTEA = /^\\x[0-9a-fA-F]{64}$/;

type Manifest = {
  key: string;
  mime: "image/jpeg" | "image/png";
  byteCount: number;
  hash: string;
};

function manifestOf(value: unknown): Manifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<PreparedProfilePhotoRecord>;
  if (
    record.code !== "OK" || record.kind !== "upload" ||
    record.state !== "prepared" ||
    typeof record.owner_id !== "string" || !UUID.test(record.owner_id) ||
    typeof record.asset_id !== "string" || !UUID.test(record.asset_id) ||
    typeof record.object_key !== "string" ||
    record.object_key !== `${record.owner_id}/${record.asset_id}` ||
    (record.mime !== "image/jpeg" && record.mime !== "image/png") ||
    typeof record.byte_count !== "number" ||
    !Number.isInteger(record.byte_count) || record.byte_count < 1 ||
    record.byte_count > MAX_OUTPUT ||
    typeof record.width !== "number" || !Number.isInteger(record.width) ||
    typeof record.height !== "number" || !Number.isInteger(record.height) ||
    record.width < 1 || record.height < 1 ||
    !((record.width <= 1920 && record.height <= 1080) ||
      (record.width <= 1080 && record.height <= 1920)) ||
    typeof record.transform_version !== "string" ||
    !VERSION.test(record.transform_version) ||
    typeof record.normalized_sha256 !== "string" ||
    !BYTEA.test(record.normalized_sha256)
  ) return null;
  return {
    key: record.object_key,
    mime: record.mime,
    byteCount: record.byte_count,
    hash: record.normalized_sha256.slice(2).toLowerCase(),
  };
}

function headersFor(credential: unknown): Headers | null {
  if (typeof credential !== "string") return null;
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(credential)) {
    return new Headers({ apikey: credential });
  }
  const parts = credential.split(".");
  if (
    parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  ) return null;
  try {
    const decode = (part: string) =>
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header?.alg !== "HS256" || claims?.role !== "service_role") return null;
    return new Headers({
      apikey: credential,
      Authorization: `Bearer ${credential}`,
    });
  } catch {
    return null;
  }
}

function originOf(projectUrl: unknown): string | null {
  if (typeof projectUrl !== "string") return null;
  try {
    const url = new URL(projectUrl);
    if (
      url.protocol !== "https:" || !url.hostname || url.username ||
      url.password ||
      url.pathname !== "/" || url.search || url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isDuplicate(body: Uint8Array): boolean {
  const text = new TextDecoder().decode(body).trim();
  if (text === "Asset Already Exists") return true;
  try {
    const error = JSON.parse(text);
    return error !== null && typeof error === "object" &&
      (error.error === "Duplicate" || error.code === "AssetAlreadyExists");
  } catch {
    return false;
  }
}

function hex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256(data: Uint8Array): Promise<string> {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(data)),
    ),
  );
}

async function readBounded(
  response: Response,
  cap: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const pieces: Uint8Array[] = [];
  let total = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error("aborted");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new Error("oversize");
      pieces.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const piece of pieces) {
      result.set(piece, offset);
      offset += piece.byteLength;
    }
    return result;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

type RequestOutcome<T> = { status: number | null; value: T | null };

async function requestBounded<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  cap: number,
  deadline: number,
  callerSignal: AbortSignal | undefined,
  inspect: (response: Response, body: Uint8Array) => T | Promise<T>,
  onHeaders?: (response: Response) => T | undefined,
): Promise<RequestOutcome<T>> {
  const remaining = Math.min(REQUEST_MS, deadline - Date.now());
  if (remaining <= 0 || callerSignal?.aborted) {
    return { status: null, value: null };
  }
  const controller = new AbortController();
  let response: Response | undefined;
  let expired = false;
  let rejectAbort: ((reason: Error) => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const stop = () => {
    controller.abort();
    rejectAbort?.(new Error("request stopped"));
  };
  callerSignal?.addEventListener("abort", stop, { once: true });
  const timeout = setTimeout(stop, remaining);
  const operation = (async () => {
    const pending = fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: "manual",
    });
    pending.then((late) => {
      if (expired) void late.body?.cancel().catch(() => {});
    }).catch(() => {});
    response = await pending;
    const immediate = onHeaders?.(response);
    if (immediate !== undefined) {
      void response.body?.cancel().catch(() => {});
      return immediate;
    }
    const body = await readBounded(response, cap, controller.signal);
    return await inspect(response, body);
  })();
  try {
    const value = await Promise.race([operation, stopped]);
    return { status: response?.status ?? null, value };
  } catch {
    expired = true;
    controller.abort();
    if (response) void response.body?.cancel().catch(() => {});
    return { status: response?.status ?? null, value: null };
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", stop);
  }
}

/** Verification is transport proof only; the caller owns auth, normalization, lease and publication. */
export async function storePreparedProfilePhoto(
  input: StorePreparedProfilePhotoInput,
): Promise<ProfilePhotoStoreResult> {
  if (!input || typeof input !== "object") return { status: "invalid_input" };
  // Snapshot both mutable inputs before the first await.
  const manifest = manifestOf(input.prepared);
  const bytes = input.bytes instanceof Uint8Array
    ? new Uint8Array(input.bytes)
    : null;
  const origin = originOf(input.projectUrl);
  const baseHeaders = headersFor(input.credential);
  if (
    !manifest || !bytes || !origin || !baseHeaders ||
    (input.signal !== undefined && !(input.signal instanceof AbortSignal)) ||
    (input.fetcher !== undefined && typeof input.fetcher !== "function") ||
    bytes.byteLength !== manifest.byteCount
  ) return { status: "invalid_input" };
  if (input.signal?.aborted) return { status: "unavailable" };
  if (await sha256(bytes) !== manifest.hash) return { status: "invalid_input" };

  const fetcher = input.fetcher ?? fetch;
  const deadline = Date.now() + TOTAL_MS;
  const path = `/storage/v1/object/profile-photos/${manifest.key}`;
  const uploadHeaders = new Headers(baseHeaders);
  uploadHeaders.set("content-type", manifest.mime);
  uploadHeaders.set("cache-control", "private, no-store");
  uploadHeaders.set("x-upsert", "false");
  const upload = await requestBounded(
    fetcher,
    `${origin}${path}`,
    { method: "POST", headers: uploadHeaders, body: bytes },
    MAX_REPLY,
    deadline,
    input.signal,
    (response, body) => ({
      status: response.status,
      collision: response.status === 409 ||
        (response.status === 400 && isDuplicate(body)),
    }),
    (response) =>
      response.status === 400 ||
        (response.status >= 200 && response.status < 300)
        ? undefined
        : { status: response.status, collision: response.status === 409 },
  );
  if (
    upload.status !== null &&
    !((upload.status >= 200 && upload.status < 300) ||
      upload.status === 409 || upload.status >= 500 ||
      (upload.status === 400 && upload.value?.collision))
  ) {
    return { status: "unavailable" };
  }

  const downloadHeaders = new Headers(baseHeaders);
  downloadHeaders.set("cache-control", "no-store");
  const readback = await requestBounded(
    fetcher,
    `${origin}/storage/v1/object/authenticated/profile-photos/${manifest.key}`,
    { method: "GET", headers: downloadHeaders },
    MAX_OUTPUT,
    deadline,
    input.signal,
    (response, body) => ({
      status: response.status,
      mime: response.headers.get("content-type"),
      body,
    }),
    (response) =>
      response.status === 200
        ? undefined
        : { status: response.status, mime: null, body: new Uint8Array() },
  );
  if (!readback.value || readback.status !== 200) {
    return { status: "unavailable" };
  }
  if (
    readback.value.mime?.split(";", 1)[0].trim().toLowerCase() !==
      manifest.mime ||
    readback.value.body.byteLength !== manifest.byteCount ||
    await sha256(readback.value.body) !== manifest.hash
  ) return { status: "conflict" };
  return { status: "verified" };
}
