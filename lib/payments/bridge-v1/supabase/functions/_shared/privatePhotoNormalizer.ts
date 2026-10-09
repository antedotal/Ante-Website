import {
  inspectPreparedProofPhoto,
  PROOF_PHOTO_MAX_BYTES,
  PROOF_PHOTO_PREPARATION_VERSION,
} from "../../../lib/proofPhotos/preparedProofPhoto.ts";
/** Closed service-private contract; this module exposes no HTTP route. */
export type PhotoPurpose = "profile" | "proof";
export const PHOTO_TRANSFORM_VERSION = "magick043-q8-srgb-j85-png-v1";
export type PhotoFailure =
  | "unsupported_input"
  | "corrupt_input"
  | "size_rejected"
  | "resource_rejected"
  | "unavailable"
  | "busy"
  | "expired_lease";
export interface CodecPhoto {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  outputFullyDecoded: true;
}
export interface PhotoCodecLease {
  normalize(
    bytes: Uint8Array,
    options: { purpose: PhotoPurpose; signal?: AbortSignal },
  ): Promise<({ status: "ok" } & CodecPhoto) | { status: PhotoFailure }>;
  release(): void;
}
export interface PhotoCodec {
  acquire(): PhotoCodecLease | null;
}
export interface NormalizedPrivatePhoto {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  byteCount: number;
  sha256: string;
  inputSha256: string;
  transformVersion: string;
}
export interface NormalizePrivatePhotoInput {
  stream: ReadableStream<Uint8Array>;
  purpose: PhotoPurpose;
  codec: PhotoCodec;
  bindInput: (digest: string, transformVersion: string) => Promise<boolean>;
  signal?: AbortSignal;
}
export function fitPhotoDimensions(
  width: number,
  height: number,
  orientation = 1,
): { width: number; height: number } {
  if (
    ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
    !Number.isInteger(orientation) || orientation < 1 || orientation > 8
  ) throw Error("invalid geometry");
  if (orientation >= 5) [width, height] = [height, width];
  const scale = Math.min(
    1,
    (width >= height ? 1920 : 1080) / width,
    (width >= height ? 1080 : 1920) / height,
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function photoByteLimit(purpose: PhotoPurpose): number {
  return purpose === "profile" ? 2097152 : PROOF_PHOTO_MAX_BYTES;
}
export type PhotoFormat = "jpeg" | "png" | "webp" | "heif";
/** Format selection comes from bytes, never a caller Content-Type or filename. */
export function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (
    bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 &&
    bytes[2] === 255
  ) return "jpeg";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  ) return "png";
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 16 && ascii(4, 8) === "ftyp") {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      .getUint32(0);
    if (size >= 16 && size <= Math.min(bytes.length, 256)) {
      for (let i = 8; i + 4 <= size; i += 4) {
        if (
          i !== 12 &&
          ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
            ascii(i, i + 4),
          )
        ) return "heif";
      }
    }
  }
  return null;
}
export async function photoSha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}

async function intake(
  stream: ReadableStream<Uint8Array>,
  cap: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const pieces: Uint8Array[] = [];
  let length = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 15000);
  try {
    if (signal?.aborted) stop();
    while (!stopped) {
      const { done, value } = await reader.read();
      if (stopped) throw Error("unavailable");
      if (done) break;
      if (!(value instanceof Uint8Array)) throw Error("corrupt_input");
      length += value.byteLength;
      if (length > cap) throw Error("size_rejected");
      pieces.push(new Uint8Array(value));
    }
    if (stopped) throw Error("unavailable");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const piece of pieces) {
      bytes.set(piece, offset);
      offset += piece.length;
    }
    return bytes;
  } catch (e) {
    stop();
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    reader.releaseLock();
    for (const piece of pieces) piece.fill(0);
  }
}

async function bindBounded(
  bind: () => Promise<boolean>,
  signal?: AbortSignal,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(Error("unavailable"));
    timer = setTimeout(abort, 10000);
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    if (signal?.aborted) throw Error("unavailable");
    return await Promise.race([bind(), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Completed-operation replay consumes only bounded ephemeral source bytes, without decoding. */
export async function readPrivatePhotoInputDigest(
  stream: ReadableStream<Uint8Array>,
  purpose: PhotoPurpose,
  signal?: AbortSignal,
): Promise<string> {
  const source = await intake(stream, photoByteLimit(purpose), signal);
  try {
    const format = photoFormat(source);
    if (
      !format || !["jpeg", "png"].includes(format)
    ) throw Error("unsupported_input");
    if (purpose === "proof") inspectPreparedProofPhoto(source);
    return await photoSha256(source);
  } finally {
    source.fill(0);
  }
}

export async function normalizePrivatePhoto(
  input: NormalizePrivatePhotoInput,
): Promise<
  { status: "ok"; artifact: NormalizedPrivatePhoto } | { status: PhotoFailure }
> {
  if (
    !input || !["profile", "proof"].includes(input.purpose) ||
    !(input.stream instanceof ReadableStream) ||
    typeof input.bindInput !== "function"
  ) return { status: "unavailable" };
  const { stream, purpose, codec, bindInput, signal } = input;
  let lease: PhotoCodecLease | null = null;
  let source: Uint8Array | undefined;
  try {
    lease = codec.acquire();
    if (!lease) return { status: "busy" };
    source = await intake(stream, photoByteLimit(purpose), signal);
    const format = photoFormat(source);
    if (
      !format || !["jpeg", "png"].includes(format)
    ) return { status: "unsupported_input" };
    const transformVersion = purpose === "proof"
      ? PROOF_PHOTO_PREPARATION_VERSION
      : PHOTO_TRANSFORM_VERSION;
    const inputSha256 = await photoSha256(source);
    if (signal?.aborted) return { status: "unavailable" };
    if (
      await bindBounded(
        () => bindInput(inputSha256, transformVersion),
        signal,
      ) !== true
    ) return { status: "expired_lease" };
    if (signal?.aborted) return { status: "unavailable" };
    let prepared: ReturnType<typeof inspectPreparedProofPhoto> | undefined;
    if (purpose === "proof") {
      try {
        prepared = inspectPreparedProofPhoto(source);
      } catch (e) {
        return {
          status: e instanceof Error && e.message === "size_rejected"
            ? "size_rejected"
            : "corrupt_input",
        };
      }
    }
    const output = await lease.normalize(source, {
      purpose: purpose,
      signal: signal,
    });
    if (output.status !== "ok") {
      return {
        status: [
            "unsupported_input",
            "corrupt_input",
            "size_rejected",
            "resource_rejected",
            "unavailable",
            "busy",
            "expired_lease",
          ].includes(output.status)
          ? output.status
          : "unavailable",
      };
    }
    if (signal?.aborted) return { status: "unavailable" };
    if (
      !(output.bytes instanceof Uint8Array) || !output.outputFullyDecoded ||
      !["image/jpeg", "image/png"].includes(output.mime) ||
      ![output.width, output.height].every((v) =>
        Number.isSafeInteger(v) && v > 0
      )
    ) return { status: "corrupt_input" };
    const bounds = fitPhotoDimensions(output.width, output.height);
    if (bounds.width !== output.width || bounds.height !== output.height) {
      return { status: "corrupt_input" };
    }
    if (
      output.bytes.length < 1 || output.bytes.length > photoByteLimit(purpose)
    ) return { status: "size_rejected" };
    if (
      prepared && (
        output.mime !== prepared.mime || output.width !== prepared.width ||
        output.height !== prepared.height ||
        output.bytes.length !== source.length ||
        output.bytes.some((byte, index) => byte !== source![index]) ||
        await photoSha256(source) !== inputSha256
      )
    ) return { status: "corrupt_input" };
    const bytes = new Uint8Array(prepared ? source : output.bytes);
    return {
      status: "ok",
      artifact: {
        bytes,
        mime: output.mime,
        width: output.width,
        height: output.height,
        byteCount: bytes.length,
        sha256: await photoSha256(bytes),
        inputSha256,
        transformVersion,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return {
      status: message === "size_rejected"
        ? "size_rejected"
        : message === "corrupt_input"
        ? "corrupt_input"
        : "unavailable",
    };
  } finally {
    source?.fill(0);
    lease?.release();
  }
}
