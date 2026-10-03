// Exercise the shared server transport with hostile provider fetches and streams.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedProviderRequest } from '../lib/server/bounded-provider-request'

vi.mock('server-only', () => ({}))

const url = 'https://provider.test/private'
const request = (maxBytes = 16384, options?: { signal?: AbortSignal; timeoutMs?: number }) =>
  boundedProviderRequest(url, { method: 'GET', redirect: 'error' }, maxBytes, options)

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('bounded provider request', () => {
  it('ends an abort-ignoring fetch at its deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const pending = request(16384, { timeoutMs: 5000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('uses the same deadline for a stalled body and does not await hostile cancellation', async () => {
    vi.useFakeTimers()
    let cancelled = 0
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull() {}, cancel() { cancelled++; return new Promise<void>(() => {}) },
    }))))
    const pending = request(16384, { timeoutMs: 5000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBeNull()
    expect(cancelled).toBe(1)
  })

  it('starts no fetch after parent abort and cancels a late response body', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn())
    expect(await request(16384, { signal: controller.signal })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    vi.useFakeTimers()
    let deliver!: (response: Response) => void
    let cancelled = 0
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { deliver = resolve })))
    const pending = request(16384, { timeoutMs: 5000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBeNull()
    deliver(new Response(new ReadableStream<Uint8Array>({
      pull() {}, cancel() { cancelled++; return new Promise<void>(() => {}) },
    })))
    await vi.waitFor(() => expect(cancelled).toBe(1))
  })

  it('accepts 16384 bytes but rejects 16385 bytes and mismatched declared lengths', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(16384))))
    expect((await request())?.bytes).toHaveLength(16384)
    expect(new Headers(vi.mocked(fetch).mock.lastCall![1]?.headers).get('accept-encoding')).toBe('identity')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(16385))))
    expect(await request()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-length': '2' } })))
    expect(await request()).toBeNull()
  })

  it('rejects redirects, partial replies, content ranges and compressed bodies', async () => {
    for (const reply of [
      new Response('', { status: 302, headers: { location: 'https://other.test/' } }),
      new Response('x', { status: 206 }),
      new Response('x', { headers: { 'content-range': 'bytes 0-0/1' } }),
      new Response('x', { headers: { 'content-encoding': 'gzip' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => reply))
      expect(await request()).toBeNull()
    }
  })

  it('copies each chunk before a producer reuses its buffer', async () => {
    const shared = new Uint8Array([1, 2])
    let pulls = 0
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (++pulls === 1) controller.enqueue(shared)
      else if (pulls === 2) { shared.set([3, 4]); controller.enqueue(shared) }
      else controller.close()
    } }, { highWaterMark: 0 }))))
    expect((await request())?.bytes).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('still validates replies if the runtime forbids setting Accept-Encoding', async () => {
    const NativeHeaders = Headers
    class RestrictedHeaders extends NativeHeaders {
      set(name: string, value: string): void {
        if (name.toLowerCase() === 'accept-encoding') throw new TypeError('restricted header')
        super.set(name, value)
      }
    }
    vi.stubGlobal('Headers', RestrictedHeaders)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]))))
    expect((await request())?.bytes).toEqual(new Uint8Array([1]))
  })

  it('ends continuously ready empty chunks at a monotonic deadline without timer dispatch', async () => {
    vi.useFakeTimers()
    let elapsed = 0
    let pulls = 0
    let cancelled = 0
    vi.stubGlobal('performance', { now: () => elapsed })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        elapsed += 1000
        pulls++
        // A finite ceiling keeps the red test bounded even when the implementation is wrong.
        if (pulls === 100) { controller.enqueue(new Uint8Array([1])); controller.close() }
        else controller.enqueue(new Uint8Array())
      },
      cancel() { cancelled++ },
    }, { highWaterMark: 0 }))))
    expect(await request(16384, { timeoutMs: 5000 })).toBeNull()
    expect(pulls).toBeLessThan(100)
    expect(cancelled).toBe(1)
  })

  it('denies the 33rd consecutive empty chunk when clock and timers do not advance', async () => {
    vi.useFakeTimers()
    let pulls = 0
    let cancelled = 0
    vi.stubGlobal('performance', { now: () => 0 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        // Finite red safety ceiling: the old loop eventually accepts this byte.
        if (pulls === 100) { controller.enqueue(new Uint8Array([9])); controller.close() }
        else controller.enqueue(new Uint8Array())
      },
      cancel() { cancelled++ },
    }, { highWaterMark: 0 }))))
    expect(await request(16384, { timeoutMs: 5000 })).toBeNull()
    expect(pulls).toBe(33)
    expect(cancelled).toBe(1)
  })

  it('resets the empty-chunk allowance after nonempty progress', async () => {
    vi.useFakeTimers()
    let pulls = 0
    vi.stubGlobal('performance', { now: () => 0 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 32 || pulls >= 34 && pulls <= 65) controller.enqueue(new Uint8Array())
        else if (pulls === 33) controller.enqueue(new Uint8Array([7]))
        else { controller.enqueue(new Uint8Array([8])); controller.close() }
      },
    }, { highWaterMark: 0 }))))
    expect((await request())?.bytes).toEqual(new Uint8Array([7, 8]))
    expect(pulls).toBe(66)
  })

  it('ignores finite empty chunks before real content without corrupting bytes', async () => {
    let pulls = 0
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 3) controller.enqueue(new Uint8Array())
        else { controller.enqueue(new Uint8Array([7, 8])); controller.close() }
      },
    }, { highWaterMark: 0 }))))
    expect((await request())?.bytes).toEqual(new Uint8Array([7, 8]))
  })

  it('rejects a bodyless success that arrives after the monotonic deadline', async () => {
    vi.useFakeTimers()
    let elapsed = 0
    let deliver!: (response: Response) => void
    vi.stubGlobal('performance', { now: () => elapsed })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { deliver = resolve })))
    const pending = request(16384, { timeoutMs: 5000 })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    elapsed = 5001
    deliver(new Response(null, { status: 204 }))
    expect(await pending).toBeNull()
  })
})
