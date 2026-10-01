// Test the real admission boundary while replacing only the external RPC service.
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const rpcUrl = 'https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/consume_website_callback_limit'
const opaqueKey = 'sb_secret_test_service_key'
const hash = (ip: string) => createHmac('sha256', 'a'.repeat(32)).update(`website-auth-callback:v1:${ip}`).digest('hex')
const request = (ip?: string, headers: Record<string, string> = {}) => new NextRequest('https://ante.test/auth/callback?code=secret-code', {
  headers: { ...(ip === undefined ? {} : { 'cf-connecting-ip': ip }), ...headers },
})
const allowed = () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = opaqueKey
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.stubGlobal('fetch', vi.fn(async () => allowed()))
})

describe('callback admission', () => {
  it('preserves no-argument account and photo callers while forwarding parent aborts', async () => {
    const { admitAccountVisitor, admitProfilePhotoUser } = await import('../lib/server/callback-admission')
    const owner = '00000000-0000-4000-8000-000000000001'
    expect(await admitAccountVisitor(request('192.0.2.10'))).toBeNull()
    expect(await admitProfilePhotoUser(owner, 'read')).toBeNull()
    const controller = new AbortController()
    controller.abort()
    vi.mocked(fetch).mockClear()
    expect((await admitAccountVisitor(request('192.0.2.10'), controller.signal))?.status).toBe(503)
    expect((await admitProfilePhotoUser(owner, 'read', controller.signal))?.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops account visitor admission on request abort even when provider fetch ignores it', async () => {
    const { admitAccountVisitor } = await import('../lib/server/callback-admission')
    const controller = new AbortController()
    const incoming = new NextRequest('https://ante.test/account', {
      headers: { 'cf-connecting-ip': '192.0.2.10' }, signal: controller.signal,
    })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const pending = admitAccountVisitor(incoming)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort()
    expect((await pending)?.status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails closed without explicit ingress or valid account and private configuration', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    for (const [name, value] of [
      ['ANTE_AUTH_INGRESS', undefined], ['ANTE_AUTH_LIMIT_HMAC_SECRET', 'short'],
      ['SUPABASE_SECRET_KEY', undefined],
      ['NEXT_PUBLIC_SUPABASE_URL', undefined],
      ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_wrong'],
      ['NEXT_PUBLIC_ANTE_SITE_ORIGIN', 'https://evil.example'],
    ] as const) {
      const original = process.env[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
      const result = await admitCallback(request('192.0.2.10'))
      expect(result?.status).toBe(503)
      expect(result?.headers.get('retry-after')).toBe('60')
      expect(result?.headers.get('cache-control')).toContain('no-store')
      expect(fetch).not.toHaveBeenCalled()
      process.env[name] = original
    }
  })

  it.each([undefined, '', '192.0.2.1, 192.0.2.2', 'unknown', 'fe80::1%eth0', '192.0.2.999', '2a06:98c0:3600::103'])('rejects missing, ambiguous or cross-zone IP %s', async (ip) => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    expect((await admitCallback(request(ip)))?.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses only the verified forwarding field and canonicalizes IPv4, IPv6 and mapped IPv4', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    for (const [input, canonical] of [
      ['192.0.2.10', '192.0.2.10'],
      ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
      ['2001:db8::1', '2001:db8::1'],
      ['::ffff:192.0.2.10', '192.0.2.10'],
      ['0:0:0:0:0:ffff:c000:20a', '192.0.2.10'],
    ]) {
      expect(await admitCallback(request(input, { 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '203.0.113.6', 'cf-connecting-ipv6': '2001:db8::9', cookie: 'session=private', authorization: 'Bearer incoming' }))).toBeNull()
      const [url, init] = vi.mocked(fetch).mock.lastCall!
      expect(url).toBe(rpcUrl)
      expect(JSON.parse(String(init?.body))).toEqual({ p_visitor_hash: hash(canonical) })
      expect(String(init?.body)).not.toContain(input)
      expect(String(init?.body)).not.toContain('secret-code')
      expect(String(init?.body)).not.toContain('private')
      expect(init?.method).toBe('POST')
      expect(init?.cache).toBe('no-store')
      expect(init?.redirect).toBe('manual')
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBe(opaqueKey)
      expect(headers.get('authorization')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
    }
  })

  it('rejects Worker subrequests and ignores other IP claims', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    expect((await admitCallback(request('192.0.2.10', { 'cf-worker': 'another.example' })))?.status).toBe(503)
    expect((await admitCallback(request(undefined, { 'x-forwarded-for': '192.0.2.10', 'x-real-ip': '192.0.2.10', 'cf-connecting-ipv6': '2001:db8::1' })))?.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses legacy service JWT as both apikey and bearer authorization', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    delete process.env.SUPABASE_SECRET_KEY
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt
    expect(await admitCallback(request('192.0.2.10'))).toBeNull()
    const headers = new Headers(vi.mocked(fetch).mock.lastCall![1]?.headers)
    expect(headers.get('apikey')).toBe(jwt)
    expect(headers.get('authorization')).toBe(`Bearer ${jwt}`)
  })

  it('returns a private 429 with validated retry after for denied admission', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 13 }), { status: 200 })))
    const response = await admitCallback(request('192.0.2.10'))
    expect(response?.status).toBe(429)
    expect(response?.headers.get('retry-after')).toBe('13')
    expect(response?.headers.get('cache-control')).toContain('no-store')
  })

  it.each([
    new Response('private provider error', { status: 500 }),
    new Response('{not-json', { status: 200 }),
    new Response(JSON.stringify({ allowed: true, retry_after_seconds: 1 }), { status: 200 }),
    new Response(JSON.stringify({ allowed: false, retry_after_seconds: 61 }), { status: 200 }),
    new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 0 }]), { status: 200 }),
    new Response('', { status: 302, headers: { location: 'https://evil.example/' } }),
  ])('returns a private 503 for failed or malformed store responses', async (reply) => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => reply.clone()))
    const result = await admitCallback(request('192.0.2.10'))
    expect(result?.status).toBe(503)
    expect(result?.headers.get('retry-after')).toBe('60')
    expect(result?.headers.get('cache-control')).toContain('no-store')
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private provider error|evil\.example|192\.0\.2|secret-code|sb_secret/)
  })

  it('bounds the RPC wait to five seconds and fails closed on an aborted request', async () => {
    const { admitCallback } = await import('../lib/server/callback-admission')
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted secret')))
      })))
      const pending = admitCallback(request('192.0.2.10'))
      await vi.advanceTimersByTimeAsync(5000)
      expect((await pending)?.status).toBe(503)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the same external store across visitors and separate module instances', async () => {
    // This fake proves website request ordering and identity isolation, not database atomicity.
    const counts = new Map<string, number>()
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const { p_visitor_hash } = JSON.parse(String(init.body)) as { p_visitor_hash: string }
      const next = (counts.get(p_visitor_hash) ?? 0) + 1
      counts.set(p_visitor_hash, next)
      return new Response(JSON.stringify(next <= 5
        ? { allowed: true, retry_after_seconds: 0 }
        : { allowed: false, retry_after_seconds: 42 }), { status: 200 })
    }))
    const firstInstance = await import('../lib/server/callback-admission')
    for (let attempt = 0; attempt < 3; attempt++) expect(await firstInstance.admitCallback(request('192.0.2.10'))).toBeNull()
    vi.resetModules()
    const secondInstance = await import('../lib/server/callback-admission')
    for (let attempt = 0; attempt < 2; attempt++) expect(await secondInstance.admitCallback(request('192.0.2.10'))).toBeNull()
    const sixth = await secondInstance.admitCallback(request('192.0.2.10'))
    expect(sixth?.status).toBe(429)
    expect(sixth?.headers.get('retry-after')).toBe('42')
    expect(await secondInstance.admitCallback(request('192.0.2.11'))).toBeNull()
    expect(counts.get(hash('192.0.2.10'))).toBe(6)
    expect(counts.get(hash('192.0.2.11'))).toBe(1)
  })
})
