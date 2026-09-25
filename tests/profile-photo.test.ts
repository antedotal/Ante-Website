// These tests exercise the public validation contract with real pinned decoders and synthetic image bytes.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

vi.mock('server-only', () => ({}))
const codecEnv = vi.hoisted(() => ({ PROFILE_PNG_WASM: undefined as WebAssembly.Module | undefined, PROFILE_JPEG_WASM: undefined as WebAssembly.Module | undefined, contextAvailable: true }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => {
  if (!codecEnv.contextAvailable) throw new Error('Missing Worker request context')
  return { env: codecEnv }
} }))

const png = new Uint8Array(readFileSync(new URL('./fixtures/red-2x2.png', import.meta.url)))
const jpeg = new Uint8Array(readFileSync(new URL('./fixtures/red-2x2.jpg', import.meta.url)))
const progressiveJpeg = new Uint8Array(readFileSync(new URL('./fixtures/red-2x2-progressive.jpg', import.meta.url)))
const widePng = new Uint8Array(readFileSync(new URL('./fixtures/red-2048x2.png', import.meta.url)))
const wideJpeg = new Uint8Array(readFileSync(new URL('./fixtures/red-2048x2.jpg', import.meta.url)))

function upload(bytes: Uint8Array, mime = 'image/png', headers: Record<string, string> = {}) {
  return new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': mime, ...headers }, body: bytes.slice() })
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let index = 0; index < 8; index++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function withPngDimensions(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const copy = bytes.slice()
  new DataView(copy.buffer).setUint32(16, width)
  new DataView(copy.buffer).setUint32(20, height)
  new DataView(copy.buffer).setUint32(29, crc32(copy.subarray(12, 29)))
  return copy
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name)
  const bytes = new Uint8Array(12 + data.length)
  new DataView(bytes.buffer).setUint32(0, data.length)
  bytes.set(nameBytes, 4)
  bytes.set(data, 8)
  new DataView(bytes.buffer).setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)))
  return bytes
}

function pngFromChunks(chunks: Uint8Array[]): Uint8Array {
  return new Uint8Array([...png.subarray(0, 8), ...chunks.flatMap(chunk => [...chunk])])
}

function originalPngChunks(): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let offset = 8; offset < png.length;) {
    const end = offset + 12 + new DataView(png.buffer).getUint32(offset)
    chunks.push(png.subarray(offset, end))
    offset = end
  }
  return chunks
}

// Preserve the JPEG frame and EOI but truncate its entropy stream to exercise a warning-tolerant decoder.
function prematureJpegScan(bytes: Uint8Array): Uint8Array {
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]
    const length = bytes[offset + 2] * 256 + bytes[offset + 3]
    if (marker === 0xda) return new Uint8Array([...bytes.subarray(0, offset + 2 + length + 1), 0xff, 0xd9])
    offset += 2 + length
  }
  throw new Error('Synthetic JPEG fixture has no scan')
}

function streamedRequest(mime: string, headers: Record<string, string>, onCancel: () => void, signal?: AbortSignal): Request {
  const body = new ReadableStream<Uint8Array>({ pull() {}, cancel() { onCancel(); return new Promise(() => {}) } })
  return new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': mime, ...headers }, body, signal, duplex: 'half' } as RequestInit)
}

describe('validateProfilePhoto', () => {
  beforeAll(async () => {
    codecEnv.PROFILE_PNG_WASM = await WebAssembly.compile(readFileSync(new URL('../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url)))
    codecEnv.PROFILE_JPEG_WASM = await WebAssembly.compile(readFileSync(new URL('../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url)))
  })

  it('returns original validated bytes and decoded dimensions for PNG and JPEG', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    for (const [bytes, mime] of [[png, 'image/png'], [jpeg, 'image/jpeg']] as const) {
      const result = await validateProfilePhoto(upload(bytes, mime))
      expect(result).toEqual({ bytes, contentType: mime, width: 2, height: 2 })
    }
  })

  it('denies invalid input, MIME mismatch and advertised oversize with fixed status', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    await expect(validateProfilePhoto(upload(new Uint8Array()))).rejects.toMatchObject({ status: 400 })
    await expect(validateProfilePhoto(upload(png, 'image/gif'))).rejects.toMatchObject({ status: 415 })
    await expect(validateProfilePhoto(upload(png, 'image/jpeg'))).rejects.toMatchObject({ status: 422 })
    await expect(validateProfilePhoto(upload(png, 'image/png', { 'content-length': '2097153' }))).rejects.toMatchObject({ status: 413 })
  })

  it('rejects actual chunked oversize before buffering the next byte', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      pulls++
      controller.enqueue(new Uint8Array(pulls === 1 ? 2097152 : 1))
    } }, { highWaterMark: 0 })
    const request = new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': 'image/png' }, body, duplex: 'half' } as RequestInit)
    await expect(validateProfilePhoto(request)).rejects.toMatchObject({ status: 413 })
    expect(pulls).toBe(2)
  })

  it('keeps bytes stable when a streamed producer reuses its previous chunk buffer', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const reused = png.slice(0, 8)
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (++pulls === 1) controller.enqueue(reused)
      else { reused.fill(0); controller.enqueue(png.subarray(8)); controller.close() }
    } }, { highWaterMark: 0 })
    const request = new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': 'image/png' }, body, duplex: 'half' } as RequestInit)
    expect((await validateProfilePhoto(request)).bytes).toEqual(png)
  })

  it('rejects bad CRC, malformed compressed data, trailing content and excessive dimensions', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const badCrc = png.slice(); badCrc[badCrc.length - 5] ^= 1
    const badIdat = png.slice()
    const idatType = badIdat.findIndex((_, index) => String.fromCharCode(...badIdat.subarray(index, index + 4)) === 'IDAT')
    const idatLength = new DataView(badIdat.buffer).getUint32(idatType - 4)
    badIdat[idatType + 6] ^= 1
    // Recompute the IDAT CRC so the codec must reject invalid compressed bytes.
    new DataView(badIdat.buffer).setUint32(idatType + 4 + idatLength, crc32(badIdat.subarray(idatType, idatType + 4 + idatLength)))
    for (const bytes of [badCrc, badIdat, new Uint8Array([...png, 0]), withPngDimensions(png, 2049, 1), withPngDimensions(png, 2048, 2048)]) {
      await expect(validateProfilePhoto(upload(bytes))).rejects.toMatchObject({ status: 422 })
    }
  })

  it('rejects truncated, appended and multi-frame JPEG then decodes another image in the same isolate', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    for (const bytes of [jpeg.slice(0, -2), new Uint8Array([...jpeg, 0]), new Uint8Array([...jpeg, ...jpeg])]) {
      await expect(validateProfilePhoto(upload(bytes, 'image/jpeg'))).rejects.toMatchObject({ status: 422 })
    }
    expect((await validateProfilePhoto(upload(jpeg, 'image/jpeg'))).width).toBe(2)
  })

  it('rejects a premature JPEG scan retaining EOI without emitting decoder messages, then recovers', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const emitted = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(validateProfilePhoto(upload(prematureJpegScan(wideJpeg), 'image/jpeg'))).rejects.toMatchObject({ status: 422, code: 'invalid_image' })
      expect(emitted).not.toHaveBeenCalled()
      expect((await validateProfilePhoto(upload(jpeg, 'image/jpeg'))).width).toBe(2)
    } finally { emitted.mockRestore() }
  })

  it('accepts progressive JPEG and exact axis boundary in both formats', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    expect((await validateProfilePhoto(upload(progressiveJpeg, 'image/jpeg'))).height).toBe(2)
    expect((await validateProfilePhoto(upload(widePng))).width).toBe(2048)
    expect((await validateProfilePhoto(upload(wideJpeg, 'image/jpeg'))).width).toBe(2048)
  })

  it('rejects malformed PNG chunk ordering, animation, interlace and decompression overflow', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const [ihdr, phys, idat, iend] = originalPngChunks()
    const interlacedHeader = ihdr.slice(); interlacedHeader[20] = 1
    new DataView(interlacedHeader.buffer).setUint32(21, crc32(interlacedHeader.subarray(4, 21)))
    const overlongIdat = idat.slice(); new DataView(overlongIdat.buffer).setUint32(0, 0x7fffffff)
    const badFilter = pngChunk('IDAT', deflateSync(new Uint8Array([5, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0])))
    const bomb = pngChunk('IDAT', deflateSync(new Uint8Array(100_000)))
    const cases = [
      pngFromChunks([interlacedHeader, idat, iend]),
      pngFromChunks([ihdr, pngChunk('acTL', new Uint8Array(8)), idat, iend]),
      pngFromChunks([ihdr, pngChunk('ABCD', new Uint8Array()), idat, iend]),
      pngFromChunks([ihdr, idat, phys, idat, iend]),
      pngFromChunks([ihdr, overlongIdat, iend]),
      pngFromChunks([ihdr, badFilter, iend]),
      pngFromChunks([ihdr, bomb, iend]),
    ]
    for (const [index, bytes] of cases.entries()) {
      await expect(validateProfilePhoto(upload(bytes))).rejects.toMatchObject({ status: index < 3 ? 415 : 422 })
    }
  })

  it('accepts a legal empty IDAT adjacent to a valid compressed IDAT', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const [ihdr, , idat, iend] = originalPngChunks()
    const bytes = pngFromChunks([ihdr, idat, pngChunk('IDAT', new Uint8Array()), iend])
    expect((await validateProfilePhoto(upload(bytes))).bytes).toEqual(bytes)
  })

  it('cancels bodies on MIME, declared-length and already-aborted early denials without waiting', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const controller = new AbortController()
    const cases: [Request, number, { value: number }][] = []
    for (const [mime, headers, signal, status] of [
      ['image/gif', {}, undefined, 415],
      ['image/png', { 'content-length': 'not-a-number' }, undefined, 400],
      ['image/png', { 'content-length': '2097153' }, undefined, 413],
      ['image/png', {}, controller.signal, 400],
    ] as const) {
      const counter = { value: 0 }
      cases.push([streamedRequest(mime, headers, () => counter.value++, signal), status, counter])
    }
    controller.abort()
    for (const [request, status, counter] of cases) {
      await expect(validateProfilePhoto(request)).rejects.toMatchObject({ status })
      expect(counter.value).toBe(1)
    }
  })

  it('times out an inert body and does not await its never-settling cancellation', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    vi.useFakeTimers()
    try {
      const body = new ReadableStream<Uint8Array>({ pull() {}, cancel: () => new Promise(() => {}) })
      const request = new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': 'image/png' }, body, duplex: 'half' } as RequestInit)
      const rejection = expect(validateProfilePhoto(request)).rejects.toMatchObject({ status: 408 })
      await vi.advanceTimersByTimeAsync(10_000)
      await rejection
    } finally { vi.useRealTimers() }
  })

  it('fails closed if a statically loaded codec is unavailable', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const original = codecEnv.PROFILE_PNG_WASM
    codecEnv.PROFILE_PNG_WASM = undefined
    try { await expect(validateProfilePhoto(upload(png))).rejects.toMatchObject({ status: 503 }) }
    finally { codecEnv.PROFILE_PNG_WASM = original }
  })

  it('reports decoder unavailability if the Worker request context is missing', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    codecEnv.contextAvailable = false
    try { await expect(validateProfilePhoto(upload(png))).rejects.toMatchObject({ status: 503 }) }
    finally { codecEnv.contextAvailable = true }
  })
})
