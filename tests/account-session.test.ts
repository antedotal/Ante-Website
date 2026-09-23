// Exercise the actual account routes and cookie adapter while replacing only external Auth calls.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'

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
  state.getClaims.mockReset()
  state.exchangeCodeForSession.mockReset()
  state.setAll = undefined
})

describe('account session', () => {
  it('propagates refreshed cookies and no-store headers to the server and browser', async () => {
    state.getClaims.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-project-auth-token', value: 'new-token', options: { path: '/' } }])
      return { data: { claims: { sub: 'user-1' } }, error: null }
    })
    const { proxy } = await import('../proxy')
    const request = new NextRequest('https://ante.test/account')
    const response = await proxy(request)
    expect(request.cookies.get('sb-project-auth-token')?.value).toBe('new-token')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('new-token')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
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
    const response = await GET(new NextRequest('https://ante.test/auth/callback?code=valid&next=https://evil.example/'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://ante.test/account')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('exchanged-token')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(state.exchangeCodeForSession).toHaveBeenCalledWith('valid')
    expect(response.headers.get('location')).not.toContain('valid')
  })

  it('fails closed on malformed and expired callbacks without leaking supplied tokens', async () => {
    const { GET } = await import('../app/auth/callback/route')
    const malformed = await GET(new NextRequest('https://ante.test/auth/callback?code=one&code=two&access_token=secret'))
    expect(malformed.headers.get('location')).toBe('https://ante.test/account/sign-in?error=invalid_callback')
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()

    state.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error('expired secret') })
    const expired = await GET(new NextRequest('https://ante.test/auth/callback?code=expired'))
    expect(expired.headers.get('location')).toBe('https://ante.test/account/sign-in?error=exchange_failed')
    expect(expired.headers.get('location')).not.toContain('secret')
  })

  it('preserves a provider rate-limit response with retry guidance and safe logging', async () => {
    state.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { status: 429, message: 'secret provider detail' } })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { GET } = await import('../app/auth/callback/route')
      const response = await GET(new NextRequest('https://ante.test/auth/callback?code=valid'))
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
      new NextRequest('https://evil.example/auth/callback?code=valid'),
      new NextRequest('https://ante.test/auth/callback?code=valid', { headers: { host: 'evil.example' } }),
      new NextRequest('https://ante.test/auth/callback?code=valid', { headers: { 'x-forwarded-host': 'evil.example' } }),
    ]) {
      const response = await GET(request)
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }
    expect(state.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})
