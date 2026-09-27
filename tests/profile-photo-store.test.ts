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

// Synthetic bytes have a fixed independently computed SHA-256; codec checks belong to the held route scope.
const frozenManifest = {
  kind: 'current', asset_id: asset, revision: '9007199254740993',
  sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
  mime: 'image/png', width: 1920, height: 1080, byte_count: 4, transform_version: 'png-v1',
} as const
const frozenBytes = new Uint8Array([1, 2, 3, 4])
const bytesReply = (bytes = frozenBytes, headers: Record<string, string> = {}) => new Response(bytes.slice(), { headers: { 'content-type': 'image/png', ...headers } })

async function selectCurrent() {
  const store = await import('../lib/server/profile-photo-store')
  vi.stubGlobal('fetch', vi.fn(async () => reply({ kind: 'current', asset_id: asset })))
  const result = await store.resolveCurrentProfilePhoto(owner, caller)
  if (result.kind !== 'current') throw new Error('test selection failed')
  return result.selection
}

// These tests cover the service boundary separately from the retained, closed legacy route helper.
describe('mediated selected-asset integrity', () => {
  it('freezes strict caller selection and keeps credentials separate across both caller passes and service reads', async () => {
    const store = await import('../lib/server/profile-photo-store')
    for (const legacy of [false, true]) {
      const service = legacy ? `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '')}.signature` : secret
      if (legacy) { delete process.env.SUPABASE_SECRET_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = service }
      const transport = vi.fn().mockResolvedValueOnce(reply({ kind: 'current', asset_id: asset }))
        .mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(bytesReply())
        .mockResolvedValueOnce(reply({ kind: 'current', asset_id: asset }))
      vi.stubGlobal('fetch', transport)
      const selected = await store.resolveCurrentProfilePhoto(owner, caller)
      expect(selected.kind).toBe('current')
      if (selected.kind !== 'current') throw new Error('missing selection')
      expect(selected.selection).toMatchObject({ ownerId: owner, assetId: asset })
      expect(Object.isFrozen(selected.selection)).toBe(true)
      expect(() => Object.assign(selected.selection, { assetId: owner })).toThrow()
      expect(await store.readSelectedProfilePhoto(selected.selection)).toEqual({ kind: 'found', manifest: frozenManifest, bytes: frozenBytes, contentType: 'image/png' })
      expect(await store.confirmCurrentProfilePhoto(selected.selection, caller)).toEqual({ kind: 'current' })
      expect(transport).toHaveBeenCalledTimes(4)
      for (const i of [0, 3]) {
        const [url, init] = transport.mock.calls[i]
        expect(url).toBe(`${origin}/rest/v1/rpc/resolve_profile_photo_v1`)
        expect(init.body).toBe(JSON.stringify({ p_owner: owner }))
        expect(new Headers(init.headers).get('apikey')).toBe('sb_publishable_testvalue')
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${caller}`)
      }
      expect(transport.mock.calls[1][0]).toBe(`${origin}/rest/v1/rpc/profile_photo_read_manifest_v1`)
      expect(transport.mock.calls[1][1].body).toBe(JSON.stringify({ p_owner: owner, p_asset_id: asset }))
      expect(transport.mock.calls[2][0]).toBe(`${origin}/storage/v1/object/profile-photos/${owner}/${asset}`)
      for (const i of [1, 2]) {
        const headers = new Headers(transport.mock.calls[i][1].headers)
        expect(headers.get('apikey')).toBe(service)
        expect(headers.get('authorization')).toBe(legacy ? `Bearer ${service}` : null)
      }
      for (const [, init] of transport.mock.calls) {
        expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' })
        for (const name of ['cookie', 'range', 'if-none-match', 'if-modified-since']) expect(new Headers(init.headers).has(name)).toBe(false)
      }
    }
  })

  it('denies legacy, malformed and absent selections without loading the photo-read credential or starting service I/O', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const credentials = await import('../lib/server/service-credential')
    const credential = vi.spyOn(credentials, 'serviceCredential')
    for (const [body, kind] of [
      [{ kind: 'legacy' }, 'not_found'], [{ kind: 'not_found' }, 'not_found'],
      [{ kind: 'current', asset_id: asset, key: 'evil' }, 'unavailable'],
      [{ kind: 'current', asset_id: asset.toUpperCase() }, 'unavailable'], [{ kind: 'current' }, 'unavailable'],
      [{ kind: 'not_found', extra: true }, 'unavailable'], [null, 'unavailable'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(body)))
      expect(await store.resolveCurrentProfilePhoto(owner, caller)).toEqual({ kind })
      expect(fetch).toHaveBeenCalledTimes(1)
    }
    expect(credential).not.toHaveBeenCalled()
    const selection = await selectCurrent()
    delete process.env.SUPABASE_SECRET_KEY
    vi.mocked(fetch).mockClear()
    expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects invalid resolver inputs and HTTP/JSON uncertainty before a service read', async () => {
    const store = await import('../lib/server/profile-photo-store')
    for (const [id, token] of [['../asset', caller], [owner, ''], [asset.toUpperCase(), caller]]) {
      expect(await store.resolveCurrentProfilePhoto(id, token)).toEqual({ kind: 'unavailable' })
    }
    expect(fetch).not.toHaveBeenCalled()
    for (const response of [reply({ kind: 'current', asset_id: asset }, 201), reply({}, 302),
      new Response('{bad', { headers: { 'content-type': 'application/json' } }),
      new Response(JSON.stringify({ kind: 'current', asset_id: asset }), { headers: { 'content-type': 'text/plain' } })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await store.resolveCurrentProfilePhoto(owner, caller)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledOnce()
    }
  })

  it('validates the exact manifest union and global bounds before one derived object GET', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const selection = await selectCurrent()
    const invalid = [null, [], { kind: 'not_found', extra: 1 },
      ...Object.keys(frozenManifest).map(key => Object.fromEntries(Object.entries(frozenManifest).filter(([name]) => name !== key))),
      ...[
        { extra: true }, { asset_id: owner }, { asset_id: asset.toUpperCase() }, { revision: 1 }, { revision: '0' },
        { revision: '01' }, { revision: '-1' }, { revision: '9223372036854775808' }, { revision: '1e3' },
        { sha256: frozenManifest.sha256.toUpperCase() }, { sha256: 'a'.repeat(63) },
        { transform_version: '' }, { transform_version: '-bad' }, { transform_version: 'a'.repeat(65) },
        { byte_count: 0 }, { byte_count: 2097153 }, { byte_count: 1.5 }, { mime: 'image/webp' },
        { width: 0 }, { height: -1 }, { width: 1921 }, { width: 1081, height: 1081 }, { height: 1080.5 },
      ].map(change => ({ ...frozenManifest, ...change })),
    ]
    for (const body of invalid) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(body)))
      expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledOnce()
    }
    vi.stubGlobal('fetch', vi.fn(async () => reply({ kind: 'not_found' })))
    expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'not_found' })
    expect(fetch).toHaveBeenCalledOnce()
    for (const manifest of [frozenManifest, { ...frozenManifest, width: 1080, height: 1920, revision: '9223372036854775807' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(manifest)).mockResolvedValueOnce(bytesReply()))
      expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'found', manifest, bytes: frozenBytes, contentType: 'image/png' })
    }
  })

  it('requires exact manifest JSON status and MIME and exact object MIME, count and digest', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const selection = await selectCurrent()
    for (const response of [reply(frozenManifest, 201), reply(frozenManifest, 302),
      new Response(JSON.stringify(frozenManifest), { headers: { 'content-type': 'text/plain' } })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledOnce()
    }
    for (const response of [bytesReply(new Uint8Array()), bytesReply(new Uint8Array([1, 2, 3])),
      bytesReply(new Uint8Array([1, 2, 3, 5])), bytesReply(frozenBytes, { 'content-type': 'image/jpeg' }),
      bytesReply(frozenBytes, { 'content-length': '3' }), bytesReply(frozenBytes, { 'content-length': '2097153' }),
      new Response(frozenBytes, { status: 206 }), new Response(null, { status: 304 }), new Response(null, { status: 302 }),
      bytesReply(new TextEncoder().encode('{"error":"bad"}')), bytesReply(new Uint8Array(2097153))]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(response))
      expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind: 'unavailable' })
      expect(fetch).toHaveBeenCalledTimes(2)
    }
    // Content-Length is optional; the independently attested count still must match.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(bytesReply()))
    expect((await store.readSelectedProfilePhoto(selection)).kind).toBe('found')
  })

  it('maps only precise HTTP 400 JSON missing-object replies to not_found and never restarts', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const selection = await selectCurrent()
    for (const [response, kind] of [
      [reply(missing, 400), 'not_found'], [reply({ statusCode: '404', code: 'NoSuchBucket' }, 400), 'not_found'],
      [reply({ statusCode: '403', code: 'AccessDenied' }, 400), 'unavailable'], [reply(missing, 404), 'unavailable'],
      [reply({ ...missing, statusCode: 404 }, 400), 'unavailable'],
      [new Response(JSON.stringify(missing), { status: 400, headers: { 'content-type': 'image/png' } }), 'unavailable'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(response))
      expect(await store.readSelectedProfilePhoto(selection)).toEqual({ kind })
      expect(fetch).toHaveBeenCalledTimes(2)
    }
  })

  it('copies reused chunks before hashing and rejects a stalled or late object body', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const selection = await selectCurrent()
    const shared = new Uint8Array([1, 2]); let pulls = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (++pulls === 1) controller.enqueue(shared)
      else if (pulls === 2) { shared.set([3, 4]); controller.enqueue(shared) }
      else controller.close()
    } }, { highWaterMark: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'image/png' } })))
    expect((await store.readSelectedProfilePhoto(selection)).kind).toBe('found')
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'image/png' } })))
      const pending = store.readSelectedProfilePhoto(selection)
      await vi.advanceTimersByTimeAsync(10000)
      expect(await pending).toEqual({ kind: 'unavailable' })
      expect(cancel).toHaveBeenCalledOnce()
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })

  it('confirms exactly the initially selected generation with one fresh caller pass', async () => {
    const store = await import('../lib/server/profile-photo-store')
    const selection = await selectCurrent()
    for (const [body, kind] of [[{ kind: 'current', asset_id: asset }, 'current'],
      [{ kind: 'current', asset_id: owner }, 'not_found'], [{ kind: 'legacy' }, 'not_found'],
      [{ kind: 'not_found' }, 'not_found'], [{ kind: 'current' }, 'unavailable']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(body)))
      expect(await store.confirmCurrentProfilePhoto(selection, caller)).toEqual({ kind })
      expect(fetch).toHaveBeenCalledOnce()
    }
  })
})

it('disposes a selected object arriving after its deadline and starts no final provider action', async () => {
  const store = await import('../lib/server/profile-photo-store')
  const selection = await selectCurrent()
  vi.useFakeTimers()
  try {
    let settle!: (response: Response) => void
    const late = new Promise<Response>(resolve => { settle = resolve })
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(frozenManifest)).mockReturnValueOnce(late))
    const pending = store.readSelectedProfilePhoto(selection)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await pending).toEqual({ kind: 'unavailable' })
    settle(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'image/png' } }))
    await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally { vi.useRealTimers() }
})
