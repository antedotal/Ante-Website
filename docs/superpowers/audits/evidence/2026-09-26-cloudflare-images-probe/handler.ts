// Temporary operator-only fixture diagnostic. This module is not imported by any application route.
const MAX_BYTES = 10 * 1024 * 1024;
const DEADLINE_MS = 10_000;
const TOKEN_HEADER = "x-ante-images-probe-token";

// These are the exact generated inputs retained by the earlier Supabase CPU probe; all four are opaque.
const FIXTURES = [
  { name: "phone-noise.heic", mime: "image/heic", sha256: "b1d7ff650b34610d7476d08b139faae1073ff1733c328f65666567b6f32382aa", bytes: 6358037, width: 4032, height: 3024 },
  { name: "phone-noise.jpg", mime: "image/jpeg", sha256: "3889df89424cd5ae7f2b58e12ba681d205149ed5c17b57263d35ebbeee037dfd", bytes: 8685878, width: 4032, height: 3024 },
  { name: "phone-pattern.png", mime: "image/png", sha256: "16b156913f5aedc329a225b237808538e8df89b2b8c22db190cf4daf65caa2ea", bytes: 19491, width: 4032, height: 3024 },
  { name: "phone-portrait.png", mime: "image/png", sha256: "c11abcc21ba71071c968d635985cf3be6a5e88fd38bd9fbb50b5cc56a4e3f9c8", bytes: 20831, width: 3024, height: 4032 },
] as const;

interface ImageInfo { format: string; fileSize: number; width: number; height: number }
interface ImageOutput { response(): Response }
interface ImageInput { transform(options: { width: number; height: number; fit: "scale-down"; metadata: "none" }): { output(options: { format: "image/jpeg"; quality: 85; anim: false }): Promise<ImageOutput> | ImageOutput } }
export interface ImagesBinding { info(stream: ReadableStream<Uint8Array>): Promise<ImageInfo>; input(stream: ReadableStream<Uint8Array>): ImageInput }
export interface ProbeEnv {
  IMAGES: ImagesBinding;
  ANTE_IMAGES_PROBE_TOKEN?: string;
  ANTE_IMAGES_PROBE_EXPIRES_AT?: string;
}

class ProbeFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

// One response shape covers every result so browser and intermediary caches cannot retain receipts.
function json(status: number, value: Record<string, unknown>): Response {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

function error(status: number, code: string): Response { return json(status, { error: code }); }

// Hash the header values, then compare all digest bytes without an early mismatch exit.
async function authorized(request: Request, secret: string): Promise<boolean> {
  const supplied = request.headers.get(TOKEN_HEADER);
  if (!/^[a-f0-9]{64}$/i.test(secret) || !supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
  return difference === 0;
}

function hex(bytes: Uint8Array): string { return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(bytes: Uint8Array): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))); }

// Apply one wall deadline to body reading and every asynchronous Images step.
async function beforeDeadline<T>(work: Promise<T>, end: number): Promise<T> {
  const remaining = end - Date.now();
  if (remaining <= 0) throw new ProbeFailure(504, "deadline_exceeded");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProbeFailure(504, "deadline_exceeded")), remaining);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

// Read without trusting Content-Length, and cancel streams as soon as a bound is crossed.
async function boundedBytes(stream: ReadableStream<Uint8Array> | null, end: number, tooLargeStatus: number, tooLargeCode: string): Promise<Uint8Array> {
  if (!stream) throw new ProbeFailure(400, "empty_or_unreadable_body");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await beforeDeadline(reader.read(), end);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BYTES) throw new ProbeFailure(tooLargeStatus, tooLargeCode);
      chunks.push(part.value);
    }
  } catch (cause) {
    void reader.cancel().catch(() => undefined);
    throw cause;
  } finally { reader.releaseLock(); }
  if (total === 0) throw new ProbeFailure(400, "empty_or_unreadable_body");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

function validInfo(value: ImageInfo, expected: { bytes?: number; width: number; height: number }, formats: string[]): boolean {
  return Number.isSafeInteger(value.width) && Number.isSafeInteger(value.height) &&
    value.width === expected.width && value.height === expected.height &&
    Number.isSafeInteger(value.fileSize) && value.fileSize > 0 && value.fileSize <= MAX_BYTES &&
    (expected.bytes === undefined || value.fileSize === expected.bytes) &&
    formats.includes(value.format.toLowerCase());
}

// Admission, source inspection and output checks are sequential so unknown bytes never reach Images.
export async function handleProbe(request: Request, env: ProbeEnv): Promise<Response> {
  const end = Date.now() + DEADLINE_MS;
  const expiry = env.ANTE_IMAGES_PROBE_EXPIRES_AT;
  if (!expiry || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiry) || !Number.isFinite(Date.parse(expiry))) return error(503, "probe_unavailable");
  if (Date.now() >= Date.parse(expiry)) return error(410, "probe_expired");
  const secret = env.ANTE_IMAGES_PROBE_TOKEN;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return error(503, "probe_unavailable");
  if (!await authorized(request, secret)) return error(401, "unauthorized");
  if (request.method !== "POST") return error(405, "post_required");
  const url = new URL(request.url);
  if (url.pathname !== "/probe" || url.search) return error(400, "invalid_probe_url");
  const mime = request.headers.get("content-type")?.trim().toLowerCase();
  if (!FIXTURES.some(item => item.mime === mime) || request.headers.has("content-encoding")) return error(415, "unsupported_media_type");
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BYTES)) return error(413, "body_too_large");
  let bytes: Uint8Array;
  try { bytes = await boundedBytes(request.body, end, 413, "body_too_large"); }
  catch (cause) { return cause instanceof ProbeFailure ? error(cause.status, cause.code) : error(400, "empty_or_unreadable_body"); }
  try {
    const digest = await beforeDeadline(sha256(bytes), end);
    const fixture = FIXTURES.find(item => item.mime === mime && item.sha256 === digest && item.bytes === bytes.byteLength);
    if (!fixture) return error(422, "unknown_synthetic_fixture");
    const inputInfo = await beforeDeadline(env.IMAGES.info(stream(bytes)), end);
    if (!validInfo(inputInfo, fixture, fixture.mime === "image/heic" ? ["heic", "image/heic", "heif"] : [fixture.mime, fixture.mime.slice(6), fixture.mime === "image/jpeg" ? "jpg" : "png"])) return error(422, "fixture_info_mismatch");
    const landscape = fixture.width >= fixture.height;
    const result = await beforeDeadline(Promise.resolve(env.IMAGES.input(stream(bytes))
      .transform({ width: landscape ? 1920 : 1080, height: landscape ? 1080 : 1920, fit: "scale-down", metadata: "none" })
      .output({ format: "image/jpeg", quality: 85, anim: false })), end);
    const output = result.response();
    if (output.headers.get("content-type") !== "image/jpeg") return error(502, "images_unavailable");
    const encoded = await boundedBytes(output.body, end, 502, "output_too_large");
    const outputInfo = await beforeDeadline(env.IMAGES.info(stream(encoded)), end);
    if (!validInfo(outputInfo, { width: landscape ? 1440 : 1080, height: landscape ? 1080 : 1440 }, ["jpeg", "jpg", "image/jpeg"]) || outputInfo.fileSize !== encoded.byteLength) return error(502, "output_info_mismatch");
    const outputSha256 = await beforeDeadline(sha256(encoded), end);
    return json(200, { fixture: fixture.name, inputBytes: bytes.byteLength, inputSha256: digest, inputWidth: inputInfo.width, inputHeight: inputInfo.height, outputBytes: encoded.byteLength, outputSha256, outputWidth: outputInfo.width, outputHeight: outputInfo.height, outputFormat: "jpeg", wallMs: DEADLINE_MS - Math.max(0, end - Date.now()) });
  } catch (cause) {
    return cause instanceof ProbeFailure ? error(cause.status, cause.code) : error(502, "images_unavailable");
  }
}
