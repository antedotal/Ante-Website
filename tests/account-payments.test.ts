// Exercise actual dormant routes with only external Auth/RPC/visitor transport doubled; no provider objects/accounts exist.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods'
import { parsePaymentEnvelope } from '../lib/payments/contract'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), setAll: undefined as undefined | ((cookies: { name: string; value: string; options?: { path?: string } }[]) => void) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn((_url, _key, options) => {
  state.setAll = options.cookies.setAll
  return { auth: { getUser: state.getUser }, rpc: state.rpc }
}) }))
const operationId = '11111111-1111-4111-8111-111111111111', customerId = '22222222-2222-4222-8222-222222222222', policyId = '33333333-3333-4333-8333-333333333333', consentId = '44444444-4444-4444-8444-444444444444'
const text = 'Synthetic approved fixture only; no financial action.', hash = createHash('sha256').update(text).digest('hex')
const ensureInput = { operation_id: operationId, customer_revision: 0 }
const acceptInput = { operation_id: operationId, customer_revision: 1, policy_id: policyId, policy_version: 'fixture-v1', policy_revision: 1, policy_hash: hash, affirmative: true }
const revokeInput = { operation_id: operationId, consent_id: consentId, consent_revision: 1 }
const operation = (action = 'customer.ensure', resource = customerId, revision = 1, status = 'pending') => ({ operation_id: operationId, operation_revision: 1, action, resource_id: resource, resource_revision: revision, status, recovery: status === 'pending' ? 'await_policy' : 'none', continuation_token: null, action_expires_at: null })
const envelope = (result: unknown, status = 'pending', revision = 1, id: string | null = operationId) => ({ contract_version: 1, operation_id: id, operation_revision: id === null ? null : 1, status, resource_revision: revision, result, error_code: null, retry_after_seconds: null })
const customer = () => envelope({ customer_id: customerId, revision: 1, state: 'reserved', operation: operation() })
const consent = (action: 'consent.read' | 'consent.accept' | 'consent.revoke') => {
  const read = action === 'consent.read', revoked = action === 'consent.revoke', revision = revoked ? 2 : 1
  return envelope({ consent_id: read ? null : consentId, revision, policy_id: policyId, policy_version: 'fixture-v1', policy_hash: hash, approved_text: read ? text : null, scope_keys: ['fixture.nonfinancial'], state: revoked ? 'revoked' : 'active', accepted_at: read ? null : '2026-10-06T01:00:00Z', revoked_at: revoked ? '2026-10-06T02:00:00Z' : null, ...(read ? {} : { operation: operation(action, consentId, revision, 'completed') }) }, 'completed', revision, read ? null : operationId)
}
const request = (path: 'customer' | 'consent', method: string, body?: BodyInit, suffix = '', headers: Record<string, string> = {}) => new NextRequest(`https://ante.test/api/account/payments/${path}${suffix}`, {
  method, headers: { host: 'ante.test', 'cf-connecting-ip': '192.0.2.10', ...(method !== 'GET' ? { origin: 'https://ante.test', 'content-type': 'application/json' } : {}), ...headers },
  ...(body === undefined ? {} : { body }), ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
} as NonNullable<ConstructorParameters<typeof NextRequest>[1]>)
const readQuery = `?policy_id=${policyId}&version=fixture-v1`
beforeEach(() => {
  process.env.ANTE_WEB_PAYMENTS_MODE = 'owner-consent-v1'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }))))
  state.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })
  state.rpc.mockReset().mockResolvedValue({ data: customer(), error: null })
  state.setAll = undefined
  vi.mocked(createServerClient).mockClear()
})
describe('closed payment owner adapters', () => {
  it('mode gate precedes all config/visitor/Auth construction for each fixed action', async () => {
    const customerRoute = await import('../app/api/account/payments/customer/route'), consentRoute = await import('../app/api/account/payments/consent/route')
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    for (const mode of [undefined, '', 'enabled', 'v1']) {
      if (mode === undefined) delete process.env.ANTE_WEB_PAYMENTS_MODE
      else process.env.ANTE_WEB_PAYMENTS_MODE = mode
      for (const response of [await customerRoute.POST(request('customer', 'POST', '{}')), await consentRoute.GET(request('consent', 'GET', undefined, readQuery)), await consentRoute.POST(request('consent', 'POST', '{}')), await consentRoute.DELETE(request('consent', 'DELETE', '{}'))]) {
        expect(response.status).toBe(503); expect((await response.json()).error_code).toBe('activation_closed'); expect(response.headers.get('cache-control')).toBe('private, no-store')
      }
    }
    expect(fetch).not.toHaveBeenCalled(); expect(createServerClient).not.toHaveBeenCalled()
  })
  it('unsupported methods are private bodyless405 before any dependency', async () => {
    const customerRoutes = autoImplementMethods(await import('../app/api/account/payments/customer/route')), consentRoutes = autoImplementMethods(await import('../app/api/account/payments/consent/route'))
    for (const [path, handlers, methods, allow] of [['customer', customerRoutes, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'], 'POST'], ['consent', consentRoutes, ['HEAD', 'OPTIONS', 'PUT', 'PATCH'], 'GET, POST, DELETE']] as const) {
      for (const method of methods) { const response = await handlers[method](request(path, method), {} as never) as Response; expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe(allow); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(await response.text()).toBe('') }
    }
    expect(fetch).not.toHaveBeenCalled(); expect(createServerClient).not.toHaveBeenCalled()
  })
  it('origin/query/body and internal UUID selectors reject before admission', async () => {
    const { POST } = await import('../app/api/account/payments/customer/route'), { GET, POST: accept, DELETE } = await import('../app/api/account/payments/consent/route')
    const hostileHeaders: Record<string, string>[] = [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }, { origin: '' }]
    for (const headers of hostileHeaders) expect((await POST(request('customer', 'POST', JSON.stringify(ensureInput), '', headers))).status).toBe(403)
    for (const suffix of ['', '?policy_id=x&version=v1', `${readQuery}&owner_id=other`, `${readQuery}&consent_id=${consentId}`, `?consent_id=${consentId}&consent_id=${consentId}`, `?consent_id=cus_x`, `${readQuery}&policy_id=${policyId}`, `${readQuery}&version=v2`, `?policy_id=${policyId}&version=${'v'.repeat(65)}`]) expect((await GET(request('consent', 'GET', undefined, suffix))).status).toBe(400)
    for (const body of ['{', '[]', '{}', 'null', JSON.stringify({ ...ensureInput, owner_id: 'other' }), JSON.stringify({ ...ensureInput, operation_id: 'cus_AbC' }), JSON.stringify({ ...ensureInput, customer_revision: -1 })]) expect((await POST(request('customer', 'POST', body))).status).toBe(400)
    for (const input of [{ ...acceptInput, affirmative: false }, { ...acceptInput, policy_hash: 'x'.repeat(64) }, { ...acceptInput, provider_customer_id: 'cus_x' }]) expect((await accept(request('consent', 'POST', JSON.stringify(input)))).status).toBe(400)
    expect((await DELETE(request('consent', 'DELETE', JSON.stringify({ ...revokeInput, consent_id: 'cus_x' })))).status).toBe(400)
    expect((await POST(request('customer', 'POST', JSON.stringify(ensureInput), '?anything=x'))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled(); expect(createServerClient).not.toHaveBeenCalled()
  })
  it('actual body bytes are bounded4096 with fatal UTF-8 and content type checks', async () => {
    const { POST } = await import('../app/api/account/payments/customer/route')
    expect((await POST(request('customer', 'POST', '{}', '', { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await POST(request('customer', 'POST', '{}', '', { 'content-length': '4097' }))).status).toBe(413)
    expect((await POST(request('customer', 'POST', new Uint8Array([0xff])))).status).toBe(400)
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4090)); c.enqueue(new Uint8Array(10)); c.close() } })
    expect((await POST(request('customer', 'POST', stream))).status).toBe(413)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('four fixed RPCs receive only canonical parameters and responses preserve operation identity', async () => {
    const customerRoute = await import('../app/api/account/payments/customer/route'), consentRoute = await import('../app/api/account/payments/consent/route')
    const c = await customerRoute.POST(request('customer', 'POST', JSON.stringify(ensureInput))); expect(c.status).toBe(200); expect(await c.json()).toEqual(customer())
    state.rpc.mockResolvedValueOnce({ data: consent('consent.read'), error: null }); expect((await consentRoute.GET(request('consent', 'GET', undefined, readQuery))).status).toBe(200)
    state.rpc.mockResolvedValueOnce({ data: consent('consent.accept'), error: null }); expect((await consentRoute.POST(request('consent', 'POST', JSON.stringify(acceptInput)))).status).toBe(200)
    state.rpc.mockResolvedValueOnce({ data: consent('consent.revoke'), error: null }); expect((await consentRoute.DELETE(request('consent', 'DELETE', JSON.stringify(revokeInput)))).status).toBe(200)
    expect(state.rpc.mock.calls).toEqual([
      ['ensure_my_payment_customer_v1', { p_operation_id: operationId, p_customer_revision: 0 }],
      ['read_my_payment_consent_v1', { p_policy_id: policyId, p_version: 'fixture-v1', p_consent_id: null }],
      ['accept_my_payment_consent_v1', { p_operation_id: operationId, p_customer_revision: 1, p_policy_id: policyId, p_policy_version: 'fixture-v1', p_policy_revision: 1, p_policy_hash: hash, p_affirmative: true }],
      ['revoke_my_payment_consent_v1', { p_operation_id: operationId, p_consent_id: consentId, p_consent_revision: 1 }],
    ])
  })
  it('quota/conflict/config denials map truthful status and bounded Retry-After while preserving refreshed private cookies', async () => {
    const { POST } = await import('../app/api/account/payments/customer/route')
    state.getUser.mockImplementation(async () => { state.setAll?.([{ name: 'sb-session', value: 'fixture-refreshed', options: { path: '/' } }]); return { data: { user: { id: 'verified' } }, error: null } })
    for (const [error, status, code] of [['rate_limited', 'denied', 429], ['configuration_missing', 'denied', 503], ['revision_conflict', 'conflict', 409]] as const) {
      const denial = { ...envelope(null, status), resource_revision: null, error_code: error, retry_after_seconds: error === 'rate_limited' ? 12 : null }
      state.rpc.mockResolvedValueOnce({ data: denial, error: null }); const response = await POST(request('customer', 'POST', JSON.stringify(ensureInput)))
      expect(response.status).toBe(code); expect(await response.json()).toEqual(denial); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('set-cookie')).toContain('fixture-refreshed'); expect(response.headers.get('pragma')).toBe('no-cache'); expect(response.headers.get('retry-after')).toBe(error === 'rate_limited' ? '12' : null)
    }
  })
  it('unverified Auth never releases cookies/RPC; verified failures retain only controlled cookies', async () => {
    const { POST } = await import('../app/api/account/payments/customer/route')
    state.getUser.mockImplementationOnce(async () => { state.setAll?.([{ name: 'sb-session', value: 'unverified', options: { path: '/' } }]); return { data: { user: null }, error: { status: 401 } } })
    const invalid = await POST(request('customer', 'POST', JSON.stringify(ensureInput))); expect(invalid.status).toBe(401); expect(invalid.headers.get('set-cookie')).toBeNull(); expect(state.rpc).not.toHaveBeenCalled()
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'private provider secret' }, status: 500 })
    const response = await POST(request('customer', 'POST', JSON.stringify(ensureInput))); expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret')
  })
  it('rejects malformed/secret/progress and request-mismatched responses', async () => {
    const { POST } = await import('../app/api/account/payments/customer/route')
    for (const data of [{ ...customer(), secret: 'raw' }, { ...customer(), operation_revision: undefined }, { ...customer(), operation_revision: 0 }, { ...customer(), resource_revision: 2 }, { ...customer(), operation_id: consentId }, { ...customer(), result: { ...(customer().result as object), provider_customer_id: 'cus_private' } }, { ...customer(), result: { ...(customer().result as object), operation: { ...operation(), operation_revision: 2 } } }]) {
      state.rpc.mockResolvedValueOnce({ data, error: null }); expect((await POST(request('customer', 'POST', JSON.stringify(ensureInput)))).status).toBe(503)
    }
    const mismatch = { ...customer(), operation_id: consentId, result: { ...(customer().result as object), operation: { ...operation(), operation_id: consentId } } }
    state.rpc.mockResolvedValueOnce({ data: mismatch, error: null }); expect((await POST(request('customer', 'POST', JSON.stringify(ensureInput)))).status).toBe(503)
  })
  it('read DTO validates approved UTF-8 text/hash, unavailable state and distinct resource/operation revisions', () => {
    const read = consent('consent.read'); expect(parsePaymentEnvelope(read, 'consent.read')).toEqual(read)
    expect(parsePaymentEnvelope({ ...read, result: { ...(read.result as object), approved_text: text + ' altered' } }, 'consent.read')).toBeNull()
    expect(parsePaymentEnvelope({ ...read, result: { ...(read.result as object), scope_keys: ['z', 'a'] } }, 'consent.read')).toBeNull()
    const unavailable = envelope({ consent_id: null, revision: 0, policy_id: policyId, policy_version: 'fixture-v1', policy_hash: null, approved_text: null, scope_keys: [], state: 'unavailable', accepted_at: null, revoked_at: null }, 'completed', 0, null)
    expect(parsePaymentEnvelope(unavailable, 'consent.read')).toEqual(unavailable)
    const revoked = consent('consent.revoke'); expect(parsePaymentEnvelope(revoked, 'consent.revoke')?.operation_revision).toBe(1); expect(parsePaymentEnvelope(revoked, 'consent.revoke')?.resource_revision).toBe(2)
  })
})
it('visitor and Auth quotas stop before any owner RPC without fabricating a payment result', async () => {
  const { POST } = await import('../app/api/account/payments/customer/route')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: false, retry_after_seconds: 7 }))))
  const visitor = await POST(request('customer', 'POST', JSON.stringify(ensureInput))); expect(visitor.status).toBe(429); expect(visitor.headers.get('retry-after')).toBe('7'); expect(createServerClient).not.toHaveBeenCalled()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true, retry_after_seconds: 0 }))))
  state.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 429 } })
  const auth = await POST(request('customer', 'POST', JSON.stringify(ensureInput))); expect(auth.status).toBe(429); expect(auth.headers.get('retry-after')).toBe('60'); expect(state.rpc).not.toHaveBeenCalled()
})

it('exclusive owner history returns exact approved snapshot after retirement without implying new authority', async () => {
  const { GET } = await import('../app/api/account/payments/consent/route')
  const historical = consent('consent.revoke')
  const result: Record<string, unknown> = { ...(historical.result as Record<string, unknown>), approved_text: text }
  delete result.operation
  const history = { ...historical, operation_id: null, operation_revision: null, result }
  state.rpc.mockResolvedValueOnce({ data: history, error: null })
  const response = await GET(request('consent', 'GET', undefined, `?consent_id=${consentId}`))
  expect(response.status).toBe(200); expect(await response.json()).toEqual(history)
  expect(state.rpc).toHaveBeenCalledWith('read_my_payment_consent_v1', { p_policy_id: null, p_version: null, p_consent_id: consentId })
  state.rpc.mockResolvedValueOnce({ data: { ...history, result: { ...result, consent_id: customerId } }, error: null })
  expect((await GET(request('consent', 'GET', undefined, `?consent_id=${consentId}`))).status).toBe(503)
  const missing = { contract_version: 1, operation_id: null, operation_revision: null, status: 'denied', resource_revision: null, result: null, error_code: 'not_found', retry_after_seconds: null }
  state.rpc.mockResolvedValueOnce({ data: missing, error: null })
  const foreign = await GET(request('consent', 'GET', undefined, `?consent_id=${customerId}`)); expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(missing)
})
