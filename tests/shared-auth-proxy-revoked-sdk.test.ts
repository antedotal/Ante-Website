// Exercise the installed SSR/Auth SDK through the real proxy with synthetic transport.
import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

it('clears a revoked nonexpired session and PKCE verifier without logging provider details', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  const privateText = 'private-revoked@example.test secret-session-token-004321'
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: expiresAt, sub: '00000000-0000-4000-8000-000000000001', session_id: 'revoked-session' })).toString('base64url'),
    'synthetic-signature',
  ].join('.')
  const session = {
    access_token: token, refresh_token: 'synthetic-refresh-token', token_type: 'bearer',
    expires_at: expiresAt, expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: 'current@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} },
  }
  const name = 'sb-yxilmwxptfnebnjsikwo-auth-token'
  const verifier = `${name}-code-verifier`
  const request = new NextRequest('https://ante.test/account', {
    headers: {
      host: 'ante.test', 'cf-connecting-ip': '192.0.2.10',
      cookie: `${name}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}; ${verifier}=synthetic-pkce`,
    },
  })
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname
    if (path === '/rest/v1/rpc/consume_website_account_limit') {
      return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })
    }
    if (path === '/auth/v1/user') {
      return new Response(JSON.stringify({ code: 'session_not_found', msg: privateText }), {
        status: 403, statusText: privateText,
        headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01', 'x-provider-detail': privateText },
      })
    }
    throw new Error(`Unexpected synthetic request path: ${path}`)
  })
  vi.stubGlobal('fetch', transport)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { proxy } = await import('../proxy')
    const response = await proxy(request)
    expect(transport.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)).pathname))
      .toContain('/auth/v1/user')
    expect(response.cookies.get(name)?.maxAge).toBe(0)
    expect(response.cookies.get(verifier)?.maxAge).toBe(0)
    expect(request.cookies.get(name)?.value).toBe('')
    expect(request.cookies.get(verifier)?.value).toBe('')
    const logged = [...error.mock.calls, ...warn.mock.calls].flat().map(String).join(' ')
    expect(logged).not.toContain(privateText)
  } finally {
    error.mockRestore()
    warn.mockRestore()
    vi.unstubAllGlobals()
  }
})
