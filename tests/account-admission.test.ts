// Exercise account admission through its real REST adapter and trusted request boundary.
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const key = 'sb_secret_test_service_key'
const secret = 'a'.repeat(32)
const rpcUrl = 'https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/consume_website_account_limit'
const digest = (ip: string) => createHmac('sha256', secret).update(`website-account:v1:${ip}`).digest('hex')
const request = (ip?: string, headers: Record<string, string> = {}) => new NextRequest('https://ante.test/account', {
  headers: { ...(ip === undefined ? {} : { 'cf-connecting-ip': ip }), ...headers },
})

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = secret
  process.env.SUPABASE_SECRET_KEY = key
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }))))
})

describe('account visitor admission', () => {
  it('uses the fixed account RPC and separate HMAC domain without forwarding caller credentials', async () => {
    const { admitAccountVisitor } = await import('../lib/server/callback-admission')
    for (const [input, canonical] of [
      ['192.0.2.10', '192.0.2.10'],
      ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
      ['::ffff:192.0.2.10', '192.0.2.10'],
    ]) {
      expect(await admitAccountVisitor(request(input, { authorization: 'Bearer caller', cookie: 'private=cookie', 'x-forwarded-for': '203.0.113.9' }))).toBeNull()
      const [url, init] = vi.mocked(fetch).mock.lastCall!
      expect(url).toBe(rpcUrl)
      expect(init?.method).toBe('POST')
      expect(init?.cache).toBe('no-store')
      expect(init?.redirect).toBe('manual')
      expect(JSON.parse(String(init?.body))).toEqual({ p_visitor_hash: digest(canonical) })
      expect(JSON.parse(String(init?.body)).p_visitor_hash).not.toBe(createHmac('sha256', secret).update(`website-auth-callback:v1:${canonical}`).digest('hex'))
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBe(key)
      expect(headers.get('authorization')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
    }
  })

  it('rejects untrusted or ambiguous visitor identity before contacting the store', async () => {
    const { admitAccountVisitor } = await import('../lib/server/callback-admission')
    for (const candidate of [request(undefined, { 'x-real-ip': '192.0.2.10', 'x-forwarded-for': '192.0.2.10' }), request('192.0.2.10, 203.0.113.1'), request('2a06:98c0:3600::103'), request('192.0.2.10', { 'cf-worker': 'other.example' })]) {
      const result = await admitAccountVisitor(candidate)
      expect(result?.status).toBe(503)
      expect(result?.headers.get('retry-after')).toBe('60')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a private denial and fails closed on malformed store responses', async () => {
    const { admitAccountVisitor } = await import('../lib/server/callback-admission')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 17 }))))
    const denied = await admitAccountVisitor(request('192.0.2.10'))
    expect(denied?.status).toBe(429)
    expect(denied?.headers.get('retry-after')).toBe('17')
    expect(denied?.headers.get('cache-control')).toBe('private, no-store')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 61 }))))
    const unavailable = await admitAccountVisitor(request('192.0.2.10'))
    expect(unavailable?.status).toBe(503)
    expect(unavailable?.headers.get('retry-after')).toBe('60')
  })
})
