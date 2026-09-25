// Exercise the actual account routes and cookie adapter while replacing only external Auth calls.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServerClient } from '@supabase/ssr'

vi.mock('server-only', () => ({}))

const callbackRequest = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, {
  headers: { 'cf-connecting-ip': '192.0.2.10', ...headers },
})

const state = vi.hoisted(() => ({
  getClaims: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setAll: undefined as undefined | ((cookies: { name: string; value: string; options?: { path?: string } }[]) => void),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    state.setAll = options.cookies.setAll
    return { auth: { getClaims: state.getClaims, exchangeCodeForSession: state.exchangeCodeForSession } }
  }),
  createBrowserClient: vi.fn(() => ({ auth: {} })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })))
  state.getClaims.mockReset()
  state.exchangeCodeForSession.mockReset()
  state.setAll = undefined
  vi.mocked(createServerClient).mockClear()
})

describe('account session', () => {
  it('uses the shared Auth boundary in server, callback, and proxy SSR constructors', async () => {
    const { createClient, createCallbackClient } = await import('../lib/supabase/server')
    await createClient()
    const serverFetch = vi.mocked(createServerClient).mock.lastCall?.[2]?.global?.fetch
    createCallbackClient(new NextRequest('https://ante.test/auth/callback'), NextResponse.next())
    const callbackFetch = vi.mocked(createServerClient).mock.lastCall?.[2]?.global?.fetch
    state.getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-id' } }, error: null })
    const { proxy } = await import('../proxy')
    await proxy(new NextRequest('https://ante.test/account', {
      headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10' },
    }))
    const proxyFetch = vi.mocked(createServerClient).mock.lastCall?.[2]?.global?.fetch
    const secret = 'private-provider@example.test secret-token-004321'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ msg: secret }), { status: 429 })))
    for (const fetcher of [serverFetch, callbackFetch, proxyFetch]) {
      expect(fetcher).toBeDefined()
      const auth = await fetcher!('https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/user')
      expect(auth.status).toBe(429)
      expect(await auth.text()).not.toContain(secret)
    }
  })

  it('propagates refreshed cookies and no-store headers to the server and browser', async () => {
    state.getClaims.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-project-auth-token', value: 'new-token', options: { path: '/' } }])
      return { data: { claims: { sub: 'user-1' } }, error: null }
    })
    const { proxy } = await import('../proxy')
    const request = new NextRequest('https://ante.test/account', { headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10' } })
    const response = await proxy(request)
    expect(request.cookies.get('sb-project-auth-token')?.value).toBe('new-token')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('new-token')
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
  })

  it('redirects to sign-in when claim verification throws on a malformed auth cookie', async () => {
    state.getClaims.mockRejectedValue(new Error('Missing exp claim'))
    const { proxy } = await import('../proxy')
    const response = await proxy(new NextRequest('https://ante.test/account', {
      headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10', cookie: 'sb-project-auth-token=malformed' },
    }))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://ante.test/account/sign-in')
    expect(response.headers.get('cache-control')).toContain('private, no-store')
  })

  it('keeps sign-in reachable when claim verification throws on a malformed cookie', async () => {
    state.getClaims.mockRejectedValue(new Error('Missing exp claim'))
    const { proxy } = await import('../proxy')
    const response = await proxy(new NextRequest('https://ante.test/account/sign-in', {
      headers: { host: 'ante.test', cookie: 'sb-project-auth-token=malformed' },
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(state.getClaims).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('validates protected account origin before admission and stops before Auth on denial', async () => {
    const { proxy } = await import('../proxy')
    for (const headers of [{ host: 'evil.test' }, { host: 'ante.test', 'x-forwarded-host': 'evil.test' }, { host: 'ante.test', origin: 'https://evil.test' }] as Record<string, string>[]) {
      expect((await proxy(new NextRequest('https://ante.test/account', { headers }))).status).toBe(403)
    }
    expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 9 }))))
    const response = await proxy(new NextRequest('https://ante.test/account', { headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10' } }))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('9')
    expect(state.getClaims).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('does not duplicate admission for account API routes if proxy is invoked directly', async () => {
    const { proxy } = await import('../proxy')
    const response = await proxy(new NextRequest('https://ante.test/api/account/ante-presets', { headers: { host: 'ante.test' } }))
    expect(response.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('refuses an account page when claims are absent or expired', async () => {
    state.getClaims.mockResolvedValue({ data: { claims: null }, error: new Error('expired') })
    const { default: AccountPage } = await import('../app/account/page')
    await expect(AccountPage()).rejects.toThrow('REDIRECT:/account/sign-in')
  })

  it('renders only verified account identity and no bearer token', async () => {
    state.getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-id', email: 'person@example.com', access_token: 'secret-access-token', refresh_token: 'secret-refresh-token' } }, error: null })
    const { default: AccountPage } = await import('../app/account/page')
    const html = renderToStaticMarkup(await AccountPage())
    expect(html).toContain('person@example.com')
    expect(html).not.toContain('secret-access-token')
    expect(html).not.toContain('secret-refresh-token')
  })

  it('exchanges one callback code and redirects to the fixed same-origin account path', async () => {
    state.exchangeCodeForSession.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-project-auth-token', value: 'exchanged-token', options: { path: '/' } }])
      return { data: { user: { id: 'verified-id' } }, error: null }
    })
    const { GET } = await import('../app/auth/callback/route')
    const response = await GET(callbackRequest('https://ante.test/auth/callback?code=valid&next=https://evil.example/'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://ante.test/account')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('exchanged-token')
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(state.exchangeCodeForSession).toHaveBeenCalledWith('valid')
    expect(response.headers.get('location')).not.toContain('valid')
  })

  it('fails closed on malformed and expired callbacks without leaking supplied tokens', async () => {
    const { GET } = await import('../app/auth/callback/route')
    const malformed = await GET(callbackRequest('https://ante.test/auth/callback?code=one&code=two&access_token=secret'))
    expect(malformed.headers.get('location')).toBe('https://ante.test/account/sign-in?error=invalid_callback')
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)

    state.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error('expired secret') })
    const expired = await GET(callbackRequest('https://ante.test/auth/callback?code=expired'))
    expect(expired.headers.get('location')).toBe('https://ante.test/account/sign-in?error=exchange_failed')
    expect(expired.headers.get('location')).not.toContain('secret')
  })

  it('preserves a provider rate-limit response with retry guidance and safe logging', async () => {
    state.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { status: 429, message: 'secret provider detail' } })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { GET } = await import('../app/auth/callback/route')
      const response = await GET(callbackRequest('https://ante.test/auth/callback?code=valid'))
      expect(response.status).toBe(429)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(warning).toHaveBeenCalledWith('Auth callback rate limited by Supabase')
    } finally {
      warning.mockRestore()
    }
  })

  it('rejects a callback presented on a hostile origin or Host header before code exchange', async () => {
    const { GET } = await import('../app/auth/callback/route')
    for (const request of [
      callbackRequest('https://evil.example/auth/callback?code=valid'),
      callbackRequest('https://ante.test/auth/callback?code=valid', { host: 'evil.example' }),
      callbackRequest('https://ante.test/auth/callback?code=valid', { 'x-forwarded-host': 'evil.example' }),
    ]) {
      const response = await GET(request)
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops callback authentication when the external admission store denies the visitor', async () => {
    const store = vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 12 }), { status: 200 }))
    vi.stubGlobal('fetch', store)
    const { GET } = await import('../app/auth/callback/route')
    const response = await GET(callbackRequest('https://ante.test/auth/callback?code=one&code=two'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(store).toHaveBeenCalledTimes(1)
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('does not construct an Auth client when admission is unavailable', async () => {
    delete process.env.ANTE_AUTH_INGRESS
    const { GET } = await import('../app/auth/callback/route')
    const response = await GET(callbackRequest('https://ante.test/auth/callback?code=valid'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it.each([
    ['NEXT_PUBLIC_SUPABASE_URL', undefined],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_wrong'],
    ['NEXT_PUBLIC_ANTE_SITE_ORIGIN', 'https://evil.example'],
  ] as const)('returns private 503 before external work for invalid account config %s', async (name, value) => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { GET } = await import('../app/auth/callback/route')
      const response = await GET(callbackRequest('https://ante.test/auth/callback?code=secret-code'))
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(response.headers.get('cache-control')).toContain('private')
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(await response.text()).not.toContain('secret-code')
      expect(fetch).not.toHaveBeenCalled()
      expect(createServerClient).not.toHaveBeenCalled()
      expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(/secret-code|sb_secret_wrong|evil\.example/)
    } finally {
      warning.mockRestore()
    }
  })

  it('does not refresh auth in proxy when the callback path is invoked directly', async () => {
    const { proxy } = await import('../proxy')
    await proxy(new NextRequest('https://ante.test/auth/callback?code=valid'))
    expect(state.getClaims).not.toHaveBeenCalled()
  })
})
