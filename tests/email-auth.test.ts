// Exercise the real email routes and admission code while replacing external RPC and Auth operations.
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setAll: undefined as undefined | ((cookies: { name: string; value: string; options?: { path?: string; secure?: boolean; sameSite?: 'lax' } }[]) => void),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    state.setAll = options.cookies.setAll
    return { auth: { signInWithOtp: state.signInWithOtp, verifyOtp: state.verifyOtp } }
  }),
}))

const key = 'a'.repeat(32)
const rpcReply = (allowed = true, retry = 0) => new Response(JSON.stringify({ allowed, retry_after_seconds: retry }), { status: 200 })
const request = (path: 'request' | 'verify', body: BodyInit = JSON.stringify({ email: ' Person@Example.COM ', ...(path === 'verify' ? { code: '001234' } : {}) }), headers: Record<string, string> = {}) => new NextRequest(`https://ante.test/auth/email/${path}`, {
  method: 'POST',
  headers: { origin: 'https://ante.test', host: 'ante.test', 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', ...headers },
  body,
  ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
} as NonNullable<ConstructorParameters<typeof NextRequest>[1]>)

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = key
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  vi.stubGlobal('fetch', vi.fn(async () => rpcReply()))
  state.signInWithOtp.mockReset().mockResolvedValue({ data: { user: null, session: null }, error: null })
  state.verifyOtp.mockReset().mockResolvedValue({ data: { user: null, session: null }, error: { status: 400, message: 'invalid' } })
  state.setAll = undefined
  vi.mocked(createServerClient).mockClear()
})

describe('email OTP routes', () => {
  it('rejects hostile or missing Origin and Host before admission or Auth', async () => {
    const { POST } = await import('../app/auth/email/request/route')
    for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { origin: '' }, { host: 'evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }] as Record<string, string>[]) {
      const response = await POST(request('request', undefined, headers))
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
    const missingOrigin = new NextRequest('https://ante.test/auth/email/request', {
      method: 'POST', headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10' }, body: JSON.stringify({ email: 'person@example.com' }),
    })
    expect((await POST(missingOrigin)).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('consumes the IP bucket before reading a body and reports denial', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rpcReply(false, 12)))
    const body = new ReadableStream({ pull() { throw new Error('body was read') } })
    const { POST } = await import('../app/auth/email/request/route')
    const response = await POST(request('request', body))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('shares one normalized email bucket across request and verify despite different IPs', async () => {
    const { POST: requestPost } = await import('../app/auth/email/request/route')
    const { POST: verifyPost } = await import('../app/auth/email/verify/route')
    expect((await requestPost(request('request'))).status).toBe(202)
    expect((await verifyPost(request('verify', JSON.stringify({ email: 'person@example.com', code: '001234' }), { 'cf-connecting-ip': '198.51.100.20' }))).status).toBe(401)
    const calls = vi.mocked(fetch).mock.calls
    expect(calls).toHaveLength(4)
    const digests = calls.map((call) => JSON.parse(String(call[1]?.body)).p_visitor_hash)
    expect(digests[0]).not.toBe(digests[1])
    expect(digests[1]).toBe(digests[3])
    expect(digests[1]).toBe(createHmac('sha256', key).update('website-auth-email:v1:person@example.com').digest('hex'))
    expect(JSON.stringify(calls)).not.toContain('person@example.com')
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: 'person@example.com', options: { shouldCreateUser: true } })
    expect(state.verifyOtp).toHaveBeenCalledWith({ email: 'person@example.com', token: '001234', type: 'email' })
  })

  it('rejects streamed oversize input, malformed JSON and unexpected fields before Auth', async () => {
    const { POST } = await import('../app/auth/email/request/route')
    const streamed = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4090)); controller.enqueue(new Uint8Array(10)); controller.close() } })
    expect((await POST(request('request', streamed))).status).toBe(413)
    expect((await POST(request('request', '{'))).status).toBe(400)
    expect((await POST(request('request', JSON.stringify({ email: 'person@example.com', redirectTo: 'https://evil.test' })))).status).toBe(400)
    expect((await POST(request('request', new Uint8Array([0xff])))).status).toBe(400)
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it('rejects wrong content type and malformed email or code', async () => {
    const { POST: requestPost } = await import('../app/auth/email/request/route')
    const { POST: verifyPost } = await import('../app/auth/email/verify/route')
    expect((await requestPost(request('request', '{}', { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await requestPost(request('request', JSON.stringify({ email: 'bad @example.com' })))).status).toBe(400)
    expect((await verifyPost(request('verify', JSON.stringify({ email: 'person@example.com', code: 123456 })))).status).toBe(400)
    expect((await verifyPost(request('verify', JSON.stringify({ email: 'person@example.com', code: '12345a' })))).status).toBe(400)
    expect(state.verifyOtp).not.toHaveBeenCalled()
  })

  it('stops before Auth on denied email quota or unavailable store', async () => {
    const store = vi.fn().mockResolvedValueOnce(rpcReply()).mockResolvedValueOnce(rpcReply(false, 9))
    vi.stubGlobal('fetch', store)
    const { POST } = await import('../app/auth/email/request/route')
    const denied = await POST(request('request'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('9')
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    store.mockReset().mockResolvedValueOnce(rpcReply()).mockRejectedValueOnce(new Error('private store detail'))
    const unavailable = await POST(request('request'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it('returns generic request success for ordinary provider rejection and no provider data', async () => {
    state.signInWithOtp.mockResolvedValue({ data: { user: { id: 'private-user' }, session: { access_token: 'private-token' } }, error: { status: 400, message: 'account detail' } })
    const { POST } = await import('../app/auth/email/request/route')
    const response = await POST(request('request'))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('does not return provisional cookies from a code request', async () => {
    state.signInWithOtp.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'provisional-token', options: { path: '/' } }])
      return { data: { user: null, session: null }, error: null }
    })
    const { POST } = await import('../app/auth/email/request/route')
    const response = await POST(request('request'))
    expect(response.status).toBe(202)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('maps provider throttles and transport failures to safe retry responses', async () => {
    const { POST } = await import('../app/auth/email/request/route')
    state.signInWithOtp.mockResolvedValue({ data: null, error: { status: 429, message: 'private throttle detail' } })
    const throttled = await POST(request('request'))
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('retry-after')).toBe('60')
    state.signInWithOtp.mockRejectedValue(new Error('private network detail'))
    const unavailable = await POST(request('request'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    state.signInWithOtp.mockResolvedValue({ data: null, error: { status: 0, message: 'network failed' } })
    expect((await POST(request('request'))).status).toBe(503)
  })

  it('requires a provider session and user and discards provisional cookies on failure', async () => {
    state.verifyOtp.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'provisional-token', options: { path: '/' } }])
      return { data: { user: { id: 'person' }, session: null }, error: null }
    })
    const { POST } = await import('../app/auth/email/verify/route')
    const response = await POST(request('verify'))
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).not.toHaveProperty('session')
  })

  it('maps invalid codes, provider throttle and unavailable verification without leaking cookies', async () => {
    const { POST } = await import('../app/auth/email/verify/route')
    state.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { status: 400, message: 'private invalid code' } })
    expect((await POST(request('verify'))).status).toBe(401)
    state.verifyOtp.mockResolvedValue({ data: null, error: { status: 429, message: 'private throttle detail' } })
    const throttled = await POST(request('verify'))
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('retry-after')).toBe('60')
    expect(throttled.headers.get('set-cookie')).toBeNull()
    state.verifyOtp.mockRejectedValue(new Error('private provider failure'))
    const unavailable = await POST(request('verify'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(unavailable.headers.get('set-cookie')).toBeNull()
  })

  it('returns only ok with secure SSR cookies after successful verification', async () => {
    state.verifyOtp.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'private-access-token', options: { path: '/' } }, { name: 'sb-test-refresh-token', value: 'private-refresh-token', options: { path: '/' } }])
      return { data: { user: { id: 'person' }, session: { access_token: 'private-access-token', refresh_token: 'private-refresh-token' } }, error: null }
    })
    const { POST } = await import('../app/auth/email/verify/route')
    const response = await POST(request('verify'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('private-access-token')
    expect(response.cookies.get('sb-test-refresh-token')?.value).toBe('private-refresh-token')
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).not.toContain('Domain=')
    }
  })
})
