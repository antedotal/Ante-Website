// Exercise generation reads and dormant fixed-key helpers with controlled provider replies.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const owner = '00000000-0000-4000-8000-000000000001'
const asset = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
const object = `profile-photos/${owner}/avatar`
const origin = 'https://yxilmwxptfnebnjsikwo.supabase.co'
const secret = 'sb_secret_test_service_key'
const caller = 'caller.jwt.token'
const photo = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const, width: 1, height: 1 }
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const missing = { statusCode: '404', code: 'NoSuchKey', error: 'not_found', message: 'Object not found' }

// Keep the resolver transport real while replacing only the external provider.
function readFetch(storage: () => Response | Promise<Response>, resolved: unknown = { kind: 'legacy' }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
    String(url).includes('/rest/v1/rpc/resolve_profile_photo_v1') ? reply(resolved) : storage()))
}

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.SUPABASE_SECRET_KEY = secret
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.stubGlobal('fetch', vi.fn(async () => reply({ Key: object, Id: 'object-id' })))
})

describe('profile photo provider adapter', () => {
  it('rejects an encoded or lying-length storage reply before publishing bytes', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    for (const headers of [
      { 'content-type': 'image/png', 'content-encoding': 'gzip' },
      { 'content-type': 'image/png', 'content-length': '2' },
    ] as Record<string, string>[]) {
      readFetch(() => new Response(new Uint8Array([1]), { headers }))
      expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
    }
  })

  it('resolves a current generation with the exact caller token and downloads only its derived key', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    delete process.env.SUPABASE_SECRET_KEY
    readFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }), { kind: 'current', asset_id: asset })
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'found', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' })
    expect(fetch).toHaveBeenCalledTimes(2)
    const [resolverUrl, resolverInit] = vi.mocked(fetch).mock.calls[0]
    expect(resolverUrl).toBe(`${origin}/rest/v1/rpc/resolve_profile_photo_v1`)
    expect(resolverInit).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: JSON.stringify({ p_owner: owner }) })
    expect(new Headers(resolverInit?.headers).get('authorization')).toBe(`Bearer ${caller}`)
    expect(new Headers(resolverInit?.headers).get('apikey')).toBe('sb_publishable_testvalue')
    const [storageUrl, storageInit] = vi.mocked(fetch).mock.calls[1]
    expect(storageUrl).toBe(`${origin}/storage/v1/object/authenticated/profile-photos/${owner}/${asset}`)
    expect(new Headers(storageInit?.headers).get('authorization')).toBe(`Bearer ${caller}`)
    expect(new Headers(storageInit?.headers).get('apikey')).toBe('sb_publishable_testvalue')
  })

  it('stops at exact not_found and rejects ambiguous resolver replies without Storage or fallback', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    for (const [resolved, expected] of [
      [{ kind: 'not_found' }, 'not_found'], [{ kind: 'legacy', asset_id: asset }, 'unavailable'],
      [{ kind: 'current' }, 'unavailable'], [{ kind: 'current', asset_id: asset, key: 'x' }, 'unavailable'],
      [{ kind: 'current', asset_id: asset.toUpperCase() }, 'unavailable'],
      [{ kind: 'unknown' }, 'unavailable'], [null, 'unavailable'],
      [{ kind: 'legacy', key: `${owner}/avatar` }, 'unavailable'],
    ] as const) {
      readFetch(() => { throw new Error('Storage must not be called') }, resolved)
      expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: expected })
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('stops on resolver redirects, oversized JSON and hung bodies within one ten-second call', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    for (const response of [reply({ kind: 'legacy' }, 302), reply({ kind: 'legacy', pad: 'x'.repeat(16384) }),
      new Response('{broken', { headers: { 'content-type': 'application/json' } }),
      new Response(JSON.stringify({ kind: 'legacy' }), { headers: { 'content-type': 'text/plain' } }),
      reply({ kind: 'legacy' }, 201)]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
    }
    let cancelled = 0
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ pull() {}, cancel() { cancelled++ } }), { headers: { 'content-type': 'application/json' } })))
      const pending = downloadProfilePhoto(owner, caller)
      await vi.advanceTimersByTimeAsync(10000)
      expect(await pending).toEqual({ kind: 'unavailable' })
      expect(cancelled).toBe(1)
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('does not re-resolve or fall back after Storage denies a selected generation', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    readFetch(() => reply(missing, 400), { kind: 'current', asset_id: asset })
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'not_found' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('derives the one fixed key from a lowercase UUID and rejects malformed identifiers before I/O', async () => {
    const store = await import('../lib/server/profile-photo-store')
    expect(store.profilePhotoKey(owner)).toBe(`${owner}/avatar`)
    for (const invalid of ['abcdefab-cdef-4abc-8abc-abcdefabcdef'.toUpperCase(), '../avatar', `${owner}/other`, '']) {
      expect(store.profilePhotoKey(invalid)).toBeNull()
      expect(await store.putProfilePhoto(invalid, photo)).toEqual({ kind: 'unavailable' })
      expect(await store.downloadProfilePhoto(invalid, caller)).toEqual({ kind: 'unavailable' })
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts bytes to the fixed object path using only the privileged apikey', async () => {
    const { putProfilePhoto } = await import('../lib/server/profile-photo-store')
    expect(await putProfilePhoto(owner, photo)).toEqual({ kind: 'ok' })
    const [url, init] = vi.mocked(fetch).mock.lastCall!
    expect(url).toBe(`${origin}/storage/v1/object/${object}`)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' })
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(photo.bytes)
    const headers = new Headers(init?.headers)
    expect(headers.get('apikey')).toBe(secret)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-upsert')).toBe('true')
    expect(headers.get('content-type')).toBe('image/png')
    expect(headers.get('cache-control')).toBe('max-age=0')
  })

  it('accepts 2xx uploads only with the complete expected key and optional valid Id', async () => {
    const { putProfilePhoto } = await import('../lib/server/profile-photo-store')
    vi.stubGlobal('fetch', vi.fn(async () => reply({ Key: object, extra: true }, 201)))
    expect(await putProfilePhoto(owner, photo)).toEqual({ kind: 'ok' })
    for (const body of [{ Key: `${object}x` }, { Id: '' }, { Key: object, Id: 12 }, []]) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(body)))
      expect(await putProfilePhoto(owner, photo)).toEqual({ kind: 'unavailable' })
    }
  })

  it('accepts exact single DELETE success or the pinned missing-object reply without retry', async () => {
    const { deleteProfilePhoto } = await import('../lib/server/profile-photo-store')
    for (const response of [reply({ message: 'Successfully deleted' }), reply(missing, 400)]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await deleteProfilePhoto(owner)).toEqual({ kind: 'ok' })
      expect(fetch).toHaveBeenCalledTimes(1)
      const [url, init] = vi.mocked(fetch).mock.lastCall!
      expect(url).toBe(`${origin}/storage/v1/object/${object}`)
      expect(init?.method).toBe('DELETE')
    }
    for (const response of [reply({}, 200), reply({}, 400), reply({ ...missing, statusCode: 404 }, 400), reply({ ...missing, code: 'AccessDenied' }, 400), reply(missing, 404)]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await deleteProfilePhoto(owner)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('reads with the public apikey and exact caller bearer, and returns original bytes', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    readFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', etag: 'private' } }))
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'found', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' })
    const [url, init] = vi.mocked(fetch).mock.lastCall!
    expect(url).toBe(`${origin}/storage/v1/object/authenticated/${object}`)
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error' })
    const headers = new Headers(init?.headers)
    expect(headers.get('apikey')).toBe('sb_publishable_testvalue')
    expect(headers.get('authorization')).toBe(`Bearer ${caller}`)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('range')).toBeNull()
  })

  it('maps only known Storage read denials to not_found', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    for (const [code, statusCode] of [['NoSuchKey', '404'], ['NoSuchBucket', '404'], ['AccessDenied', '403']]) {
      readFetch(() => reply({ statusCode, code, error: 'not_found', message: 'untrusted' }, 400))
      expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'not_found' })
    }
    for (const response of [reply({}, 400), reply({ statusCode: 404, code: 'NoSuchKey' }, 400), reply({ statusCode: '404', code: 'Other' }, 400), reply({ statusCode: '404', code: 'NoSuchKey' }, 403)]) {
      readFetch(() => response)
      expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
    }
  })

  it('checks the owner profile through public REST with exact caller bearer', async () => {
    const { photoOwnerProfile } = await import('../lib/server/profile-photo-store')
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ id: owner }])))
    expect(await photoOwnerProfile(owner, caller)).toEqual({ kind: 'exists' })
    const [url, init] = vi.mocked(fetch).mock.lastCall!
    expect(url).toBe(`${origin}/rest/v1/profiles?select=id&id=eq.${owner}&limit=2`)
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_testvalue')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${caller}`)
    for (const [rows, kind] of [[[], 'missing'], [[{ id: owner }, { id: owner }], 'unavailable'], [[{ id: 'other' }], 'unavailable'], [[{ id: owner, private: true }], 'unavailable']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(rows)))
      expect(await photoOwnerProfile(owner, caller)).toEqual({ kind })
    }
  })

  it('rejects unsafe inputs and invalid response bodies without leaking or retrying', async () => {
    const store = await import('../lib/server/profile-photo-store')
    for (const token of ['', 'Bearer x', 'bad\nheader', secret]) {
      expect(await store.downloadProfilePhoto(owner, token)).toEqual({ kind: 'unavailable' })
      expect(await store.photoOwnerProfile(owner, token)).toEqual({ kind: 'unavailable' })
    }
    expect(await store.downloadProfilePhoto(owner, null as unknown as string)).toEqual({ kind: 'unavailable' })
    expect(await store.putProfilePhoto(owner, { ...photo, bytes: new Uint8Array(2097153) })).toEqual({ kind: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
    for (const response of [new Response('{oops'), reply({ Key: object }, 302), reply({ Key: object }, 500)]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await store.putProfilePhoto(owner, photo)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('enforces declared and streamed size bounds and cancels rejected bodies', async () => {
    const { downloadProfilePhoto, putProfilePhoto } = await import('../lib/server/profile-photo-store')
    let cancelled = 0
    const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2097153)) }, cancel() { cancelled++ } })
    readFetch(() => new Response(oversized, { headers: { 'content-type': 'image/png' } }))
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
    expect(cancelled).toBe(1)
    readFetch(() => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png', 'content-length': '2097153' } }))
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
    vi.stubGlobal('fetch', vi.fn(async () => reply({ Key: object, padding: 'x'.repeat(16384) })))
    expect(await putProfilePhoto(owner, photo)).toEqual({ kind: 'unavailable' })
    readFetch(() => reply({ ...missing, padding: 'x'.repeat(16384) }, 400))
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
  })

  it('copies producer chunks before reused buffers change', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    const shared = new Uint8Array([1, 2])
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (++pulls === 1) controller.enqueue(shared)
      else if (pulls === 2) { shared.set([3, 4]); controller.enqueue(shared) }
      else controller.close()
    } }, { highWaterMark: 0 })
    readFetch(() => new Response(body, { headers: { 'content-type': 'image/png' } }))
    expect(await downloadProfilePhoto(owner, caller)).toEqual({ kind: 'found', bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' })
  })

  it('ends a stalled response body at the same ten-second deadline', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    let cancelled = 0
    vi.useFakeTimers()
    try {
      readFetch(() => new Response(new ReadableStream({ pull() {}, cancel() { cancelled++ } }), { headers: { 'content-type': 'image/png' } }))
      const pending = downloadProfilePhoto(owner, caller)
      await vi.advanceTimersByTimeAsync(10000)
      expect(await pending).toEqual({ kind: 'unavailable' })
      expect(cancelled).toBe(1)
    } finally { vi.useRealTimers() }
  })

  it('uses one ten-second deadline across fetch and body and propagates caller abort', async () => {
    const { downloadProfilePhoto } = await import('../lib/server/profile-photo-store')
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('abort'))))))
      const pending = downloadProfilePhoto(owner, caller)
      await vi.advanceTimersByTimeAsync(10000)
      expect(await pending).toEqual({ kind: 'unavailable' })
      const controller = new AbortController()
      controller.abort()
      expect(await downloadProfilePhoto(owner, caller, controller.signal)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
