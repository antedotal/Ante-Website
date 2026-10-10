/** Structural/privacy policy shared by phone preparation and server intake.
 * This does not decode pixels; server publication must additionally fully decode.
 */
export const PROOF_PHOTO_PREPARATION_VERSION = "phone-prepared-proof-v1";
export const PROOF_PHOTO_MAX_BYTES = 10485760;
export interface PreparedProofPhotoInspection {
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  byteCount: number;
}
const corrupt = (): never => {
  throw new Error("corrupt_input");
};
function dimensions(width: number, height: number) {
  const landscape = width >= height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > (landscape ? 1920 : 1080) ||
    height > (landscape ? 1080 : 1920)
  ) {
    throw new Error("size_rejected");
  }
}
const u16 = (b: Uint8Array, p: number) => b[p] * 256 + b[p + 1];
const u32 = (b: Uint8Array, p: number) =>
  b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
interface Parsed {
  mime: PreparedProofPhotoInspection["mime"];
  width: number;
  height: number;
  parts: Uint8Array[];
}
function jpeg(bytes: Uint8Array, strip: boolean): Parsed {
  const parts = [bytes.subarray(0, 2)];
  let p = 2,
    width = 0,
    height = 0,
    frame = false,
    scan = false;
  while (p < bytes.length) {
    const start = p;
    if (bytes[p++] !== 255) corrupt();
    while (bytes[p] === 255) p++;
    const marker = bytes[p++];
    if (marker === 217) {
      if (!frame || !scan || p !== bytes.length) corrupt();
      parts.push(bytes.subarray(start, p));
      return { mime: "image/jpeg", width, height, parts };
    }
    if (
      !marker ||
      marker === 216 ||
      marker === 1 ||
      (marker >= 208 && marker <= 215) ||
      p + 2 > bytes.length
    )
      corrupt();
    const length = u16(bytes, p),
      end = p + length;
    if (length < 2 || end > bytes.length) corrupt();
    const metadata = (marker >= 224 && marker <= 239) || marker === 254;
    if (metadata && !strip) corrupt();
    if ([192, 193, 194].includes(marker)) {
      if (frame || length < 11 || bytes[p + 2] !== 8) corrupt();
      const components = bytes[p + 7];
      if (![1, 3].includes(components) || length !== 8 + 3 * components)
        corrupt();
      height = u16(bytes, p + 3);
      width = u16(bytes, p + 5);
      dimensions(width, height);
      frame = true;
    } else if (marker === 218) {
      if (!frame || length < 8 || length !== 6 + 2 * bytes[p + 2]) corrupt();
      scan = true;
    } else if (!metadata && ![196, 219, 221].includes(marker)) corrupt();
    if (!metadata) parts.push(bytes.subarray(start, end));
    p = end;
    if (marker === 218) {
      const entropyStart = p;
      while (p < bytes.length) {
        if (bytes[p] !== 255) {
          p++;
          continue;
        }
        let next = p + 1;
        while (bytes[next] === 255) next++;
        if (bytes[next] === 0 || (bytes[next] >= 208 && bytes[next] <= 215)) {
          p = next + 1;
          continue;
        }
        break;
      }
      if (p === entropyStart || p >= bytes.length) corrupt();
      parts.push(bytes.subarray(entropyStart, p));
    }
  }
  return corrupt();
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  crcTable[n] = c;
}
function crc(bytes: Uint8Array, start: number, end: number) {
  let value = 0xffffffff;
  for (let p = start; p < end; p++)
    value = (value >>> 8) ^ crcTable[(value ^ bytes[p]) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function png(bytes: Uint8Array, strip: boolean): Parsed {
  let p = 8,
    width = 0,
    height = 0,
    color = -1,
    depth = 0;
  let header = false,
    palette = false,
    transparency = false,
    data = false,
    endedData = false;
  const parts = [bytes.subarray(0, 8)];
  while (p + 12 <= bytes.length) {
    const length = u32(bytes, p),
      end = p + 12 + length;
    if (end > bytes.length) corrupt();
    const type = String.fromCharCode(
      bytes[p + 4],
      bytes[p + 5],
      bytes[p + 6],
      bytes[p + 7],
    );
    if (
      !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) ||
      crc(bytes, p + 4, end - 4) !== u32(bytes, end - 4)
    )
      corrupt();
    if (!header && type !== "IHDR") corrupt();
    if (["acTL", "fcTL", "fdAT"].includes(type)) corrupt();
    const kept = ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type);
    if (!kept && (type[0] === type[0].toUpperCase() || !strip)) corrupt();
    if (data && type !== "IDAT") endedData = true;
    if (type === "IHDR") {
      if (header || length !== 13) corrupt();
      width = u32(bytes, p + 8);
      height = u32(bytes, p + 12);
      dimensions(width, height);
      depth = bytes[p + 16];
      color = bytes[p + 17];
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !validDepths[color]?.includes(depth) ||
        bytes[p + 18] !== 0 ||
        bytes[p + 19] !== 0 ||
        bytes[p + 20] > 1
      )
        corrupt();
      header = true;
    } else if (type === "PLTE") {
      if (
        palette ||
        transparency ||
        data ||
        [0, 4].includes(color) ||
        length < 3 ||
        length > 768 ||
        length % 3 ||
        (color === 3 && length / 3 > 2 ** depth)
      )
        corrupt();
      palette = true;
    } else if (type === "tRNS") {
      if (
        transparency ||
        data ||
        [4, 6].includes(color) ||
        (color === 0 && length !== 2) ||
        (color === 2 && length !== 6) ||
        (color === 3 && (!palette || length < 1 || length > 256))
      )
        corrupt();
      transparency = true;
    } else if (type === "IDAT") {
      if (endedData || (color === 3 && !palette)) corrupt();
      data = true;
    } else if (type === "IEND") {
      if (!data || length !== 0 || end !== bytes.length) corrupt();
      parts.push(bytes.subarray(p, end));
      return { mime: "image/png", width, height, parts };
    }
    if (kept) parts.push(bytes.subarray(p, end));
    p = end;
  }
  return corrupt();
}
function parse(bytes: Uint8Array, strip: boolean): Parsed {
  if (bytes.byteLength > PROOF_PHOTO_MAX_BYTES)
    throw new Error("size_rejected");
  if (bytes[0] === 255 && bytes[1] === 216) return jpeg(bytes, strip);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return png(bytes, strip);
  throw new Error("unsupported_input");
}
export function inspectPreparedProofPhoto(
  bytes: Uint8Array,
): PreparedProofPhotoInspection {
  const { mime, width, height } = parse(bytes, false);
  return { mime, width, height, byteCount: bytes.byteLength };
}
/** Whitelist only compressed pixel/container essentials. Reject malformed input
 * before dropping metadata; always allocate fresh output, even for a clean file. */
export function stripProofPhotoMetadata(bytes: Uint8Array): Uint8Array {
  const { parts } = parse(bytes, true);
  const clean = new Uint8Array(
    parts.reduce((n, part) => n + part.byteLength, 0),
  );
  let p = 0;
  for (const part of parts) {
    clean.set(part, p);
    p += part.byteLength;
  }
  inspectPreparedProofPhoto(clean);
  return clean;
}
