// Use the installed SSR/Auth SDK for a rejected request so automatic PKCE cookie writes are not hidden by a hand-written Auth mock.
import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

it('discards real SDK PKCE verifier cookies when the provider rejects an email-change request', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  process.env.ANTE_EMAIL_CHANGE_MODE = 'secure-two-inbox-otp'
  const id = '00000000-0000-4000-8000-000000000001'
  const account = { id, aud: 'authenticated', role: 'authenticated', email: 'current@example.test', new_email: null,
    created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} }
  const session = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: account }
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/rest/v1/rpc/')) return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/auth/v1/user') && init?.method === 'GET') return new Response(JSON.stringify(account), { headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/auth/v1/user') && init?.method === 'PUT') return new Response(JSON.stringify({ code: 'email_exists', msg: 'private provider detail' }), { status: 422, headers: { 'content-type': 'application/json' } })
    throw new Error('Unexpected synthetic Auth request')
  }))
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const request = new NextRequest('https://ante.test/api/account/email-change/request', {
      method: 'POST',
      headers: { host: 'ante.test', origin: 'https://ante.test', 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10',
        cookie: `sb-yxilmwxptfnebnjsikwo-auth-token=${encoded}` },
      body: JSON.stringify({ newEmail: 'target@example.test' }),
    })
    // Characterize the installed SDK side effect first: the rejected call still stages PKCE state.
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const baseline = createIsolatedAccountStage(request)
    expect((await baseline.client.auth.getUser()).error).toBeNull()
    const rejected = baseline.fork()
    expect((await rejected.client.auth.updateUser({ email: 'target@example.test' })).error?.status).toBe(422)
    expect([...rejected.pending.keys()].some((name) => name.includes('code-verifier'))).toBe(true)
    const { POST } = await import('../app/api/account/email-change/request/route')
    const response = await POST(request)
    expect([response.status, await response.json()]).toEqual([202, { ok: true }])
    expect(calls.some((call) => call.startsWith('PUT ') && call.endsWith('/auth/v1/user'))).toBe(true)
    expect(response.headers.get('set-cookie') ?? '').not.toContain('code-verifier')
    expect(request.cookies.getAll().map((cookie) => cookie.name)).toEqual(['sb-yxilmwxptfnebnjsikwo-auth-token'])
    expect(errorLog.mock.calls.flat().map(String).join(' ')).not.toContain('private provider detail')
  } finally {
    errorLog.mockRestore()
    vi.unstubAllGlobals()
  }
})
