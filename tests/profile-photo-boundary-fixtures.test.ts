// Check generated image structure independently so a broken fixture cannot look like a Worker denial.
import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import decodeJpeg from '@jsquash/jpeg/decode.js'
import decodePng, { init as initPngDecoder } from '@jsquash/png/decode.js'
import { makeBoundaryFixtures } from '../scripts/profile-photo-boundary-fixtures.mjs'

const signature = [137, 80, 78, 71, 13, 10, 26, 10]
function uint32(bytes: Uint8Array, offset: number) { return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset) }
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (0xedb88320 & -(value & 1))
  }
  return (value ^ 0xffffffff) >>> 0
}
function parsePng(bytes: Uint8Array) {
  expect([...bytes.subarray(0, 8)]).toEqual(signature)
  const chunks: { name: string; data: Uint8Array }[] = []
  for (let offset = 8; offset < bytes.length;) {
    const length = uint32(bytes, offset)
    const name = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8))
    const end = offset + 8 + length
    expect(crc32(bytes.subarray(offset + 4, end))).toBe(uint32(bytes, end))
    chunks.push({ name, data: bytes.subarray(offset + 8, end) })
    offset = end + 4
    expect(offset).toBeLessThanOrEqual(bytes.length)
  }
  expect(chunks.at(-1)?.name).toBe('IEND')
  return chunks
}

describe('offline photo boundary corpus', () => {
  it('makes valid maximum-area PNG scanlines, including 16-bit depth and near-axis limit', async () => {
    const fixtures = await makeBoundaryFixtures()
    for (const [name, width, height, depth] of [
      ['png_rgba8_max', 2000, 2000, 8],
      ['png_rgba16_max', 2000, 2000, 16],
      ['png_rgba8_axis', 2048, 1953, 8],
    ] as const) {
      const fixture = fixtures.find(item => item.name === name)!
      expect(fixture).toMatchObject({ mime: 'image/png', expectedStatus: 200, width, height })
      const chunks = parsePng(fixture.bytes)
      const header = chunks[0]
      expect(header.name).toBe('IHDR')
      expect(uint32(header.data, 0)).toBe(width)
      expect(uint32(header.data, 4)).toBe(height)
      expect(header.data[8]).toBe(depth)
      expect(header.data[9]).toBe(6)
      const compressed = Buffer.concat(chunks.filter(chunk => chunk.name === 'IDAT').map(chunk => chunk.data))
      const rows = inflateSync(compressed)
      const stride = 1 + width * 4 * depth / 8
      expect(rows.length).toBe(stride * height)
      expect(rows[(height - 1) * stride]).toBe(0)
    }
  })

  it('places valid metadata padding exactly at and one byte beyond the body cap', async () => {
    const fixtures = await makeBoundaryFixtures()
    await initPngDecoder(new WebAssembly.Module(readFileSync(new URL('../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url))))
    for (const [name, length, status] of [
      ['png_exact_cap', 2_097_152, 200],
      ['png_over_cap', 2_097_153, 413],
    ] as const) {
      const fixture = fixtures.find(item => item.name === name)!
      expect(fixture.bytes.byteLength).toBe(length)
      expect(fixture.expectedStatus).toBe(status)
      const chunks = parsePng(fixture.bytes)
      expect(chunks.some(chunk => chunk.name === 'tEXt')).toBe(true)
      expect(inflateSync(Buffer.concat(chunks.filter(chunk => chunk.name === 'IDAT').map(chunk => chunk.data))).length).toBe(2000 * (1 + 2000 * 4))
      const decoded = await decodePng(fixture.bytes.buffer.slice(fixture.bytes.byteOffset, fixture.bytes.byteOffset + fixture.bytes.byteLength) as ArrayBuffer)
      expect([decoded.width, decoded.height]).toEqual([2000, 2000])
    }
  })

  it('makes a CRC-valid late bad filter and a valid recovery image', async () => {
    const fixtures = await makeBoundaryFixtures()
    const bad = fixtures.find(item => item.name === 'png_late_bad_filter')!
    expect(bad.expectedStatus).toBe(422)
    const chunks = parsePng(bad.bytes)
    const rows = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.name === 'IDAT').map(chunk => chunk.data)))
    expect(rows.length).toBe(2000 * 8001)
    expect(rows[1999 * 8001]).toBe(5)
    expect(fixtures.find(item => item.name === 'png_rgba8_max')?.expectedStatus).toBe(200)
  })

  it('generates decodable maximum-area baseline and progressive JPEG', async () => {
    const fixtures = await makeBoundaryFixtures()
    for (const [name, marker] of [['jpeg_baseline_max', 0xc0], ['jpeg_progressive_max', 0xc2]] as const) {
      const fixture = fixtures.find(item => item.name === name)!
      expect(fixture).toMatchObject({ mime: 'image/jpeg', expectedStatus: 200, width: 2000, height: 2000 })
      expect(fixture.bytes[0]).toBe(0xff)
      expect(fixture.bytes[1]).toBe(0xd8)
      expect(fixture.bytes.at(-2)).toBe(0xff)
      expect(fixture.bytes.at(-1)).toBe(0xd9)
      expect(fixture.bytes.includes(marker)).toBe(true)
      const decoded = await decodeJpeg(fixture.bytes.buffer.slice(fixture.bytes.byteOffset, fixture.bytes.byteOffset + fixture.bytes.byteLength) as ArrayBuffer)
      expect([decoded.width, decoded.height]).toEqual([2000, 2000])
    }
  })
})
