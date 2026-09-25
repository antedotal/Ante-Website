// PNG preflight validates framing and checksums before the package decoder, which ignores PNG CRCs.
import { ProfilePhotoError } from './profile-photo-error'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const SAFE_ANCILLARY = new Set(['gAMA', 'cHRM', 'sRGB', 'pHYs', 'tIME', 'sBIT', 'bKGD', 'tEXt', 'eXIf', 'hIST', 'sPLT', 'iTXt'])
const MAX_CHUNKS = 4096

function invalid(): never { throw new ProfilePhotoError('invalid_image', 422) }
function unsupported(): never { throw new ProfilePhotoError('unsupported_format', 415) }

function uint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff
  for (let index = start; index < end; index++) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

export type ImageDimensions = { width: number; height: number }

export async function inspectPng(bytes: Uint8Array): Promise<ImageDimensions> {
  if (bytes.length < 8 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) invalid()
  let offset = 8
  let chunks = 0
  let width = 0
  let height = 0
  let depth = 0
  let color = 0
  let paletteEntries = 0
  let seenPalette = false
  let seenTransparency = false
  let seenData = false
  let afterData = false
  let ended = false
  const compressed: Uint8Array[] = []

  while (offset < bytes.length) {
    if (++chunks > MAX_CHUNKS || bytes.length - offset < 12) invalid()
    const length = uint32(bytes, offset)
    if (length > bytes.length - offset - 12) invalid()
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const name = String.fromCharCode(...bytes.subarray(typeStart, typeStart + 4))
    if (!/^[A-Za-z]{4}$/.test(name) || name[2] !== name[2].toUpperCase()) invalid()
    if (crc32(bytes, typeStart, dataEnd) !== uint32(bytes, dataEnd)) invalid()
    if (chunks === 1 && name !== 'IHDR') invalid()
    if (name !== 'IDAT' && seenData) afterData = true

    if (name === 'IHDR') {
      if (chunks !== 1 || length !== 13) invalid()
      width = uint32(bytes, dataStart)
      height = uint32(bytes, dataStart + 4)
      depth = bytes[dataStart + 8]
      color = bytes[dataStart + 9]
      if (width < 1 || height < 1 || width > 2048 || height > 2048 || width * height > 4_000_000) invalid()
      const allowedDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
      if (!allowedDepths[color]?.includes(depth) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0) invalid()
      if (bytes[dataStart + 12] !== 0) unsupported() // Adam7 needs separate resource acceptance.
    } else if (name === 'PLTE') {
      if (seenPalette || seenData || color === 0 || color === 4 || length === 0 || length % 3 || length > 768) invalid()
      paletteEntries = length / 3
      if (color === 3 && paletteEntries > 1 << depth) invalid()
      seenPalette = true
    } else if (name === 'tRNS') {
      if (seenTransparency || seenData || color === 4 || color === 6) invalid()
      if (color === 3 && (!seenPalette || length === 0 || length > paletteEntries)) invalid()
      if (color === 0 && length !== 2 || color === 2 && length !== 6) invalid()
      seenTransparency = true
    } else if (name === 'IDAT') {
      if (afterData || color === 3 && !seenPalette || length === 0) invalid()
      seenData = true
      compressed.push(bytes.subarray(dataStart, dataEnd))
    } else if (name === 'IEND') {
      if (!seenData || length !== 0 || dataEnd + 4 !== bytes.length) invalid()
      ended = true
    } else if (['acTL', 'fcTL', 'fdAT'].includes(name)) {
      unsupported() // Animated PNG is outside the accepted still-image profile.
    } else if (['iCCP', 'zTXt'].includes(name) || name === 'iTXt' && bytes.subarray(dataStart, dataEnd).includes(1)) {
      unsupported() // Compressed metadata has an independent inflation path.
    } else if (!SAFE_ANCILLARY.has(name)) {
      // Critical unknown chunks change the image meaning; unfamiliar ancillary chunks are excluded too.
      unsupported()
    }
    offset = dataEnd + 4
    if (ended) break
  }
  if (!ended || offset !== bytes.length) invalid()

  // The expected scanline size bounds zlib output before the image codec sees IDAT data.
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const expected = height * (1 + Math.ceil(width * channels[color] * depth / 8))
  const totalCompressed = compressed.reduce((sum, chunk) => sum + chunk.length, 0)
  const packed = new Uint8Array(totalCompressed)
  let copied = 0
  for (const chunk of compressed) { packed.set(chunk, copied); copied += chunk.length }
  let inflated = 0
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
    while (true) {
      const result = await reader.read()
      if (result.done) break
      inflated += result.value.length
      if (inflated > expected) invalid()
    }
    if (inflated !== expected) invalid()
  } catch { invalid() }
  finally { if (reader) void reader.cancel().catch(() => {}) }
  return { width, height }
}
