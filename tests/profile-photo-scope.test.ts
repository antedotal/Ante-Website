// Hold real upload streams and mocked image stages to prove one fail-fast processing scope excludes other work.
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const stages = vi.hoisted(() => ({ png: undefined as (() => Promise<void>) | undefined, decode: undefined as (() => Promise<void>) | undefined }))
vi.mock('../lib/server/profile-photo-png', () => ({ inspectPng: async () => { await stages.png?.(); return { width: 2, height: 2 } } }))
vi.mock('../lib/server/profile-photo-jpeg', () => ({ inspectJpeg: () => ({ width: 2, height: 2 }) }))
vi.mock('../lib/server/profile-photo-codecs', () => ({ fullyDecodeProfilePhoto: async () => { await stages.decode?.() } }))

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const jpeg = new Uint8Array([255, 216])
function gate() {
  let open!: () => void
  const promise = new Promise<void>(resolve => { open = resolve })
  return { promise, open }
}
function stream(mime = 'image/png') {
  let pulls = 0
  let cancellations = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(mime === 'image/png' ? png : jpeg); controller.close() },
    cancel() { cancellations++; return new Promise<void>(() => {}) },
  }, { highWaterMark: 0 })
  const request = new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': mime }, body, duplex: 'half' } as RequestInit)
  return { request, get pulls() { return pulls }, get cancellations() { return cancellations } }
}

describe('shared photo processing scope', () => {
  it('rejects a contender before reading and cancels without awaiting its producer', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = gate(); const release = gate()
    const firstBody = new ReadableStream<Uint8Array>({ async pull(controller) {
      entered.open(); await release.promise; controller.enqueue(png); controller.close()
    } }, { highWaterMark: 0 })
    const first = validateProfilePhoto(new Request('https://local.invalid/photo', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: firstBody, duplex: 'half' } as RequestInit))
    await entered.promise
    const contender = stream('image/jpeg')
    await expect(validateProfilePhoto(contender.request)).rejects.toMatchObject({ code: 'decoder_unavailable', status: 503 })
    expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
    release.open(); await first
    expect((await validateProfilePhoto(stream().request)).width).toBe(2)
  })

  it.each(['png', 'decode'] as const)('keeps capacity during %s and excludes another reader', async stage => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = gate(); const release = gate()
    stages[stage] = () => { entered.open(); return release.promise }
    try {
      const first = validateProfilePhoto(stream().request)
      await entered.promise
      const contender = stream('image/jpeg')
      await expect(validateProfilePhoto(contender.request)).rejects.toMatchObject({ status: 503 })
      expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
      release.open(); await first
      expect((await validateProfilePhoto(stream('image/jpeg').request)).height).toBe(2)
    } finally { release.open(); stages[stage] = undefined }
  })

  it('preserves cheap MIME, body, signal and length denials while occupied', async () => {
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = gate(); const release = gate()
    stages.decode = () => { entered.open(); return release.promise }
    try {
      const first = validateProfilePhoto(stream().request); await entered.promise
      const aborted = new AbortController(); aborted.abort()
      const cases: [Request, number][] = [
        [new Request('https://local.invalid', { method: 'PUT', headers: { 'content-type': 'image/gif' }, body: png }), 415],
        [new Request('https://local.invalid', { method: 'PUT', headers: { 'content-type': 'image/png' } }), 400],
        [new Request('https://local.invalid', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png, signal: aborted.signal }), 400],
        [new Request('https://local.invalid', { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': 'bad' }, body: png }), 400],
        [new Request('https://local.invalid', { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': '2097153' }, body: png }), 413],
      ]
      for (const [request, status] of cases) await expect(validateProfilePhoto(request)).rejects.toMatchObject({ status })
      release.open(); await first
    } finally { release.open(); stages.decode = undefined }
  })

  it('disallows repeated or escaped validators and holds early-return validation until settled', async () => {
    const { withProfilePhotoProcessing, validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = gate(); const release = gate(); const callbackFinished = gate()
    stages.decode = () => { entered.open(); return release.promise }
    try {
      let escaped!: (request: Request) => Promise<unknown>
      const callback = withProfilePhotoProcessing(validate => {
        const work = (async () => {
          escaped = validate
          const pending = validate(stream().request)
          void pending.catch(() => {})
          await entered.promise
          const repeated = stream()
          await expect(validate(repeated.request)).rejects.toMatchObject({ status: 503 })
          expect(repeated.pulls).toBe(0)
          return 'returned'
        })()
        void work.then(() => callbackFinished.open())
        return work
      })
      let settled = false; void callback.then(() => { settled = true })
      await callbackFinished.promise
      expect(settled).toBe(false)
      const contender = stream()
      await expect(validateProfilePhoto(contender.request)).rejects.toMatchObject({ status: 503 })
      expect([contender.pulls, contender.cancellations, settled]).toEqual([0, 1, false])
      release.open(); await expect(callback).resolves.toBe('returned')
      const stale = stream()
      await expect(escaped(stale.request)).rejects.toMatchObject({ status: 503 })
      expect(stale.pulls).toBe(0)
      expect((await validateProfilePhoto(stream().request)).width).toBe(2)
    } finally { release.open(); stages.decode = undefined }
  })

  it('drains rejected validation and preserves an earlier callback failure before releasing capacity', async () => {
    const { withProfilePhotoProcessing, validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = gate(); const release = gate()
    const callbackFailure = new Error('callback failed')
    stages.decode = () => { entered.open(); return release.promise.then(() => { throw new Error('decode failed') }) }
    try {
      const callback = withProfilePhotoProcessing(async validate => {
        void validate(stream().request).catch(() => {})
        await entered.promise
        throw callbackFailure
      })
      await entered.promise
      const contender = stream()
      await expect(validateProfilePhoto(contender.request)).rejects.toMatchObject({ status: 503 })
      expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
      release.open()
      await expect(callback).rejects.toBe(callbackFailure)
      stages.decode = undefined
      expect((await validateProfilePhoto(stream().request)).width).toBe(2)
    } finally { release.open(); stages.decode = undefined }
  })
})
