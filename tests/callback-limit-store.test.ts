// Exercise the website's real REST adapter against controlled external responses.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const digest = 'a'.repeat(64)
const rpcUrl = 'https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/consume_website_callback_limit'
const opaqueKey = 'sb_secret_test_service_key'
const allowed = () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.SUPABASE_SECRET_KEY = opaqueKey
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.stubGlobal('fetch', vi.fn(async () => allowed()))
})

describe('callback limit REST adapter', () => {
  it('allows only a valid RPC admission and sends a digest without visitor credentials', async () => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'allowed' })
    const [url, init] = vi.mocked(fetch).mock.lastCall!
    expect(url).toBe(rpcUrl)
    expect(init?.method).toBe('POST')
    expect(init?.cache).toBe('no-store')
    expect(init?.redirect).toBe('error')
    expect(JSON.parse(String(init?.body))).toEqual({ p_visitor_hash: digest })
    expect(String(init?.body)).not.toContain(opaqueKey)
    expect(String(url)).not.toContain(opaqueKey)
    const headers = new Headers(init?.headers)
    expect(headers.get('apikey')).toBe(opaqueKey)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('returns the store-controlled retry interval for a valid denial', async () => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 13 }), { status: 200 })))
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'denied', retryAfter: 13 })
  })

  it('uses a legacy service JWT as apikey and bearer authorization', async () => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    delete process.env.SUPABASE_SECRET_KEY
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'allowed' })
    const headers = new Headers(vi.mocked(fetch).mock.lastCall![1]?.headers)
    expect(headers.get('apikey')).toBe(jwt)
    expect(headers.get('authorization')).toBe(`Bearer ${jwt}`)
  })

  it.each([
    new Response('provider detail with secrets', { status: 500 }),
    new Response('{broken', { status: 200 }),
    new Response(JSON.stringify({ allowed: true, retry_after_seconds: 1 }), { status: 200 }),
    new Response(JSON.stringify({ allowed: false, retry_after_seconds: 0 }), { status: 200 }),
    new Response(JSON.stringify({ allowed: false, retry_after_seconds: 61 }), { status: 200 }),
    new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 0 }]), { status: 200 }),
    new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0, extra: true }), { status: 200 }),
    new Response('', { status: 302, headers: { location: 'https://evil.example' } }),
  ])('fails closed on HTTP, JSON, redirect or contract failure', async (reply) => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    vi.stubGlobal('fetch', vi.fn(async () => reply.clone()))
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'unavailable' })
  })

  it('fails closed without valid digest, private key or account project configuration', async () => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    expect(await consumeCallbackLimit('visitor-ip')).toEqual({ kind: 'unavailable' })
    delete process.env.SUPABASE_SECRET_KEY
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'unavailable' })
    process.env.SUPABASE_SECRET_KEY = opaqueKey
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://evil.example'
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed if the external request throws or exceeds five seconds', async () => {
    const { consumeCallbackLimit } = await import('../lib/server/callback-limit-store')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private provider detail') }))
    expect(await consumeCallbackLimit(digest)).toEqual({ kind: 'unavailable' })
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })))
      const pending = consumeCallbackLimit(digest)
      await vi.advanceTimersByTimeAsync(5000)
      expect(await pending).toEqual({ kind: 'unavailable' })
    } finally {
      vi.useRealTimers()
    }
  })
})
