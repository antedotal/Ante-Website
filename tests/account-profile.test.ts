// Exercise the actual profile route; only Supabase Auth, RPC, and admission transport are external doubles.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  setAll: undefined as undefined | ((cookies: { name: string; value: string; options?: { path?: string } }[]) => void),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    state.setAll = options.cookies.setAll
    return { auth: { getUser: state.getUser }, rpc: state.rpc }
  }),
}))

const saved = { full_name: 'Ari Example', updated_at: '2026-09-25T10:00:00+00:00' }
const call = (method: 'GET' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'DELETE', body: BodyInit = JSON.stringify({ full_name: saved.full_name }), headers: Record<string, string> = {}, suffix = '') => new NextRequest(`https://ante.test/api/account/profile${suffix}`, {
  method,
  headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10', ...(method === 'PATCH' ? { origin: 'https://ante.test', 'content-type': 'application/json' } : {}), ...headers },
  ...(method === 'PATCH' ? { body } : {}),
  ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
} as NonNullable<ConstructorParameters<typeof NextRequest>[1]>)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }))))
  state.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })
  state.rpc.mockReset().mockResolvedValue({ data: { ok: true, profile: saved }, error: null })
  state.setAll = undefined
  vi.mocked(createServerClient).mockClear()
})

describe('account profile API', () => {
  it('returns private bodyless 405 for all other methods before admission or Auth', async () => {
    const handlers = autoImplementMethods(await import('../app/api/account/profile/route'))
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE'] as const) {
      const response = await handlers[method](call(method), {} as never) as Response
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET, PATCH')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.text()).toBe('')
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('checks canonical host, forwarded headers, Origin, and query selectors before admission', async () => {
    const { GET, PATCH } = await import('../app/api/account/profile/route')
    for (const method of ['GET', 'PATCH'] as const) {
      const route = method === 'GET' ? GET : PATCH
      const hostileHeaders: Record<string, string>[] = [{ host: 'evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }, { origin: 'https://evil.test' }, { origin: 'null' }]
      for (const headers of hostileHeaders) {
        expect((await route(call(method, undefined, headers))).status).toBe(403)
      }
      expect((await route(call(method, undefined, {}, '?user_id=other'))).status).toBe(400)
    }
    expect((await PATCH(call('PATCH', undefined, { origin: '' }))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('fails closed when public account configuration or visitor admission is unavailable', async () => {
    const { GET } = await import('../app/api/account/profile/route')
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    let response = await GET(call('GET'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
    delete process.env.ANTE_AUTH_INGRESS
    response = await GET(call('GET'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(createServerClient).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed and owner-selecting PATCH bodies before admission or Auth', async () => {
    const { PATCH } = await import('../app/api/account/profile/route')
    for (const body of ['{', '[]', '{}', 'null', JSON.stringify({ full_name: 'A', user_id: 'other' }), JSON.stringify({ full_name: 12 }), JSON.stringify({ full_name: '' }), JSON.stringify({ full_name: '   ' }), JSON.stringify({ full_name: 'A'.repeat(121) }), JSON.stringify({ full_name: 'A\u0000B' }), JSON.stringify({ full_name: 'A\u0080B' }), JSON.stringify({ full_name: '\ud800' }), JSON.stringify({ full_name: '\udc00' })]) {
      expect((await PATCH(call('PATCH', body))).status).toBe(400)
    }
    expect((await PATCH(call('PATCH', '{}', { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await PATCH(call('PATCH', '{}', { 'content-length': '4097' }))).status).toBe(413)
    expect((await PATCH(call('PATCH', new Uint8Array([0xff])))).status).toBe(400)
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4090)); controller.enqueue(new Uint8Array(10)); controller.close() } })
    expect((await PATCH(call('PATCH', stream))).status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('reads null and legacy names unchanged with owner-derived no-argument RPC', async () => {
    const { GET } = await import('../app/api/account/profile/route')
    state.rpc.mockResolvedValueOnce({ data: { ok: true, profile: { full_name: null, updated_at: null } }, error: null })
    const unset = await GET(call('GET'))
    expect(await unset.json()).toEqual({ ok: true, profile: { full_name: null, updated_at: null } })
    const legacy = '  '+ '界'.repeat(121) + '  '
    state.rpc.mockResolvedValueOnce({ data: { ok: true, profile: { full_name: legacy, updated_at: null } }, error: null })
    const response = await GET(call('GET'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, profile: { full_name: legacy, updated_at: null } })
    expect(state.rpc.mock.calls).toEqual([['get_my_profile_name'], ['get_my_profile_name']])
  })

  it('writes Unicode, emoji, punctuation, and 120 code points with only ASCII edge spaces trimmed', async () => {
    const { PATCH } = await import('../app/api/account/profile/route')
    const names = [' O’Neill-Smith! ', ' 山田 😀 ', 'A'.repeat(119) + '😀', '\u00a0A\u00a0']
    for (const raw of names) {
      const normalized = raw.replace(/^ +| +$/g, '')
      state.rpc.mockResolvedValueOnce({ data: { ok: true, profile: { full_name: normalized, updated_at: saved.updated_at } }, error: null })
      const response = await PATCH(call('PATCH', JSON.stringify({ full_name: raw })))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, profile: { full_name: normalized, updated_at: saved.updated_at } })
    }
    expect(state.rpc.mock.calls).toEqual(names.map(raw => ['set_my_profile_name', { p_full_name: raw.replace(/^ +| +$/g, '') }]))
  })

  it('denies admission before constructing SSR and Auth', async () => {
    const { GET } = await import('../app/api/account/profile/route')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 11 }))))
    const response = await GET(call('GET'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('11')
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('rejects invalid identity and discards provisional refresh cookies', async () => {
    const { GET } = await import('../app/api/account/profile/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'provisional-secret', options: { path: '/' } }])
      return { data: { user: null }, error: { status: 401, message: 'private' } }
    })
    const response = await GET(call('GET'))
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(state.rpc).not.toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toContain('private')
  })

  it('maps Auth throttling and network failure before RPC', async () => {
    const { GET } = await import('../app/api/account/profile/route')
    state.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 429, message: 'private' } })
    expect((await GET(call('GET'))).status).toBe(429)
    state.getUser.mockRejectedValueOnce(new Error('private transport'))
    const unavailable = await GET(call('GET'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('maps exact quota, missing identity/profile, invalid input, and provider errors with verified cookies', async () => {
    const { GET, PATCH } = await import('../app/api/account/profile/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'rotated-secret', options: { path: '/' } }])
      return { data: { user: { id: 'verified-user' } }, error: null }
    })
    state.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'rate_limited', retry_after_seconds: 7 }, error: null })
    const denied = await GET(call('GET'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('7')
    expect(denied.headers.get('set-cookie')).toContain('rotated-secret')
    for (const [code, status] of [['28000', 401], ['P0002', 404], ['22023', 400]] as const) {
      state.rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'private' } })
      expect((await PATCH(call('PATCH'))).status).toBe(status)
    }
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: '429', message: 'private', details: null, hint: null }, status: 429, statusText: 'Too Many Requests', count: null })
    const throttle = await GET(call('GET'))
    expect(throttle.status).toBe(429)
    expect(throttle.headers.get('retry-after')).toBe('60')
    expect(throttle.headers.get('set-cookie')).toContain('rotated-secret')
    expect(JSON.stringify(await throttle.json())).not.toContain('private')
    state.rpc.mockRejectedValueOnce(new Error('private transport'))
    const unavailable = await GET(call('GET'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(unavailable.headers.get('set-cookie')).toContain('rotated-secret')
  })

  it('rejects malformed DTO, private fields, invalid timestamp, and mismatched PATCH result', async () => {
    const { GET, PATCH } = await import('../app/api/account/profile/route')
    for (const malformed of [
      { ok: true, profile: { ...saved, email: 'private@example.test' } },
      { ok: true, profile: { ...saved, updated_at: '2026-09-25' } },
      { ok: true, profile: { full_name: 12, updated_at: null } },
      { ok: true, profile: saved, provider: 'secret' },
      { ok: false, error: 'rate_limited', retry_after_seconds: 61 },
    ]) {
      state.rpc.mockResolvedValueOnce({ data: malformed, error: null })
      const response = await GET(call('GET'))
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(JSON.stringify(await response.json())).not.toContain('private@example.test')
    }
    for (const profile of [{ full_name: null, updated_at: null }, { full_name: saved.full_name, updated_at: null }, { full_name: 'different', updated_at: saved.updated_at }]) {
      state.rpc.mockResolvedValueOnce({ data: { ok: true, profile }, error: null })
      expect((await PATCH(call('PATCH'))).status).toBe(503)
    }
  })

  it('returns secure verified refresh cookies after success without writing Auth metadata', async () => {
    const { PATCH } = await import('../app/api/account/profile/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'rotated-secret', options: { path: '/' } }])
      return { data: { user: { id: 'verified-user' } }, error: null }
    })
    const response = await PATCH(call('PATCH'))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('set-cookie')).toContain('Path=/')
    expect(JSON.stringify(await response.json())).not.toContain('rotated-secret')
    expect(state.rpc.mock.calls).toEqual([['set_my_profile_name', { p_full_name: saved.full_name }]])
  })
})
