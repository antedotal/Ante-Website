// Exercise permanent photo route exports with the installed SSR/Auth SDK and controlled HTTP providers.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods'

vi.mock('server-only', () => ({}))
const codecEnv = vi.hoisted(() => ({ PROFILE_PNG_WASM: undefined as WebAssembly.Module | undefined, PROFILE_JPEG_WASM: undefined as WebAssembly.Module | undefined }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: codecEnv }) }))

const site = 'https://ante.test'
const project = 'https://yxilmwxptfnebnjsikwo.supabase.co'
const owner = '00000000-0000-4000-8000-000000000001'
const forged = '00000000-0000-4000-8000-000000000002'
const token = 'fresh.checked.token'
const photo = new Uint8Array(readFileSync(new URL('./fixtures/red-2x2.png', import.meta.url)))
const asset = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
const manifest = { kind: 'current', asset_id: asset, revision: '1', sha256: createHash('sha256').update(photo).digest('hex'), mime: 'image/png', width: 2, height: 2, byte_count: photo.length, transform_version: 'png-v1' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let calls: { url: string; init: RequestInit }[]
let authStatus = 200
let authBody: unknown
let resolved: Response
let resolverOverride: (() => Response) | null = null
let photoRead: Response
let quota: 'allow' | 'deny' | 'unavailable' = 'allow'
let visitor: 'allow' | 'deny' | 'unavailable' = 'allow'
let refreshedToken: string | null = null
let storageHold: { entered: () => void; wait: Promise<void> } | null = null
let manifestReply: () => Response

function barrier() {
  let open!: () => void
  const wait = new Promise<void>(resolve => { open = resolve })
  return { wait, open }
}

type RouteStage = 'selection' | 'decode' | 'final-auth'

// Hold the actual route at one boundary while its other SDK, store and codec work stays real.
async function pauseRouteStage(stage: RouteStage, entered: ReturnType<typeof barrier>, release: ReturnType<typeof barrier>) {
  if (stage === 'selection') {
    const store = await import('../lib/server/profile-photo-store')
    const original = store.resolveCurrentProfilePhoto
    let selections = 0
    vi.spyOn(store, 'resolveCurrentProfilePhoto').mockImplementation(async (...args) => {
      const result = await original(...args)
      if (++selections === 1) { entered.open(); await release.wait }
      return result
    })
  } else if (stage === 'decode') {
    const codecs = await import('../lib/server/profile-photo-codecs')
    const original = codecs.fullyDecodeProfilePhoto
    vi.spyOn(codecs, 'fullyDecodeProfilePhoto').mockImplementation(async (...args) => {
      await original(...args)
      entered.open()
      await release.wait
    })
  } else {
    const sessions = await import('../lib/server/profile-photo-session')
    const original = sessions.reverifyProfilePhotoSession
    vi.spyOn(sessions, 'reverifyProfilePhotoSession').mockImplementation(async (...args) => {
      const result = await original(...args)
      entered.open()
      await release.wait
      return result
    })
  }
}

function pendingUpload() {
  let pulls = 0
  let cancellations = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(photo.slice()); controller.close() },
    cancel() { cancellations++; return new Promise<void>(() => {}) },
  }, { highWaterMark: 0 })
  return { request: upload({ body }), get pulls() { return pulls }, get cancellations() { return cancellations } }
}

function cookie(accessToken = token, userId = forged, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const session = { access_token: accessToken, refresh_token: 'refresh.secret', token_type: 'bearer', expires_at: expiresAt, expires_in: 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'forged@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} } }
  return `sb-yxilmwxptfnebnjsikwo-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

function request(method: string, path: string, options: { headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal; cookie?: string } = {}) {
  return new NextRequest(`${site}${path}`, { method, headers: {
    host: 'ante.test', 'cf-connecting-ip': '192.0.2.10', cookie: options.cookie ?? cookie(),
    ...(method === 'PUT' || method === 'DELETE' ? { origin: site } : {}),
    ...(method === 'PUT' ? { 'content-type': 'image/png' } : {}), ...options.headers,
  }, ...(options.body !== undefined ? { body: options.body } : {}), signal: options.signal,
    ...(options.body instanceof ReadableStream ? { duplex: 'half' } : {}) } as NonNullable<ConstructorParameters<typeof NextRequest>[1]>)
}

const upload = (options: Parameters<typeof request>[2] = {}) => request('PUT', '/api/account/profile/photo', { body: photo.slice(), ...options })
const deletion = (options: Parameters<typeof request>[2] = {}) => request('DELETE', '/api/account/profile/photo', options)
const read = (options: Parameters<typeof request>[2] = {}, path = `/api/profiles/${owner}/photo`) => request('GET', path, options)

// The same privacy policy must cover successful bytes, denials and bodyless methods.
function expectPrivate(response: Response) {
  for (const [name, value] of Object.entries({ 'cache-control': 'private, no-store', 'cdn-cache-control': 'no-store',
    'cloudflare-cdn-cache-control': 'no-store', pragma: 'no-cache', expires: '0' })) expect(response.headers.get(name)).toBe(value)
  expect(response.headers.get('vary')?.split(',').map(value => value.trim().toLowerCase())).toContain('cookie')
  for (const name of ['etag', 'last-modified', 'accept-ranges', 'content-range', 'age', 'surrogate-control']) expect(response.headers.get(name)).toBeNull()
}

beforeAll(async () => {
  codecEnv.PROFILE_PNG_WASM = await WebAssembly.compile(readFileSync(new URL('../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url)))
  codecEnv.PROFILE_JPEG_WASM = await WebAssembly.compile(readFileSync(new URL('../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url)))
})

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = project
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = site
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  process.env.ANTE_PROFILE_PHOTOS_MODE = 'mediated-read-v1'
  calls = []
  authStatus = 200
  authBody = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'verified@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} }
  resolved = json({ kind: 'current', asset_id: asset })
  resolverOverride = null
  photoRead = new Response(photo.slice(), { headers: { 'content-type': 'image/png', etag: 'provider-private' } })
  quota = 'allow'
  visitor = 'allow'
  refreshedToken = null
  storageHold = null
  manifestReply = () => json(manifest)
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const address = String(url)
    calls.push({ url: address, init })
    if (address.includes('/rpc/consume_website_account_limit')) {
      const userRead = calls.filter(call => call.url.includes('/rpc/consume_website_account_limit')).length > 1
      const decision = userRead ? quota : visitor
      return decision === 'allow' ? json({ allowed: true, retry_after_seconds: 0 }) : decision === 'deny' ? json({ allowed: false, retry_after_seconds: 17 }) : json({ invalid: true })
    }
    if (address.includes('/auth/v1/token?grant_type=refresh_token')) return json({ access_token: refreshedToken ?? token, refresh_token: 'rotated.refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: forged, aud: 'authenticated', role: 'authenticated', email: 'forged@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} } })
    if (address.includes('/auth/v1/user')) return authStatus === 200 ? json(authBody) : json({ code: 'bad_jwt', msg: 'private' }, authStatus)
    if (address.includes('/rest/v1/rpc/resolve_profile_photo_v1')) return resolverOverride ? resolverOverride() : resolved.clone()
    if (address.includes('/rest/v1/rpc/profile_photo_read_manifest_v1')) return manifestReply()
    if (address.includes('/storage/v1/object/profile-photos/')) {
      if (storageHold) { storageHold.entered(); await storageHold.wait }
      return photoRead.clone()
    }
    throw new Error(`Unexpected provider URL ${address}`)
  }))
})

describe('profile photo route gates and reads', () => {
  it('normalizes provider metadata while preserving method, retry and cookie headers', async () => {
    const { privateProfilePhotoResponse } = await import('../lib/server/profile-photo-response')
    const response = privateProfilePhotoResponse(new NextResponse(null, { status: 405, headers: {
      Allow: 'GET', 'Retry-After': '17', 'Set-Cookie': 'session=opaque; Secure', Vary: 'Accept-Encoding',
      ETag: 'private', 'Last-Modified': 'yesterday', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 0-1/2',
      Age: '99', 'Surrogate-Control': 'max-age=99',
    } }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(response.headers.get('retry-after')).toBe('17')
    expect(response.headers.get('set-cookie')).toBe('session=opaque; Secure')
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie')
    expectPrivate(response)
  })

  it('serves only a frozen current asset after both fresh caller checks', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const asset = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    const digest = createHash('sha256').update(photo).digest('hex')
    process.env.ANTE_PROFILE_PHOTOS_MODE = 'mediated-read-v1'
    const sequence: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const address = String(url)
      calls.push({ url: address, init })
      if (address.includes('/rpc/consume_website_account_limit')) { sequence.push('quota'); return json({ allowed: true, retry_after_seconds: 0 }) }
      if (address.includes('/auth/v1/user')) { sequence.push('auth'); return json(authBody) }
      if (address.includes('/rpc/resolve_profile_photo_v1')) { sequence.push('resolver'); return json({ kind: 'current', asset_id: asset }) }
      if (address.includes('/rpc/profile_photo_read_manifest_v1')) {
        sequence.push('manifest')
        return json({ kind: 'current', asset_id: asset, revision: '1', sha256: digest, mime: 'image/png', width: 2, height: 2, byte_count: photo.length, transform_version: 'png-v1' })
      }
      if (address.includes(`/storage/v1/object/profile-photos/${owner}/${asset}`)) { sequence.push('bytes'); return new Response(photo.slice(), { headers: { 'content-type': 'image/png' } }) }
      throw new Error(`Unexpected provider URL ${address}`)
    }))
    const response = await GET(read({ headers: { range: 'bytes=0-1', 'if-none-match': 'old' } }), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo)
    expect(sequence).toEqual(['quota', 'auth', 'quota', 'resolver', 'manifest', 'bytes', 'auth', 'resolver'])
    expectPrivate(response)
    for (const [name, value] of Object.entries({ 'cache-control': 'private, no-store', 'cdn-cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store', pragma: 'no-cache', expires: '0', vary: 'Cookie' })) {
      expect(response.headers.get(name)).toBe(value)
    }
    for (const name of ['etag', 'last-modified', 'accept-ranges']) expect(response.headers.get(name)).toBeNull()
  })

  it('starts the wall deadline before asynchronous route parameters resolve', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    process.env.ANTE_PROFILE_PHOTOS_MODE = 'mediated-read-v1'
    const params = new Promise<{ ownerId: string }>(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = GET(read(), { params })
      await vi.advanceTimersByTimeAsync(30_000)
      const response = await pending
      expect(response.status).toBe(503)
      expect(calls).toEqual([])
    } finally { vi.useRealTimers() }
  })

  it('uses the monotonic deadline when a delayed timer has not fired', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    let elapsed = 0
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    const params = Promise.resolve().then(() => { elapsed = 30_001; return { ownerId: owner } })
    const response = await GET(read(), { params })
    expect(response.status).toBe(503)
    expect(calls).toEqual([])
    expectPrivate(response)
  })

  it.each(['visitor', 'user'] as const)('ends a stalled %s admission after its five-second transport bound', async stage => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const baseline = vi.mocked(fetch).getMockImplementation()!
    let admissions = 0
    let cancelled = 0
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init: RequestInit = {}) => {
      if (String(url).includes('/rpc/consume_website_account_limit') && ++admissions === (stage === 'visitor' ? 1 : 2)) {
        calls.push({ url: String(url), init })
        return Promise.resolve(new Response(new ReadableStream({ pull() {}, cancel() { cancelled++ } }), { headers: { 'content-type': 'application/json' } }))
      }
      return baseline(url, init)
    }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
      await vi.advanceTimersByTimeAsync(5_000)
      const response = await pending
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(cancelled).toBe(1)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(0)
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(stage === 'visitor' ? 0 : 1)
      expectPrivate(response)
    } finally { vi.useRealTimers() }
  })

  it('uses one aggregate thirty-second deadline across otherwise successful route phases', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const admissions = await import('../lib/server/callback-admission')
    const sessions = await import('../lib/server/profile-photo-session')
    const store = await import('../lib/server/profile-photo-store')
    let elapsed = 0
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    const visitorAdmission = admissions.admitAccountVisitor
    const userAdmission = admissions.admitProfilePhotoUser
    const initialAuth = sessions.verifyProfilePhotoSession
    const initialSelection = store.resolveCurrentProfilePhoto
    const selectedRead = store.readSelectedProfilePhoto
    vi.spyOn(admissions, 'admitAccountVisitor').mockImplementation(async (...args) => { const result = await visitorAdmission(...args); elapsed += 4_000; return result })
    vi.spyOn(sessions, 'verifyProfilePhotoSession').mockImplementation(async (...args) => { const result = await initialAuth(...args); elapsed += 7_000; return result })
    vi.spyOn(admissions, 'admitProfilePhotoUser').mockImplementation(async (...args) => { const result = await userAdmission(...args); elapsed += 4_000; return result })
    vi.spyOn(store, 'resolveCurrentProfilePhoto').mockImplementation(async (...args) => { const result = await initialSelection(...args); elapsed += 8_000; return result })
    vi.spyOn(store, 'readSelectedProfilePhoto').mockImplementation(async (...args) => { const result = await selectedRead(...args); elapsed += 8_000; return result })
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(elapsed).toBe(31_000)
    expect(response.status).toBe(503)
    expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(1)
    expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
    expect(calls.filter(call => call.url.includes('/rpc/profile_photo_read_manifest_v1'))).toHaveLength(1)
    expect(calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/'))).toHaveLength(1)
    expectPrivate(response)
  })

  it('denies a selected asset when the final resolver observes replacement', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const asset = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    process.env.ANTE_PROFILE_PHOTOS_MODE = 'mediated-read-v1'
    let resolves = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const address = String(url); calls.push({ url: address, init })
      if (address.includes('/rpc/consume_website_account_limit')) return json({ allowed: true, retry_after_seconds: 0 })
      if (address.includes('/auth/v1/user')) return json(authBody)
      if (address.includes('/rpc/resolve_profile_photo_v1')) return json({ kind: 'current', asset_id: ++resolves === 1 ? asset : forged })
      if (address.includes('/rpc/profile_photo_read_manifest_v1')) return json({ kind: 'current', asset_id: asset, revision: '1', sha256: createHash('sha256').update(photo).digest('hex'), mime: 'image/png', width: 2, height: 2, byte_count: photo.length, transform_version: 'png-v1' })
      if (address.includes(`/storage/v1/object/profile-photos/${owner}/${asset}`)) return new Response(photo.slice(), { headers: { 'content-type': 'image/png' } })
      throw new Error(`Unexpected provider URL ${address}`)
    }))
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Photo not found' })
    expect(resolves).toBe(2)
  })

  it.each([
    ['clear', { kind: 'not_found' }],
    ['accepted-friendship revocation', { kind: 'not_found' }],
    ['caller deletion', { kind: 'not_found' }],
    ['target deletion', { kind: 'not_found' }],
    ['replacement', { kind: 'current', asset_id: forged }],
  ])('discards buffered bytes after %s reaches the final resolver', async (_change, finalSelection) => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const entered = barrier(); const release = barrier()
    storageHold = { entered: entered.open, wait: release.wait }
    const pending = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    try {
      await entered.wait
      resolverOverride = () => json(finalSelection)
      release.open()
      const response = await pending
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Photo not found' })
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(2)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(2)
      expect(calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/'))).toHaveLength(1)
      expectPrivate(response)
    } finally { release.open(); storageHold = null }
  })

  it.each(['selection', 'decode'] as const)('holds %s before publishing and obeys each final authority decision', async stage => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    for (const finalSelection of [
      { label: 'replacement', value: { kind: 'current', asset_id: forged } },
      { label: 'clear', value: { kind: 'not_found' } },
      { label: 'friendship revocation', value: { kind: 'not_found' } },
      { label: 'caller deletion', value: { kind: 'not_found' } },
      { label: 'target deletion', value: { kind: 'not_found' } },
    ]) {
      calls = []
      const entered = barrier(); const release = barrier()
      await pauseRouteStage(stage, entered, release)
      let settled = false
      const pending = GET(read(), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
      try {
        await entered.wait
        expect(settled, finalSelection.label).toBe(false)
        expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
        expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(1)
        resolverOverride = () => json(finalSelection.value)
        release.open()
        const response = await pending
        expect(response.status, finalSelection.label).toBe(404)
        expect(await response.json()).toEqual({ error: 'Photo not found' })
        expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(2)
        expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(2)
        expectPrivate(response)
      } finally { release.open(); resolverOverride = null; vi.restoreAllMocks() }
    }
  })

  it('holds after final Auth until the final resolver and publishes only if that decision remains current', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    for (const finalSelection of [{ kind: 'not_found' }, { kind: 'current', asset_id: asset }]) {
      calls = []
      const entered = barrier(); const release = barrier()
      await pauseRouteStage('final-auth', entered, release)
      let settled = false
      const pending = GET(read(), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
      try {
        await entered.wait
        expect(settled).toBe(false)
        expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(2)
        expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
        resolverOverride = () => json(finalSelection)
        release.open()
        const response = await pending
        expect(response.status).toBe(finalSelection.kind === 'current' ? 200 : 404)
        expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(2)
        if (response.status === 200) expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo)
        else expect(await response.json()).toEqual({ error: 'Photo not found' })
        expectPrivate(response)
      } finally { release.open(); resolverOverride = null; vi.restoreAllMocks() }
    }
  })

  it.each(['selection', 'decode', 'final-auth'] as const)('aborts at the %s barrier without starting later provider work', async stage => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const controller = new AbortController()
    const entered = barrier(); const release = barrier()
    await pauseRouteStage(stage, entered, release)
    let settled = false
    const pending = GET(read({ signal: controller.signal }), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
    try {
      await entered.wait
      expect(settled).toBe(false)
      const before = calls.length
      controller.abort()
      release.open()
      const response = await pending
      expect(response.status).toBe(503)
      expect(calls).toHaveLength(before)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(stage === 'final-auth' ? 2 : 1)
      expectPrivate(response)
    } finally { release.open() }
  })

  it.each(['abort', 'deadline'] as const)('keeps the route slot through late %s decode settlement', async interruption => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const controller = new AbortController()
    const entered = barrier(); const release = barrier()
    let elapsed = 0
    if (interruption === 'deadline') vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    await pauseRouteStage('decode', entered, release)
    let settled = false
    const first = GET(read({ signal: controller.signal }), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
    try {
      await entered.wait
      expect(settled).toBe(false)
      if (interruption === 'abort') controller.abort()
      else elapsed = 30_001
      const before = calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1')).length
      const contender = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
      expect(contender.status).toBe(503)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(before)
      expect(settled).toBe(false)
      release.open()
      const response = await first
      expect(response.status).toBe(503)
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(2)
      expectPrivate(response)
    } finally { release.open() }
  })

  it('discards a late abort-ignoring Storage reply without final authorization work', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const controller = new AbortController()
    const entered = barrier(); const release = barrier()
    storageHold = { entered: entered.open, wait: release.wait }
    let settled = false
    const pending = GET(read({ signal: controller.signal }), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
    try {
      await entered.wait
      controller.abort()
      release.open()
      const response = await pending
      expect(response.status).toBe(503)
      expect(settled).toBe(true)
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(1)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
      expectPrivate(response)
    } finally { release.open(); storageHold = null }
  })

  it('does not publish when final Auth returns malformed success or provider failure', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const baseline = vi.mocked(fetch).getMockImplementation()!
    for (const finalReply of [json({}), json({ code: 'unavailable' }, 500)]) {
      calls = []
      vi.stubGlobal('fetch', baseline)
      const entered = barrier(); const release = barrier()
      storageHold = { entered: entered.open, wait: release.wait }
      const pending = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
      try {
        await entered.wait
        vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init: RequestInit = {}) =>
          String(url).includes('/auth/v1/user') ? Promise.resolve(finalReply.clone()) : baseline(url, init)))
        release.open()
        const response = await pending
        expect(response.status).toBe(503)
        expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
        expectPrivate(response)
      } finally { release.open(); storageHold = null }
    }
  })

  it.each([
    ['identity changed', { status: 200, body: { id: forged }, expected: 401 }],
    ['token expired', { status: 401, body: {}, expected: 401 }],
    ['malformed success', { status: 200, body: {}, expected: 503 }],
    ['provider unavailable', { status: 500, body: {}, expected: 503 }],
  ])('rejects final %s after held route validation and retains exact initial cookies', async (_label, finalAuth) => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const sessions = await import('../lib/server/profile-photo-session')
    const original = sessions.verifyProfilePhotoSession
    let initialCookie: string | null = null
    vi.spyOn(sessions, 'verifyProfilePhotoSession').mockImplementation(async (...args) => {
      const result = await original(...args)
      if (result.kind === 'verified') initialCookie = result.session.provisional.headers.get('set-cookie')
      return result
    })
    refreshedToken = 'rotated.checked.token'
    const entered = barrier(); const release = barrier()
    await pauseRouteStage('decode', entered, release)
    let settled = false
    const pending = GET(read({ cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) }).then(response => { settled = true; return response })
    try {
      await entered.wait
      expect(settled).toBe(false)
      authStatus = finalAuth.status
      authBody = finalAuth.body
      release.open()
      const response = await pending
      expect(response.status).toBe(finalAuth.expected)
      expect(initialCookie).toContain('Secure')
      expect(response.headers.get('set-cookie')).toBe(initialCookie)
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(2)
      expectPrivate(response)
    } finally { release.open() }
  })

  it('discards buffered bytes after a final Auth revocation and preserves initial refresh cookies', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    refreshedToken = 'rotated.checked.token'
    const entered = barrier(); const release = barrier()
    storageHold = { entered: entered.open, wait: release.wait }
    const pending = GET(read({ cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) })
    try {
      await entered.wait
      authStatus = 401
      release.open()
      const response = await pending
      expect(response.status).toBe(401)
      expect(response.headers.get('set-cookie')).toContain('Secure')
      expect(await response.json()).toEqual({ error: 'Authentication required' })
      expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
      expectPrivate(response)
    } finally { release.open(); storageHold = null }
  })

  it('aborts during byte download without starting final Auth or publishing bytes', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const controller = new AbortController()
    const entered = barrier(); const release = barrier()
    storageHold = { entered: entered.open, wait: release.wait }
    const pending = GET(read({ signal: controller.signal }), { params: Promise.resolve({ ownerId: owner }) })
    try {
      await entered.wait
      controller.abort()
      const response = await pending
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'Photo temporarily unavailable' })
      expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(1)
      expectPrivate(response)
    } finally { release.open(); storageHold = null }
  })

  it('returns bodyless private 405 for unsupported methods before network', async () => {
    const writeHandlers = autoImplementMethods(await import('../app/api/account/profile/photo/route'))
    const readHandlers = autoImplementMethods(await import('../app/api/profiles/[ownerId]/photo/route') as never)
    for (const method of ['HEAD', 'OPTIONS', 'GET', 'POST', 'PATCH'] as const) {
      const response = await writeHandlers[method](request(method, '/api/account/profile/photo'), {} as never) as Response
      expect([response.status, response.headers.get('allow'), response.headers.get('cache-control'), await response.text()]).toEqual([405, 'PUT, DELETE', 'private, no-store', ''])
      expectPrivate(response)
    }
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await readHandlers[method](request(method, `/api/profiles/${owner}/photo`), { params: Promise.resolve({ ownerId: owner }) } as never) as Response
      expect([response.status, response.headers.get('allow'), response.headers.get('cache-control'), await response.text()]).toEqual([405, 'GET', 'private, no-store', ''])
      expectPrivate(response)
    }
    expect(calls).toEqual([])
  })

  it('cancels an unsupported PUT to the read route without touching network', async () => {
    const { PUT } = await import('../app/api/profiles/[ownerId]/photo/route')
    let cancelled = 0
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel() { cancelled++ } }, { highWaterMark: 0 })
    const response = await PUT(request('PUT', `/api/profiles/${owner}/photo`, { body }))
    expect(response.status).toBe(405)
    expect(cancelled).toBe(1)
    expect(calls).toEqual([])
  })

  it('keeps the operator gate closed by default before admission, Auth and image reading', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    delete process.env.ANTE_PROFILE_PHOTOS_MODE
    const pending = pendingUpload()
    const response = await PUT(pending.request)
    expect(response.status).toBe(503)
    expectPrivate(response)
    expect([pending.pulls, pending.cancellations]).toEqual([0, 1])
    const deniedRead = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(deniedRead.status).toBe(503)
    expectPrivate(deniedRead)
    expect(calls).toEqual([])
  })

  it('permits GET only in mediated-read-v1 and keeps both write routes closed in every mode', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    for (const mode of ['private-v1', 'generation-read-v1', 'unknown-mode', 'mediated-read-v1']) {
      process.env.ANTE_PROFILE_PHOTOS_MODE = mode
      calls = []
      const uploadDenied = await PUT(upload())
      const deleteDenied = await DELETE(deletion())
      expect(uploadDenied.status).toBe(503)
      expect(deleteDenied.status).toBe(503)
      expectPrivate(uploadDenied)
      expectPrivate(deleteDenied)
      expect(calls).toEqual([])
      const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
      expect(response.status).toBe(mode === 'mediated-read-v1' ? 200 : 503)
      expectPrivate(response)
    }
  })

  it('rejects cheap unsupported MIME and declared oversize before visitor admission', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    for (const [headers, status] of [
      [{ 'content-type': 'application/json' }, 415],
      [{ 'content-length': '2097153' }, 413],
      [{ 'content-length': 'unknown' }, 400],
    ] as const) {
      const response = await PUT(upload({ headers }))
      expect(response.status).toBe(status)
      expectPrivate(response)
    }
    expect(calls).toEqual([])
  })

  it('uses the checked token for both resolver calls and a separate service credential for bytes', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(200)
    const auth = calls.find(call => call.url.includes('/auth/v1/user'))!
    expect(new Headers(auth.init.headers).get('authorization')).toBe(`Bearer ${token}`)
    const resolver = calls.find(call => call.url.includes('/rpc/resolve_profile_photo_v1'))!
    expect(resolver.init.body).toBe(JSON.stringify({ p_owner: owner }))
    expect(new Headers(resolver.init.headers).get('authorization')).toBe(`Bearer ${token}`)
    const storage = calls.find(call => call.url.includes('/storage/v1/object/profile-photos/'))!
    expect(new Headers(storage.init.headers).get('authorization')).toBeNull()
    expect(new Headers(storage.init.headers).get('apikey')).toBe('sb_secret_test_service_key')
    expect(storage.url).not.toContain(forged)
  })

  it('rejects malformed origin, query, UUID, aborted requests and DELETE bodies before network', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    for (const headers of [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { origin: '' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }] as Record<string, string>[]) {
      const response = await PUT(upload({ headers }))
      expect(response.status).toBe(403)
      expectPrivate(response)
    }
    const invalid = [
      await PUT(request('PUT', '/api/account/profile/photo?owner_id=x', { body: photo.slice() })),
      await GET(read({}, '/api/profiles/UPPER/photo'), { params: Promise.resolve({ ownerId: 'UPPER' }) }),
      await GET(read({}, `/api/profiles/${owner}/photo?size=small`), { params: Promise.resolve({ ownerId: owner }) }),
      await DELETE(deletion({ body: 'hidden', headers: { 'content-type': 'text/plain' } })),
    ]
    for (const response of invalid) { expect(response.status).toBe(400); expectPrivate(response) }
    const controller = new AbortController(); controller.abort()
    const aborted = await PUT(upload({ signal: controller.signal }))
    expect(aborted.status).toBe(400)
    expectPrivate(aborted)
    expect(calls).toEqual([])
  })

  it('admits a visitor before Auth and rejects failed Auth before resolver or Storage work', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const get = () => GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    visitor = 'deny'
    let response = await get()
    expect([response.status, response.headers.get('retry-after')]).toEqual([429, '17'])
    expectPrivate(response)
    expect(calls.map(call => call.url)).toHaveLength(1)
    visitor = 'allow'; calls = []; authStatus = 401
    response = await get()
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expectPrivate(response)
    expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('maps missing session and Auth provider failures without returning provisional cookies', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const get = (options: Parameters<typeof read>[0] = {}) => GET(read(options), { params: Promise.resolve({ ownerId: owner }) })
    const missingSession = await get({ cookie: '' })
    expect(missingSession.status).toBe(401)
    expectPrivate(missingSession)
    expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(false)
    for (const [providerStatus, expected] of [[429, 429], [500, 503]] as const) {
      calls = []; authStatus = providerStatus
      const response = await get()
      expect(response.status).toBe(expected)
      expect(response.headers.get('set-cookie')).toBeNull()
      expectPrivate(response)
      expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
    }
  })

  it('treats malformed successful Auth identities as provider uncertainty after a staged refresh', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    refreshedToken = 'rotated.checked.token'
    for (const malformed of [{}, { id: 23 }, { id: 'NOT-A-CANONICAL-UUID' }]) {
      calls = []; authBody = malformed
      const response = await GET(read({ cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) })
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expectPrivate(response)
      expect(calls.some(call => call.url.includes('/auth/v1/token?grant_type=refresh_token'))).toBe(true)
      expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(true)
      expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
    }
  })

  it('treats unexpected Auth redirect status as provider uncertainty', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    authStatus = 302
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expectPrivate(response)
    expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('uses the sixty-per-minute read user namespace before resolver work', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    quota = 'deny'
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect([response.status, response.headers.get('retry-after')]).toEqual([429, '17'])
    expectPrivate(response)
    const quotaCall = calls.at(-1)!
    expect(quotaCall.url).toContain('consume_website_account_limit')
    expect(JSON.parse(String(quotaCall.init.body)).p_visitor_hash).toBe(createHmac('sha256', 'a'.repeat(32)).update(`website-photo-read:v1:${owner}`).digest('hex'))
    expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
  })





  it('serves original validated bytes privately after full authenticated read even with range and validators', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const response = await GET(read({ headers: { range: 'bytes=0-1', 'if-none-match': 'old', 'if-modified-since': 'Wed, 01 Jan 2020 00:00:00 GMT' } }), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    for (const name of ['etag', 'last-modified', 'content-range']) expect(response.headers.get(name)).toBeNull()
    const storage = calls.find(call => call.url.includes('/storage/v1/object/profile-photos/'))!
    expect(storage.url).toBe(`${project}/storage/v1/object/profile-photos/${owner}/${asset}`)
    const headers = new Headers(storage.init.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('apikey')).toBe('sb_secret_test_service_key')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('range')).toBeNull()
    expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(true)
  })

  it('serves a current asset only at the resolver-selected generation key', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const asset = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    resolved = json({ kind: 'current', asset_id: asset })
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(200)
    expect(calls.find(call => call.url.includes('/storage/v1/object/profile-photos/'))?.url).toBe(`${project}/storage/v1/object/profile-photos/${owner}/${asset}`)
    photoRead = json({ statusCode: '404', code: 'NoSuchKey', error: 'not_found' }, 400)
    calls = []
    expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(404)
    expect(calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/'))).toHaveLength(1)
  })

  it('maps missing photos to 404 and corrupted stored bytes to 503', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    photoRead = json({ statusCode: '404', code: 'NoSuchKey', error: 'not_found' }, 400)
    const absent = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(absent.status).toBe(404)
    expect(await absent.json()).toEqual({ error: 'Photo not found' })
    photoRead = new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(503)
    photoRead = new Response(photo.slice(), { headers: { 'content-type': 'image/gif' } })
    expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(503)
  })

  it.each(['malformed codec', 'dimension mismatch'] as const)('denies hash-consistent %s before final Auth or resolver', async defect => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const bytes = defect === 'malformed codec' ? new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]) : photo
    manifestReply = () => json({ ...manifest,
      sha256: createHash('sha256').update(bytes).digest('hex'), byte_count: bytes.length,
      width: defect === 'dimension mismatch' ? 3 : 2,
    })
    photoRead = new Response(bytes.slice(), { headers: { 'content-type': 'image/png' } })
    const response = await GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Photo temporarily unavailable' })
    expect(calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/'))).toHaveLength(1)
    expect(calls.filter(call => call.url.includes('/auth/v1/user'))).toHaveLength(1)
    expect(calls.filter(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toHaveLength(1)
    expectPrivate(response)
  })



  it('preserves refreshed cookies after verification on downstream denial and drops them after failed verification', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const get = () => GET(read({ cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) })
    refreshedToken = 'rotated.checked.token'
    resolved = json({ kind: 'not_found' })
    let response = await get()
    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expectPrivate(response)
    const auth = calls.find(call => call.url.includes('/auth/v1/user'))!
    expect(new Headers(auth.init.headers).get('authorization')).toBe(`Bearer ${refreshedToken}`)
    expect(new Headers(calls.find(call => call.url.includes('/rpc/resolve_profile_photo_v1'))!.init.headers).get('authorization')).toBe(`Bearer ${refreshedToken}`)
    quota = 'deny'; calls = []
    response = await get()
    expect(response.status).toBe(429)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expectPrivate(response)
    quota = 'allow'; resolved = json({ unexpected: true }); calls = []
    response = await get()
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expectPrivate(response)
    resolved = json({ kind: 'legacy' }); calls = []
    response = await get()
    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expectPrivate(response)
    calls = []; authStatus = 401
    response = await get()
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expectPrivate(response)
  })

  it('retains initial verified refresh cookies on an unexpected later exception', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const admission = await import('../lib/server/callback-admission')
    refreshedToken = 'rotated.checked.token'
    vi.spyOn(admission, 'admitProfilePhotoUser').mockRejectedValueOnce(new Error('unexpected'))
    const response = await GET(read({ cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1'))).toBe(false)
    expectPrivate(response)
  })

  it.each(['deadline', 'abort'] as const)('retains the exact initial refresh cookie when %s lands after successful verification', async interruption => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const sessions = await import('../lib/server/profile-photo-session')
    const original = sessions.verifyProfilePhotoSession
    const controller = new AbortController()
    let elapsed = 0
    let expectedCookie: string | null = null
    if (interruption === 'deadline') vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    refreshedToken = 'rotated.checked.token'
    vi.spyOn(sessions, 'verifyProfilePhotoSession').mockImplementation(async (request, signal) => {
      const identity = await original(request, signal)
      if (identity.kind === 'verified') {
        expectedCookie = identity.session.provisional.headers.get('set-cookie')
        if (interruption === 'deadline') elapsed = 30_001
        else controller.abort()
      }
      return identity
    })
    const response = await GET(read({ signal: controller.signal, cookie: cookie(token, forged, 1) }), { params: Promise.resolve({ ownerId: owner }) })
    expect(expectedCookie).toContain('Secure')
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBe(expectedCookie)
    expect(calls.filter(call => call.url.includes('/rpc/consume_website_account_limit'))).toHaveLength(1)
    expect(calls.some(call => call.url.includes('/rpc/resolve_profile_photo_v1') || call.url.includes('/storage/v1/'))).toBe(false)
    expectPrivate(response)
  })



  it('holds GET capacity before download and releases it for unread response ownership', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = barrier(); const release = barrier()
    storageHold = { entered: entered.open, wait: release.wait }
    const first = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    try {
      await entered.wait
      const contender = pendingUpload()
      expect((await PUT(contender.request)).status).toBe(503)
      expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
      const raw = pendingUpload()
      await expect(validateProfilePhoto(raw.request)).rejects.toMatchObject({ status: 503 })
      expect([raw.pulls, raw.cancellations]).toEqual([0, 1])
      const before = calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/')).length
      expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(503)
      expect(calls.filter(call => call.url.includes('/storage/v1/object/profile-photos/'))).toHaveLength(before)
      release.open()
      const unread = await first
      expect(unread.status).toBe(200)
      storageHold = null
      expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(200)
      expect(new Uint8Array(await unread.arrayBuffer())).toEqual(photo)
    } finally { release.open(); storageHold = null }
  })

  it('restores capacity after missing, corrupt and unavailable downloads', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const get = () => GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    for (const [reply, expected] of [
      [json({ statusCode: '404', code: 'NoSuchKey', error: 'not_found' }, 400), 404],
      [new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }), 503],
      [json({ private: 'provider failure' }, 500), 503],
    ] as const) {
      photoRead = reply
      expect((await get()).status).toBe(expected)
      photoRead = new Response(photo.slice(), { headers: { 'content-type': 'image/png' } })
      expect((await get()).status).toBe(200)
    }
  })

  it('releases GET capacity after a stalled resolver times out', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    let cancelled = 0
    resolverOverride = () => new Response(new ReadableStream({ pull() {}, cancel() { cancelled++ } }), { headers: { 'content-type': 'application/json' } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const first = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
      await vi.advanceTimersByTimeAsync(10_000)
      expect((await first).status).toBe(503)
      expect(cancelled).toBe(1)
      resolverOverride = null
      vi.useRealTimers()
      expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(200)
    } finally { vi.useRealTimers() }
  })

})
