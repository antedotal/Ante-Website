import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const secret = 'a'.repeat(32)
const userId = 'verified-user-private-id'
const allowed = () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = secret
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  vi.stubGlobal('fetch', vi.fn(async () => allowed()))
})

describe('verified user email-change admission', () => {
  it('uses fixed five-per-minute RPC with distinct HMAC action namespaces', async () => {
    const { admitEmailChangeUser } = await import('../lib/server/callback-admission')
    expect(await admitEmailChangeUser(userId, 'request')).toBeNull()
    expect(await admitEmailChangeUser(userId, 'confirm')).toBeNull()
    const requests = vi.mocked(fetch).mock.calls
    expect(requests).toHaveLength(2)
    for (const [index, action] of ['request', 'confirm'].entries()) {
      const [url, init] = requests[index]
      expect(url).toBe('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/consume_website_callback_limit')
      expect(init?.method).toBe('POST')
      expect(init?.cache).toBe('no-store')
      expect(init?.redirect).toBe('error')
      expect(JSON.parse(String(init?.body))).toEqual({
        p_visitor_hash: createHmac('sha256', secret).update(`website-email-change-${action}:v1:${userId}`).digest('hex'),
      })
      expect(JSON.stringify(init)).not.toContain(userId)
    }
    expect(JSON.stringify(requests)).not.toContain(userId)
  })

  it('fails closed before transport for invalid identity, action, or secret', async () => {
    const { admitEmailChangeUser } = await import('../lib/server/callback-admission')
    for (const [id, action] of [['', 'request'], ['  ', 'confirm'], [userId, 'invalid']] as const) {
      const response = await admitEmailChangeUser(id, action as 'request' | 'confirm')
      expect(response?.status).toBe(503)
      expect(response?.headers.get('retry-after')).toBe('60')
      expect(response?.headers.get('cache-control')).toBe('private, no-store')
    }
    process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'short'
    expect((await admitEmailChangeUser(userId, 'request'))?.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns private fixed retry guidance for denied and unavailable store results', async () => {
    const { admitEmailChangeUser } = await import('../lib/server/callback-admission')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 17 }))))
    const denied = await admitEmailChangeUser(userId, 'request')
    expect(denied?.status).toBe(429)
    expect(denied?.headers.get('retry-after')).toBe('17')
    expect(denied?.headers.get('cache-control')).toBe('private, no-store')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private failure', { status: 500 })))
    const unavailable = await admitEmailChangeUser(userId, 'confirm')
    expect(unavailable?.status).toBe(503)
    expect(unavailable?.headers.get('retry-after')).toBe('60')
    expect(await unavailable?.text()).not.toContain(userId)
  })
})
