// Produce deterministic, offline PNG/JPEG inputs for the temporary local Worker probe.
import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import encodeJpeg, { init as initJpegEncoder } from '@jsquash/jpeg/encode.js'
import decodeJpeg, { init as initJpegDecoder } from '@jsquash/jpeg/decode.js'

const cap = 2_097_152
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

// Load only the installed, pinned codec modules from disk; Node cannot fetch package-relative WASM URLs.
let codecReady
function prepareJpegCodecs() {
  codecReady ??= Promise.all([
    initJpegEncoder(new WebAssembly.Module(readFileSync(new URL('../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url)))),
    initJpegDecoder(new WebAssembly.Module(readFileSync(new URL('../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url)))),
  ])
  return codecReady
}

// PNG's CRC covers each chunk's type and data, including intentionally malformed scanlines.
function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (0xedb88320 & -(value & 1))
  }
  return (value ^ 0xffffffff) >>> 0
}

// Allocate once per chunk; array spreading can overflow the call stack on cap-sized metadata.
function chunk(name, data) {
  const output = new Uint8Array(data.length + 12)
  const view = new DataView(output.buffer)
  view.setUint32(0, data.length)
  output.set(new TextEncoder().encode(name), 4)
  output.set(data, 8)
  view.setUint32(output.length - 4, crc32(output.subarray(4, output.length - 4)))
  return output
}

// Join complete PNG chunks without materializing millions of JavaScript number values.
function assemble(parts) {
  const length = signature.length + parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(length)
  output.set(signature)
  let offset = signature.length
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

// Fixed, mostly flat rows make large decoded surfaces while keeping every body below the byte cap.
function pngParts(width, height, depth, badLastFilter = false) {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = depth
  header[9] = 6 // RGBA
  const stride = 1 + width * 4 * depth / 8
  const rows = new Uint8Array(stride * height)
  for (let row = 0; row < height; row++) {
    const start = row * stride
    rows[start] = row === height - 1 && badLastFilter ? 5 : 0
    // Sparse, deterministic stripes avoid a zero-only image without introducing random entropy.
    rows[start + 1] = row % 251
    rows[start + stride - 1] = (row * 7) % 251
  }
  return [chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 6 })), chunk('IEND', new Uint8Array())]
}

// Insert one uncompressed, permitted tEXt chunk before IDAT to hit the wire-size cap exactly.
function paddedPng(parts, targetLength) {
  const unpaddedLength = 8 + parts.reduce((sum, part) => sum + part.length, 0)
  let remaining = targetLength - unpaddedLength
  const metadataChunks = []
  while (remaining) {
    if (remaining < 16) throw new Error('PNG leaves no room for valid tEXt metadata')
    const textLength = Math.min(60_000, remaining - 16)
    const metadata = new Uint8Array(4 + textLength)
    metadata.fill(65) // Printable ISO-8859-1 text; NUL is permitted only as the keyword separator.
    metadata.set([112, 97, 100, 0]) // "pad" keyword and its required separator.
    const piece = chunk('tEXt', metadata)
    metadataChunks.push(piece)
    remaining -= piece.length
  }
  return assemble([parts[0], ...metadataChunks, ...parts.slice(1)])
}

// The pinned MozJPEG encoder supports both SOF0 baseline and SOF2 progressive output.
async function jpegFixture(progressive) {
  await prepareJpegCodecs()
  const width = 2000
  const height = 2000
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4
      data[offset] = row % 251
      data[offset + 1] = column % 251
      data[offset + 2] = (row + column) % 251
      data[offset + 3] = 255
    }
  }
  const bytes = new Uint8Array(await encodeJpeg({ data, width, height }, { quality: 65, baseline: !progressive, progressive }))
  if (bytes.length > cap) throw new Error(`Generated JPEG exceeds ${cap} bytes`)
  const decoded = await decodeJpeg(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  if (decoded.width !== width || decoded.height !== height) throw new Error('Generated JPEG failed independent decode')
  return { name: progressive ? 'jpeg_progressive_max' : 'jpeg_baseline_max', bytes, mime: 'image/jpeg', expectedStatus: 200, width, height }
}

// Return a fresh, named corpus; the runner records hashes and never logs image contents.
export async function makeBoundaryFixtures() {
  const rgba8 = pngParts(2000, 2000, 8)
  const rgba16 = pngParts(2000, 2000, 16)
  const axis = pngParts(2048, 1953, 8)
  const lateFilter = pngParts(2000, 2000, 8, true)
  const png = (name, parts, width, height, expectedStatus = 200) => ({ name, bytes: assemble(parts), mime: 'image/png', expectedStatus, width, height })
  const fixtures = [
    png('png_rgba8_max', rgba8, 2000, 2000),
    png('png_rgba16_max', rgba16, 2000, 2000),
    png('png_rgba8_axis', axis, 2048, 1953),
    { name: 'png_exact_cap', bytes: paddedPng(rgba8, cap), mime: 'image/png', expectedStatus: 200, width: 2000, height: 2000 },
    { name: 'png_over_cap', bytes: paddedPng(rgba8, cap + 1), mime: 'image/png', expectedStatus: 413, width: 2000, height: 2000 },
    png('png_late_bad_filter', lateFilter, 2000, 2000, 422),
    await jpegFixture(false),
    await jpegFixture(true),
  ]
  for (const fixture of fixtures) if (fixture.expectedStatus === 200 && fixture.bytes.length > cap) throw new Error(`${fixture.name} exceeds byte cap`)
  return fixtures
}
