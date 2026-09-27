// Pin the isolated preparation boundary against the real admission digest RPC payloads.
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('../worker-entry.mjs', () => ({
  default: { fetch: vi.fn() },
  DOQueueHandler: class {}, DOShardedTagCache: class {}, BucketCachePurge: class {},
}))

const path = '/__ante_acceptance/profile-read-digests-v1'
const origin = 'https://ante.test'
const run = '00000000-0000-4000-8000-000000000000'
const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
]
const token = 'a'.repeat(64)
const secret = 's'.repeat(32)
const env = {
  ANTE_ACCEPTANCE_RUN_ID: run,
  ANTE_ACCEPTANCE_ORIGIN: origin,
  ANTE_ACCEPTANCE_OPERATOR_TOKEN: token,
  ANTE_AUTH_LIMIT_HMAC_SECRET: secret,
  ANTE_AUTH_INGRESS: 'cloudflare',
}
const body = JSON.stringify({ run_id: run, fixture_ids: ids })
const hash = (message: string) => createHmac('sha256', secret).update(message).digest('hex')

function request(options: {
  url?: string; method?: string; headers?: Record<string, string>; body?: string | ReadableStream<Uint8Array>;
} = {}) {
  return new Request(options.url ?? `${origin}${path}`, {
    method: options.method ?? 'POST',
    headers: {
      authorization: `Bearer ${token}`, origin, 'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.10', ...options.headers,
    },
    body: options.method === 'GET' ? undefined : (options.body ?? body),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

async function expectPrivate404(response: Response) {
  expect(response.status).toBe(404)
  const payload = await response.json()
  expect(payload).toEqual({ error: 'Not found' })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('cdn-cache-control')).toBe('no-store')
  expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
  expect(response.headers.get('vary')).toBe('Cookie')
  for (const name of ['access-control-allow-origin', 'set-cookie', 'etag', 'last-modified', 'accept-ranges']) {
    expect(response.headers.has(name)).toBe(false)
  }
  for (const privateValue of [secret, token, run, ids[0], '192.0.2.10']) {
    expect(JSON.stringify(payload)).not.toContain(privateValue)
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }), { status: 200 })))
})

describe('isolated mediated digest preparation', () => {
  it('delegates every other path to the ordinary entry with the original request, bindings and response', async () => {
    const { default: wrapper } = await import('../worker-mediated-acceptance-entry.mjs')
    const { default: ordinary } = await import('../worker-entry.mjs')
    const response = new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'set-cookie': 'original=1' } })
    vi.mocked(ordinary.fetch).mockResolvedValue(response)
    const photo = new Request(`${origin}/api/profiles/${ids[0]}/photo`)
    const ctx = { waitUntil: vi.fn() }
    expect(await wrapper.fetch(photo, env, ctx)).toBe(response)
    expect(ordinary.fetch).toHaveBeenCalledWith(photo, env, ctx)
    vi.mocked(ordinary.fetch).mockClear()
    expect((await wrapper.fetch(request(), env, ctx)).status).toBe(200)
    expect(ordinary.fetch).not.toHaveBeenCalled()
  })

  it('returns exactly four fixed-domain digests without provider I/O', async () => {
    const { prepareDigests } = await import('../scripts/acceptance/mediated-preparation-worker.mjs')
    const response = await prepareDigests(request(), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: 1, run_id: run,
      visitor_digest: hash('website-account:v1:192.0.2.10'),
      user_digests: ids.map(id => hash(`website-photo-read:v1:${id}`)),
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('matches captured production account and photo admission RPC digests for canonical IP forms', async () => {
    const { prepareDigests } = await import('../scripts/acceptance/mediated-preparation-worker.mjs')
    const { admitAccountVisitor, admitProfilePhotoUser } = await import('../lib/server/callback-admission')
    Object.assign(process.env, {
      ANTE_AUTH_LIMIT_HMAC_SECRET: secret, ANTE_AUTH_INGRESS: 'cloudflare',
      NEXT_PUBLIC_SUPABASE_URL: 'https://yxilmwxptfnebnjsikwo.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testvalue',
      NEXT_PUBLIC_ANTE_SITE_ORIGIN: origin, SUPABASE_SECRET_KEY: 'sb_secret_test_service_key',
    })
    for (const ip of ['192.0.2.10', '2001:0DB8:0:0:0:0:0:1', '::ffff:192.0.2.10']) {
      vi.mocked(fetch).mockClear()
      const result = await prepareDigests(request({ headers: { 'cf-connecting-ip': ip } }), env)
      const values = await result.json() as { visitor_digest: string; user_digests: string[] }
      expect(fetch).not.toHaveBeenCalled()
      expect(await admitAccountVisitor(new NextRequest(`${origin}/account`, { headers: { 'cf-connecting-ip': ip } }))).toBeNull()
      for (const id of ids) expect(await admitProfilePhotoUser(id, 'read')).toBeNull()
      const rpcDigests = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).p_visitor_hash as string)
      expect([values.visitor_digest, ...values.user_digests]).toEqual(rpcDigests)
    }
  })

  it('rejects wrong request method, path, query, origin and operator credential uniformly', async () => {
    const { prepareDigests } = await import('../scripts/acceptance/mediated-preparation-worker.mjs')
    for (const candidate of [
      request({ method: 'GET' }), request({ url: `${origin}${path}/` }), request({ url: `${origin}${path}?x=1` }),
      request({ url: `https://other.test${path}` }), request({ headers: { origin: 'https://other.test' } }),
      request({ headers: { authorization: `Bearer ${'b'.repeat(64)}` } }),
      request({ headers: { authorization: `Bearer ${token}x` } }),
      request({ headers: { authorization: token } }), request({ headers: { 'cf-worker': 'example.test' } }),
    ]) await expectPrivate404(await prepareDigests(candidate, env))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed configuration, body, identifiers and ingress uniformly', async () => {
    const { prepareDigests } = await import('../scripts/acceptance/mediated-preparation-worker.mjs')
    for (const badEnv of [
      { ...env, ANTE_ACCEPTANCE_RUN_ID: 'AAAAAAAA-0000-4000-8000-000000000000' },
      { ...env, ANTE_ACCEPTANCE_ORIGIN: 'http://ante.test' },
      { ...env, ANTE_ACCEPTANCE_OPERATOR_TOKEN: 'a'.repeat(63) },
      { ...env, ANTE_AUTH_LIMIT_HMAC_SECRET: 'short' },
      { ...env, ANTE_AUTH_INGRESS: 'other' },
    ]) await expectPrivate404(await prepareDigests(request(), badEnv))
    for (const malformed of [
      { run_id: ids[0], fixture_ids: ids }, { run_id: run, fixture_ids: [ids[0], ids[0], ids[2]] },
      { run_id: run, fixture_ids: [ids[0], ids[1]] },
      { run_id: run, fixture_ids: ['AAAAAAAA-0000-4000-8000-000000000001', ids[1], ids[2]] },
      { run_id: run, fixture_ids: ids, extra: true },
      [run, ...ids],
    ]) await expectPrivate404(await prepareDigests(request({ body: JSON.stringify(malformed) }), env))
    await expectPrivate404(await prepareDigests(request({ body: '{"run_id":"wrong","run_id":"' + run + '","fixture_ids":' + JSON.stringify(ids) + '}' }), env))
    await expectPrivate404(await prepareDigests(request({ body: '{broken' }), env))
    await expectPrivate404(await prepareDigests(request({ headers: { 'content-length': '1' } }), env))
    await expectPrivate404(await prepareDigests(request({ headers: { 'content-length': '1025' } }), env))
    for (const ip of ['', '192.0.2.10, 203.0.113.1', '192.0.2.999', 'fe80::1%eth0', '2a06:98c0:3600::103']) {
      await expectPrivate404(await prepareDigests(request({ headers: { 'cf-connecting-ip': ip } }), env))
    }
    await expectPrivate404(await prepareDigests(request({ headers: { 'content-type': 'text/plain' } }), env))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds streamed bodies by bytes and time without waiting for a stalled producer', async () => {
    const { prepareDigests } = await import('../scripts/acceptance/mediated-preparation-worker.mjs')
    let cancelled = 0
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1025)) },
      cancel() { cancelled++ },
    })
    await expectPrivate404(await prepareDigests(request({ body: oversized }), env))
    expect(cancelled).toBe(1)
    const stalled = new ReadableStream<Uint8Array>({ start() {}, cancel() { cancelled++ } })
    const before = Date.now()
    await expectPrivate404(await prepareDigests(request({ body: stalled }), env))
    expect(Date.now() - before).toBeLessThan(3000)
    expect(cancelled).toBe(2)
    expect(fetch).not.toHaveBeenCalled()
  }, 5000)
})
