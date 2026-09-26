// Exercise permanent photo route exports with the installed SSR/Auth SDK and controlled HTTP providers.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let calls: { url: string; init: RequestInit }[]
let authStatus = 200
let authBody: unknown
let profile: unknown = [{ id: owner }]
let photoRead: Response
let uploadReply: Response
let deleteReply: Response
let quota: 'allow' | 'deny' | 'unavailable' = 'allow'
let visitor: 'allow' | 'deny' | 'unavailable' = 'allow'
let refreshedToken: string | null = null
let storageHold: { kind: 'read' | 'upload'; entered: () => void; wait: Promise<void> } | null = null

function barrier() {
  let open!: () => void
  const wait = new Promise<void>(resolve => { open = resolve })
  return { wait, open }
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
  process.env.ANTE_PROFILE_PHOTOS_MODE = 'private-v1'
  calls = []
  authStatus = 200
  authBody = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'verified@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} }
  profile = [{ id: owner }]
  photoRead = new Response(photo.slice(), { headers: { 'content-type': 'image/png', etag: 'provider-private' } })
  uploadReply = json({ Key: `profile-photos/${owner}/avatar`, Id: 'object-id' })
  deleteReply = json({ message: 'Successfully deleted' })
  quota = 'allow'
  visitor = 'allow'
  refreshedToken = null
  storageHold = null
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const address = String(url)
    calls.push({ url: address, init })
    if (address.includes('/rpc/consume_website_account_limit')) {
      const userRead = calls.filter(call => call.url.includes('/rpc/consume_website_account_limit')).length > 1
      const decision = userRead ? quota : visitor
      return decision === 'allow' ? json({ allowed: true, retry_after_seconds: 0 }) : decision === 'deny' ? json({ allowed: false, retry_after_seconds: 17 }) : json({ invalid: true })
    }
    if (address.includes('/rpc/consume_website_callback_limit')) return quota === 'allow' ? json({ allowed: true, retry_after_seconds: 0 }) : quota === 'deny' ? json({ allowed: false, retry_after_seconds: 17 }) : json({ invalid: true })
    if (address.includes('/auth/v1/token?grant_type=refresh_token')) return json({ access_token: refreshedToken ?? token, refresh_token: 'rotated.refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: forged, aud: 'authenticated', role: 'authenticated', email: 'forged@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} } })
    if (address.includes('/auth/v1/user')) return authStatus === 200 ? json(authBody) : json({ code: 'bad_jwt', msg: 'private' }, authStatus)
    if (address.includes('/rest/v1/profiles?')) return json(profile)
    if (address.includes('/storage/v1/object/authenticated/')) {
      if (storageHold?.kind === 'read') { storageHold.entered(); await storageHold.wait }
      return photoRead.clone()
    }
    if (address.includes('/storage/v1/object/')) {
      if (init.method !== 'DELETE' && storageHold?.kind === 'upload') { storageHold.entered(); await storageHold.wait }
      return init.method === 'DELETE' ? deleteReply.clone() : uploadReply.clone()
    }
    throw new Error(`Unexpected provider URL ${address}`)
  }))
})

describe('closed private photo routes', () => {
  it('returns bodyless private 405 for unsupported methods before network', async () => {
    const writeHandlers = autoImplementMethods(await import('../app/api/account/profile/photo/route'))
    const readHandlers = autoImplementMethods(await import('../app/api/profiles/[ownerId]/photo/route') as never)
    for (const method of ['HEAD', 'OPTIONS', 'GET', 'POST', 'PATCH'] as const) {
      const response = await writeHandlers[method](request(method, '/api/account/profile/photo'), {} as never) as Response
      expect([response.status, response.headers.get('allow'), response.headers.get('cache-control'), await response.text()]).toEqual([405, 'PUT, DELETE', 'private, no-store', ''])
    }
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await readHandlers[method](request(method, `/api/profiles/${owner}/photo`), { params: Promise.resolve({ ownerId: owner }) } as never) as Response
      expect([response.status, response.headers.get('allow'), response.headers.get('cache-control'), await response.text()]).toEqual([405, 'GET', 'private, no-store', ''])
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
    delete process.env.ANTE_PROFILE_PHOTOS_MODE
    const response = await PUT(upload())
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(calls).toEqual([])
  })

  it('rejects cheap unsupported MIME and declared oversize before visitor admission', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    expect((await PUT(upload({ headers: { 'content-type': 'application/json' } }))).status).toBe(415)
    expect((await PUT(upload({ headers: { 'content-length': '2097153' } }))).status).toBe(413)
    expect((await PUT(upload({ headers: { 'content-length': 'unknown' } }))).status).toBe(400)
    expect(calls).toEqual([])
  })

  it('uses freshly verified Auth owner and the exact checked token for profile and fixed-key upload', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const response = await PUT(upload())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    const auth = calls.find(call => call.url.includes('/auth/v1/user'))!
    expect(new Headers(auth.init.headers).get('authorization')).toBe(`Bearer ${token}`)
    const profileCall = calls.find(call => call.url.includes('/rest/v1/profiles?'))!
    expect(profileCall.url).toContain(`id=eq.${owner}`)
    expect(new Headers(profileCall.init.headers).get('authorization')).toBe(`Bearer ${token}`)
    const storage = calls.find(call => call.url.includes('/storage/v1/object/profile-photos/'))!
    expect(storage.url).toBe(`${project}/storage/v1/object/profile-photos/${owner}/avatar`)
    expect(storage.url).not.toContain(forged)
    expect(new Uint8Array(storage.init.body as ArrayBuffer)).toEqual(photo)
  })

  it('rejects malformed origin, query, UUID, aborted requests and DELETE bodies before network', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    for (const headers of [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { origin: '' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }] as Record<string, string>[]) {
      expect((await PUT(upload({ headers }))).status).toBe(403)
    }
    expect((await PUT(request('PUT', '/api/account/profile/photo?owner_id=x', { body: photo.slice() }))).status).toBe(400)
    expect((await GET(read({}, '/api/profiles/UPPER/photo'), { params: Promise.resolve({ ownerId: 'UPPER' }) })).status).toBe(400)
    expect((await GET(read({}, `/api/profiles/${owner}/photo?size=small`), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(400)
    expect((await DELETE(deletion({ body: 'hidden', headers: { 'content-type': 'text/plain' } }))).status).toBe(400)
    const controller = new AbortController(); controller.abort()
    expect((await PUT(upload({ signal: controller.signal }))).status).toBe(400)
    expect(calls).toEqual([])
  })

  it('admits a visitor before Auth and rejects failed Auth before profile or Storage work', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    visitor = 'deny'
    let response = await PUT(upload())
    expect([response.status, response.headers.get('retry-after')]).toEqual([429, '17'])
    expect(calls.map(call => call.url)).toHaveLength(1)
    visitor = 'allow'; calls = []
    authStatus = 401
    response = await PUT(upload())
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(calls.some(call => call.url.includes('/rest/v1/profiles?') || call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('maps missing session and Auth provider failures without returning provisional cookies', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const missing = await PUT(upload({ cookie: '' }))
    expect(missing.status).toBe(401)
    expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(false)
    for (const [providerStatus, expected] of [[429, 429], [500, 503]] as const) {
      calls = []; authStatus = providerStatus
      const response = await PUT(upload())
      expect(response.status).toBe(expected)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(calls.some(call => call.url.includes('/rest/v1/profiles?') || call.url.includes('/storage/v1/'))).toBe(false)
    }
  })

  it('treats malformed successful Auth identities as provider uncertainty after a staged refresh', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    refreshedToken = 'rotated.checked.token'
    for (const malformed of [{}, { id: 23 }, { id: 'NOT-A-CANONICAL-UUID' }]) {
      calls = []; authBody = malformed
      const response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(calls.some(call => call.url.includes('/auth/v1/token?grant_type=refresh_token'))).toBe(true)
      expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(true)
      expect(calls.some(call => call.url.includes('/rest/v1/profiles?') || call.url.includes('/storage/v1/'))).toBe(false)
    }
  })

  it('treats unexpected Auth redirect status as provider uncertainty', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    authStatus = 302
    const response = await PUT(upload())
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(calls.some(call => call.url.includes('/rest/v1/profiles?') || call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('cancels a rejected upload without reading or decoding its body after a user quota denial', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    let pulled = 0
    let cancelled = 0
    const body = new ReadableStream<Uint8Array>({ pull() { pulled++ }, cancel() { cancelled++ } }, { highWaterMark: 0 })
    quota = 'deny'
    const response = await PUT(upload({ body }))
    expect(response.status).toBe(429)
    expect(pulled).toBe(0)
    expect(cancelled).toBe(1)
    expect(calls.some(call => call.url.includes('/rest/v1/profiles?') || call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('uses separate five-per-minute upload/delete and sixty-per-minute read user namespaces', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    quota = 'deny'
    const userDigests: string[] = []
    for (const [invoke, expectedRpc] of [
      [() => PUT(upload()), 'consume_website_callback_limit'],
      [() => DELETE(deletion()), 'consume_website_callback_limit'],
      [() => GET(read(), { params: Promise.resolve({ ownerId: owner }) }), 'consume_website_account_limit'],
    ] as const) {
      calls = []
      const response = await invoke()
      expect([response.status, response.headers.get('retry-after')]).toEqual([429, '17'])
      const quotaCall = calls.at(-1)!
      expect(quotaCall.url).toContain(expectedRpc)
      userDigests.push(JSON.parse(String(quotaCall.init.body)).p_visitor_hash)
      expect(calls.some(call => call.url.includes('/storage/v1/') || call.url.includes('/rest/v1/profiles?'))).toBe(false)
    }
    expect(userDigests).toEqual(['upload', 'delete', 'read'].map(action =>
      createHmac('sha256', 'a'.repeat(32)).update(`website-photo-${action}:v1:${owner}`).digest('hex')))
  })

  it('blocks privileged writes for a missing owner profile and never retries uncertain mutations', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    profile = []
    expect((await PUT(upload())).status).toBe(404)
    expect(calls.some(call => call.url.includes('/storage/v1/'))).toBe(false)
    calls = []; profile = [{ id: owner }]; uploadReply = json({ unexpected: true })
    expect((await PUT(upload())).status).toBe(503)
    expect(calls.filter(call => call.url.includes('/storage/v1/object/'))).toHaveLength(1)
    calls = []; deleteReply = json({ unexpected: true })
    expect((await DELETE(deletion())).status).toBe(503)
    expect(calls.filter(call => call.url.includes('/storage/v1/object/'))).toHaveLength(1)
  })

  it('rejects typed invalid uploads without Storage work', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const response = await PUT(upload({ body: new Uint8Array([1, 2, 3]) }))
    expect(response.status).toBe(422)
    expect(calls.some(call => call.url.includes('/storage/v1/'))).toBe(false)
  })

  it('serves original validated bytes privately after full authenticated read even with range and validators', async () => {
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const response = await GET(read({ headers: { range: 'bytes=0-1', 'if-none-match': 'old' } }), { params: Promise.resolve({ ownerId: owner }) })
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    for (const name of ['etag', 'last-modified', 'content-range']) expect(response.headers.get(name)).toBeNull()
    const storage = calls.find(call => call.url.includes('/storage/v1/object/authenticated/'))!
    expect(storage.url).toBe(`${project}/storage/v1/object/authenticated/profile-photos/${owner}/avatar`)
    const headers = new Headers(storage.init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(headers.get('apikey')).toBe('sb_publishable_testvalue')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('range')).toBeNull()
    expect(calls.some(call => call.url.includes('/auth/v1/user'))).toBe(true)
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

  it('confirms fixed-key DELETE without reading an image body', async () => {
    const { DELETE } = await import('../app/api/account/profile/photo/route')
    const response = await DELETE(deletion())
    expect([response.status, await response.json()]).toEqual([200, { ok: true }])
    const mutation = calls.find(call => call.url.includes('/storage/v1/object/profile-photos/'))!
    expect(mutation.url).toBe(`${project}/storage/v1/object/profile-photos/${owner}/avatar`)
    expect(mutation.init.method).toBe('DELETE')
    expect(new Headers(mutation.init.headers).get('apikey')).toBe('sb_secret_test_service_key')
  })

  it('preserves refreshed cookies after verification on downstream denial and drops them after failed verification', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    refreshedToken = 'rotated.checked.token'
    profile = []
    let response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    const auth = calls.find(call => call.url.includes('/auth/v1/user'))!
    expect(new Headers(auth.init.headers).get('authorization')).toBe(`Bearer ${refreshedToken}`)
    expect(new Headers(calls.find(call => call.url.includes('/rest/v1/profiles?'))!.init.headers).get('authorization')).toBe(`Bearer ${refreshedToken}`)
    profile = [{ id: owner }]
    quota = 'deny'; calls = []
    response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
    expect(response.status).toBe(429)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    quota = 'allow'; uploadReply = json({ unexpected: true }); calls = []
    response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    uploadReply = json({ Key: `profile-photos/${owner}/avatar` }); calls = []
    response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    calls = []; authStatus = 401
    response = await PUT(upload({ cookie: cookie(token, forged, 1) }))
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('holds upload capacity through Storage acknowledgement while GET, raw and PUT contenders do no image work', async () => {
    const { PUT, DELETE } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = barrier(); const release = barrier()
    storageHold = { kind: 'upload', entered: entered.open, wait: release.wait }
    refreshedToken = 'rotated.checked.token'
    const first = PUT(upload({ cookie: cookie(token, forged, 1) }))
    try {
      await entered.wait
      const contender = pendingUpload()
      const rejected = await PUT(upload({ body: contender.request.body!, cookie: cookie(token, forged, 1) }))
      expect([rejected.status, rejected.headers.get('retry-after')]).toEqual([503, '60'])
      expect(rejected.headers.get('set-cookie')).toContain('Secure')
      expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
      expect((await PUT(upload({ headers: { origin: 'https://other.test' } }))).status).toBe(403)
      authStatus = 401
      expect((await PUT(upload())).status).toBe(401)
      authStatus = 200
      profile = []
      expect((await PUT(upload())).status).toBe(404)
      profile = [{ id: owner }]
      const readsBefore = calls.filter(call => call.url.includes('/storage/v1/object/authenticated/')).length
      expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(503)
      expect(calls.filter(call => call.url.includes('/storage/v1/object/authenticated/'))).toHaveLength(readsBefore)
      const raw = pendingUpload()
      await expect(validateProfilePhoto(raw.request)).rejects.toMatchObject({ status: 503 })
      expect([raw.pulls, raw.cancellations]).toEqual([0, 1])
      expect((await DELETE(deletion())).status).toBe(200)
      release.open()
      expect((await first).status).toBe(200)
      expect((await PUT(upload())).status).toBe(200)
    } finally { release.open(); storageHold = null }
  })

  it('holds GET capacity before download and releases it for unread response ownership', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const { validateProfilePhoto } = await import('../lib/server/profile-photo')
    const entered = barrier(); const release = barrier()
    storageHold = { kind: 'read', entered: entered.open, wait: release.wait }
    const first = GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    try {
      await entered.wait
      const contender = pendingUpload()
      expect((await PUT(contender.request)).status).toBe(503)
      expect([contender.pulls, contender.cancellations]).toEqual([0, 1])
      const raw = pendingUpload()
      await expect(validateProfilePhoto(raw.request)).rejects.toMatchObject({ status: 503 })
      expect([raw.pulls, raw.cancellations]).toEqual([0, 1])
      const before = calls.filter(call => call.url.includes('/storage/v1/object/authenticated/')).length
      expect((await GET(read(), { params: Promise.resolve({ ownerId: owner }) })).status).toBe(503)
      expect(calls.filter(call => call.url.includes('/storage/v1/object/authenticated/'))).toHaveLength(before)
      release.open()
      const unread = await first
      expect(unread.status).toBe(200)
      storageHold = null
      expect((await PUT(upload())).status).toBe(200)
      expect(new Uint8Array(await unread.arrayBuffer())).toEqual(photo)
    } finally { release.open(); storageHold = null }
  })

  it('restores capacity after missing, corrupt and unavailable downloads and rejected uploads', async () => {
    const { PUT } = await import('../app/api/account/profile/photo/route')
    const { GET } = await import('../app/api/profiles/[ownerId]/photo/route')
    const get = () => GET(read(), { params: Promise.resolve({ ownerId: owner }) })
    for (const [reply, expected] of [
      [json({ statusCode: '404', code: 'NoSuchKey', error: 'not_found' }, 400), 404],
      [new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }), 503],
      [json({ private: 'provider failure' }, 500), 503],
    ] as const) {
      photoRead = reply
      expect((await get()).status).toBe(expected)
      expect((await PUT(upload())).status).toBe(200)
    }
    photoRead = new Response(photo.slice(), { headers: { 'content-type': 'image/png' } })
    uploadReply = json({ unexpected: true })
    expect((await PUT(upload())).status).toBe(503)
    expect((await get()).status).toBe(200)
  })
})
