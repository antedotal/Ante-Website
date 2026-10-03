// Exercise the real account preset routes while replacing only external Auth and RPC calls.
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

const valid = { easy_cents: 100, medium_cents: 2500, hard_cents: 5000 }
const saved = { currency: 'AUD', ...valid, updated_at: '2026-09-25T10:00:00+00:00' }
const call = (method: 'GET' | 'PUT' | 'HEAD' | 'OPTIONS' | 'POST' | 'PATCH' | 'DELETE', body: BodyInit = JSON.stringify(valid), headers: Record<string, string> = {}, suffix = '') => new NextRequest(`https://ante.test/api/account/ante-presets${suffix}`, {
  method,
  headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10', ...(method === 'PUT' ? { origin: 'https://ante.test', 'content-type': 'application/json' } : {}), ...headers },
  ...(method === 'PUT' ? { body } : {}),
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
  state.rpc.mockReset().mockResolvedValue({ data: { ok: true, presets: saved }, error: null })
  state.setAll = undefined
  vi.mocked(createServerClient).mockClear()
})

describe('account preset API', () => {
  it('returns private 405 for every other Next method without Auth or RPC', async () => {
    const handlers = autoImplementMethods(await import('../app/api/account/ante-presets/route'))
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'] as const) {
      const response = await handlers[method](call(method), {} as never) as Response
      expect(response.status).toBe(405)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('allow')).toBe('GET, PUT')
      expect(await response.text()).toBe('')
    }
    expect(createServerClient).not.toHaveBeenCalled()
    expect(state.getUser).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('rejects hostile canonical headers, missing PUT Origin, and selectors before Auth', async () => {
    const { GET, PUT } = await import('../app/api/account/ante-presets/route')
    for (const method of ['GET', 'PUT'] as const) {
      const route = method === 'GET' ? GET : PUT
      const hostileHeaders: Record<string, string>[] = [{ host: 'evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }, { origin: 'https://evil.test' }, { origin: 'null' }]
      for (const headers of hostileHeaders) {
        expect((await route(call(method, undefined, headers))).status).toBe(403)
      }
      expect((await route(call(method, undefined, {}, '?owner=other'))).status).toBe(400)
    }
    expect((await PUT(call('PUT', undefined, { origin: '' }))).status).toBe(403)
    expect(createServerClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed with retry guidance when public account config is invalid', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { GET, PUT } = await import('../app/api/account/ante-presets/route')
    for (const response of [await GET(call('GET')), await PUT(call('PUT'))]) {
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(response.headers.get('cache-control')).toContain('private, no-store')
    }
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('rejects malformed, extra-key, wrong MIME and streamed oversized writes before Auth', async () => {
    const { PUT } = await import('../app/api/account/ante-presets/route')
    const bad = [
      '{', JSON.stringify({ ...valid, owner_id: 'other' }), JSON.stringify({ ...valid, hard_cents: '5000' }),
      JSON.stringify({ ...valid, easy_cents: 99 }), JSON.stringify({ ...valid, medium_cents: 5001 }),
      JSON.stringify({ ...valid, medium_cents: 250.5 }), JSON.stringify([valid]),
    ]
    for (const body of bad) expect((await PUT(call('PUT', body))).status).toBe(400)
    expect((await PUT(call('PUT', '{}', { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await PUT(call('PUT', new Uint8Array([0xff])))).status).toBe(400)
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4090)); controller.enqueue(new Uint8Array(10)); controller.close() } })
    expect((await PUT(call('PUT', stream))).status).toBe(413)
    expect(createServerClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops before SSR and Auth when account admission denies or fails', async () => {
    const { GET } = await import('../app/api/account/ante-presets/route')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 11 }))))
    const denied = await GET(call('GET'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('11')
    expect(denied.headers.get('set-cookie')).toBeNull()
    delete process.env.ANTE_AUTH_INGRESS
    const unavailable = await GET(call('GET'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(createServerClient).not.toHaveBeenCalled()
    expect(state.getUser).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reads unset preferences and writes arbitrary valid tiers with exact RPC arguments', async () => {
    const { GET, PUT } = await import('../app/api/account/ante-presets/route')
    state.rpc.mockResolvedValueOnce({ data: { ok: true, presets: null }, error: null })
    const unset = await GET(call('GET'))
    expect(unset.status).toBe(200)
    expect(await unset.json()).toEqual({ ok: true, presets: null })
    const response = await PUT(call('PUT'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, presets: saved })
    expect(state.rpc.mock.calls).toEqual([
      ['get_my_ante_presets'],
      ['set_my_ante_presets', { p_easy_cents: 100, p_medium_cents: 2500, p_hard_cents: 5000 }],
    ])
    expect(response.headers.get('cache-control')).toContain('private, no-store')
  })

  it('accepts inverted and equal tier amounts without imposing an order', async () => {
    const { PUT } = await import('../app/api/account/ante-presets/route')
    const inverted = { easy_cents: 5000, medium_cents: 100, hard_cents: 100 }
    const equal = { easy_cents: 350, medium_cents: 350, hard_cents: 350 }
    state.rpc.mockResolvedValueOnce({ data: { ok: true, presets: { currency: 'AUD', ...inverted, updated_at: saved.updated_at } }, error: null })
    state.rpc.mockResolvedValueOnce({ data: { ok: true, presets: { currency: 'AUD', ...equal, updated_at: saved.updated_at } }, error: null })
    expect((await PUT(call('PUT', JSON.stringify(inverted)))).status).toBe(200)
    expect((await PUT(call('PUT', JSON.stringify(equal)))).status).toBe(200)
    expect(state.rpc.mock.calls).toEqual([
      ['set_my_ante_presets', { p_easy_cents: 5000, p_medium_cents: 100, p_hard_cents: 100 }],
      ['set_my_ante_presets', { p_easy_cents: 350, p_medium_cents: 350, p_hard_cents: 350 }],
    ])
  })

  it('returns 401 without RPC or provisional cookies for invalid identity', async () => {
    const { GET } = await import('../app/api/account/ante-presets/route')
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

  it('maps Auth throttles and transport failures without RPC calls', async () => {
    const { GET } = await import('../app/api/account/ante-presets/route')
    state.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 429, message: 'secret' } })
    const throttle = await GET(call('GET'))
    expect(throttle.status).toBe(429)
    expect(throttle.headers.get('retry-after')).toBe('60')
    state.getUser.mockRejectedValueOnce(new Error('private network'))
    const unavailable = await GET(call('GET'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('maps exact RPC denial and SQL states while retaining verified refresh cookies', async () => {
    const { GET, PUT } = await import('../app/api/account/ante-presets/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'rotated-secret', options: { path: '/' } }])
      return { data: { user: { id: 'verified-user' } }, error: null }
    })
    state.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'rate_limited', retry_after_seconds: 7 }, error: null })
    const denied = await GET(call('GET'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('7')
    expect(denied.headers.get('set-cookie')).toContain('rotated-secret')
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'private' } })
    expect((await PUT(call('PUT'))).status).toBe(400)
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: '28000', message: 'private' } })
    expect((await GET(call('GET'))).status).toBe(401)
    state.rpc.mockRejectedValueOnce(new Error('private transport'))
    const unavailable = await GET(call('GET'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('60')
    expect(unavailable.headers.get('set-cookie')).toContain('rotated-secret')
  })

  it('maps a PostgREST response-envelope HTTP 429 and retains verified refresh cookies', async () => {
    const { GET } = await import('../app/api/account/ante-presets/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'rotated-secret', options: { path: '/' } }])
      return { data: { user: { id: 'verified-user' } }, error: null }
    })
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: '429', message: 'private', details: null, hint: null }, status: 429, statusText: 'Too Many Requests', count: null })
    const response = await GET(call('GET'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('set-cookie')).toContain('rotated-secret')
    expect(JSON.stringify(await response.json())).not.toContain('private')
  })

  it('rejects malformed successful RPC payloads without exposing provider fields', async () => {
    const { GET, PUT } = await import('../app/api/account/ante-presets/route')
    for (const malformed of [
      { ok: true, presets: { ...saved, owner_id: 'private-user' } },
      { ok: true, presets: { ...saved, currency: 'USD' } },
      { ok: true, presets: { ...saved, updated_at: '2026-09-25' } },
      { ok: false, error: 'rate_limited', retry_after_seconds: 61 },
      { ok: true, presets: null, provider: 'secret' },
    ]) {
      state.rpc.mockResolvedValueOnce({ data: malformed, error: null })
      const response = await GET(call('GET'))
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(JSON.stringify(await response.json())).not.toContain('private-user')
    }
    state.rpc.mockResolvedValueOnce({ data: { ok: true, presets: null }, error: null })
    expect((await PUT(call('PUT'))).status).toBe(503)
  })

  it('returns secure refreshed cookies after verified success without leaking tokens in the body', async () => {
    const { PUT } = await import('../app/api/account/ante-presets/route')
    state.getUser.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-test-auth-token', value: 'rotated-secret', options: { path: '/' } }])
      return { data: { user: { id: 'verified-user' } }, error: null }
    })
    const response = await PUT(call('PUT'))
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('set-cookie')).toContain('Path=/')
    expect(JSON.stringify(await response.json())).not.toContain('rotated-secret')
  })
})
