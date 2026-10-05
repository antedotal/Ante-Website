// Exercise both HTTP routes with real request validation and cookie staging; only external Auth and admission are faked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  clients: [] as { write: (name: string, value: string, maxAge?: number) => void }[],
  getUser: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(),
  admissions: [] as string[],
  admissionResult: { allowed: true, retry_after_seconds: 0 } as { allowed: boolean; retry_after_seconds: number },
  userAdmissionResult: { allowed: true, retry_after_seconds: 0 } as { allowed: boolean; retry_after_seconds: number },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    const index = state.clients.length
    state.clients.push({ write: (name, value, maxAge) => options.cookies.setAll([{ name, value, options: { maxAge, path: '/' } }]) })
    return { auth: {
      getUser: () => state.getUser(index),
      updateUser: (args: unknown) => state.updateUser(index, args),
      verifyOtp: (args: unknown) => state.verifyOtp(index, args),
    } }
  }),
}))

const caller = '00000000-0000-4000-8000-000000000001'
const current = 'current@example.test'
const target = 'target@example.test'
const user = (email = current, new_email: unknown = target, id = caller) => ({ id, email, new_email })
const verified = (value: unknown) => ({ data: { user: value }, error: null })
const ok = { data: { user: user() }, error: null }
const req = (path: 'request' | 'confirm', body: unknown, headers: Record<string, string> = {}, suffix = '') => new NextRequest(`https://ante.test/api/account/email-change/${path}${suffix}`, {
  method: 'POST',
  headers: { host: 'ante.test', origin: 'https://ante.test', 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', cookie: 'sb-auth=old', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})
const requestBody = { newEmail: ' TARGET@EXAMPLE.TEST ' }
const confirmBody = { email: current, code: '001234' }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  process.env.ANTE_AUTH_INGRESS = 'cloudflare'
  process.env.ANTE_AUTH_LIMIT_HMAC_SECRET = 'a'.repeat(32)
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_service_key'
  process.env.ANTE_EMAIL_CHANGE_MODE = 'secure-two-inbox-otp'
  state.clients.length = 0
  state.admissions.length = 0
  state.admissionResult = { allowed: true, retry_after_seconds: 0 }
  state.userAdmissionResult = { allowed: true, retry_after_seconds: 0 }
  state.getUser.mockReset().mockImplementation(async () => verified(user()))
  state.updateUser.mockReset().mockResolvedValue(ok)
  state.verifyOtp.mockReset().mockResolvedValue({ data: { user: null, session: null }, error: null })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    state.admissions.push(String(input))
    return new Response(JSON.stringify(String(input).endsWith('/consume_website_callback_limit') ? state.userAdmissionResult : state.admissionResult), { headers: { 'content-type': 'application/json' } })
  }))
})

describe('authenticated email change', () => {
  it('returns explicit private bodyless 405 for unsupported methods without admission', async () => {
    for (const path of ['request', 'confirm'] as const) {
      const handlers = autoImplementMethods(path === 'request'
        ? await import('../app/api/account/email-change/request/route')
        : await import('../app/api/account/email-change/confirm/route'))
      for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'] as const) {
        const response = await handlers[method](new NextRequest(`https://ante.test/api/account/email-change/${path}`, { method }), {} as never) as Response
        expect([response.status, response.headers.get('allow'), response.headers.get('cache-control'), await response.text()]).toEqual([405, 'POST', 'private, no-store', ''])
      }
    }
    expect(state.admissions).toHaveLength(0)
    expect(state.clients).toHaveLength(0)
  })

  it('rejects hostile headers, selectors, malformed JSON and invalid fields before network access', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    for (const headers of [{ origin: '' }, { origin: 'null' }, { host: 'evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-proto': 'http' }] as Record<string, string>[]) {
      expect((await POST(req('request', requestBody, headers))).status).toBe(403)
    }
    expect((await POST(req('request', requestBody, {}, '?user_id=other'))).status).toBe(400)
    for (const body of ['{', '{}', '[]', JSON.stringify({ newEmail: target, user_id: caller }), JSON.stringify({ newEmail: 'bad' }), JSON.stringify({ newEmail: 1 })]) {
      expect((await POST(req('request', body))).status).toBe(400)
    }
    expect((await POST(req('request', requestBody, { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await POST(req('request', requestBody, { 'content-length': '4097' }))).status).toBe(413)
    expect(state.admissions).toHaveLength(0)
    expect(state.clients).toHaveLength(0)
  })

  it('keeps the operator gate and visitor admission ahead of public Auth', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    delete process.env.ANTE_EMAIL_CHANGE_MODE
    let response = await POST(req('request', requestBody))
    expect([response.status, response.headers.get('retry-after')]).toEqual([503, '60'])
    expect(state.admissions).toHaveLength(0)
    process.env.ANTE_EMAIL_CHANGE_MODE = 'secure-two-inbox-otp'
    state.admissionResult = { allowed: false, retry_after_seconds: 12 }
    response = await POST(req('request', requestBody))
    expect([response.status, response.headers.get('retry-after')]).toEqual([429, '12'])
    expect(state.clients).toHaveLength(0)
  })

  it('rejects missing identity and Auth outages without provisional refresh cookies', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.getUser.mockImplementationOnce(async () => { state.clients[0].write('sb-auth', 'unverified'); return verified(null) })
    expect((await POST(req('request', requestBody))).headers.get('set-cookie')).toBeNull()
    state.getUser.mockRejectedValueOnce(new Error('private transport'))
    const unavailable = await POST(req('request', requestBody))
    expect([unavailable.status, unavailable.headers.get('retry-after'), unavailable.headers.get('set-cookie')]).toEqual([503, '60', null])
    expect(state.updateUser).not.toHaveBeenCalled()
  })

  it('normalizes request target, rejects unchanged address, and consumes fixed user admission before mutation', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    expect((await POST(req('request', { newEmail: ` ${current.toUpperCase()} ` }))).status).toBe(400)
    state.userAdmissionResult = { allowed: false, retry_after_seconds: 9 }
    const limited = await POST(req('request', requestBody))
    expect([limited.status, limited.headers.get('retry-after')]).toEqual([429, '9'])
    expect(state.updateUser).not.toHaveBeenCalled()
    state.userAdmissionResult = { allowed: true, retry_after_seconds: 0 }
    state.getUser.mockImplementationOnce(async () => verified(user(current, null))).mockImplementationOnce(async () => verified(user(current, target)))
    const response = await POST(req('request', requestBody))
    expect([response.status, await response.json()]).toEqual([202, { ok: true }])
    expect(state.updateUser).toHaveBeenCalledWith(3, { email: target })
    expect(state.admissions.filter((url) => url.endsWith('/consume_website_account_limit'))).toHaveLength(3)
    expect(state.admissions.filter((url) => url.endsWith('/consume_website_callback_limit'))).toHaveLength(3)
  })

  it('gives the same receipt for semantic provider rejection while discarding hostile mutation cookies', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.getUser.mockImplementationOnce(async () => { state.clients[0].write('sb-auth', 'refreshed'); return verified(user()) })
    state.updateUser.mockImplementationOnce(async () => { state.clients[1].write('sb-auth', 'hostile'); state.clients[1].write('child', 'private'); return { data: { user: null }, error: { status: 422, message: 'private target exists' } } })
    const response = await POST(req('request', requestBody))
    expect([response.status, await response.json()]).toEqual([202, { ok: true }])
    expect(response.cookies.get('sb-auth')?.value).toBe('refreshed')
    expect(response.cookies.get('child')).toBeUndefined()
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain('private target exists')
  })

  it('does not apply a rejected child cookie deletion over a verified refresh', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.getUser.mockImplementationOnce(async () => { state.clients[0].write('sb-auth', 'refreshed'); return verified(user()) })
    state.updateUser.mockImplementationOnce(async () => { state.clients[1].write('sb-auth', '', 0); return { data: { user: null }, error: { status: 422 } } })
    const response = await POST(req('request', requestBody))
    expect(response.status).toBe(202)
    expect(response.cookies.get('sb-auth')?.value).toBe('refreshed')
  })

  it('requires matching returned and fresh pending state before releasing child cookies', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.updateUser.mockImplementation(async () => { state.clients.at(-1)!.write('child', 'secret'); return ok })
    state.getUser.mockImplementationOnce(async () => verified(user())).mockImplementationOnce(async () => verified(user(current, 'replaced@example.test')))
    const failed = await POST(req('request', requestBody))
    expect([failed.status, failed.headers.get('retry-after'), failed.headers.get('set-cookie')]).toEqual([503, '60', null])
    state.getUser.mockImplementationOnce(async () => verified(user(current, null))).mockImplementationOnce(async () => verified(user(current, target)))
    const accepted = await POST(req('request', requestBody))
    expect(accepted.status).toBe(202)
    expect(accepted.cookies.get('child')?.value).toBe('secret')
  })

  it('requires the provider pending target to exactly match the requested normalized address', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.getUser.mockImplementationOnce(async () => verified(user(current, null))).mockImplementationOnce(async () => verified(user(current, ` ${target.toUpperCase()} `)))
    expect((await POST(req('request', requestBody))).status).toBe(503)
  })

  it('rejects a returned wrong account and maps provider request failures without revealing details', async () => {
    const { POST } = await import('../app/api/account/email-change/request/route')
    state.updateUser.mockResolvedValueOnce({ data: { user: user(current, target, 'wrong') }, error: null })
    expect((await POST(req('request', requestBody))).status).toBe(503)
    for (const [provider, expected, retry] of [[302, 503, '60'], [401, 401, null], [403, 401, null], [408, 503, '60'], [429, 429, '60'], [500, 503, '60']] as const) {
      state.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { status: provider, message: 'private account address' } })
      const response = await POST(req('request', requestBody))
      expect([response.status, response.headers.get('retry-after')]).toEqual([expected, retry])
      expect(await response.text()).not.toContain('private account address')
    }
  })

  it('requires a fresh pending pair and submitted pair member before OTP verification', async () => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    state.getUser.mockResolvedValueOnce(verified(user(current, null)))
    expect((await POST(req('confirm', confirmBody))).status).toBe(400)
    expect((await POST(req('confirm', { email: 'other@example.test', code: '001234' }))).status).toBe(400)
    for (const code of [123456, '12345', '12345678901', '１２３４５６', '123a56']) {
      expect((await POST(req('confirm', { email: target, code }))).status).toBe(400)
    }
    expect(state.verifyOtp).not.toHaveBeenCalled()
  })

  it.each([current, target])('returns pending after %s inbox null/null with unchanged authoritative pair', async (address) => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    state.getUser.mockImplementationOnce(async () => { state.clients.at(-1)!.write('sb-auth', 'refreshed'); return verified(user()) })
    state.verifyOtp.mockImplementationOnce(async () => { state.clients.at(-1)!.write('sb-auth', 'hostile'); return { data: { user: null, session: null }, error: null } })
    const response = await POST(req('confirm', { email: address, code: '001234' }))
    expect([response.status, await response.json()]).toEqual([200, { status: 'pending' }])
    expect(response.cookies.get('sb-auth')?.value).toBe('refreshed')
    expect(state.verifyOtp).toHaveBeenCalledWith(1, { email: address, token: '001234', type: 'email_change' })
  })

  it.each([current, target])('completes after %s inbox matching returned session and fresh child state', async (address) => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    state.verifyOtp.mockImplementationOnce(async () => { state.clients[1].write('sb-auth', 'completed'); return { data: { user: user(target, null), session: { user: user(target, null) } }, error: null } })
    state.getUser.mockImplementationOnce(async () => verified(user())).mockImplementationOnce(async () => verified(user(target, '')))
    const response = await POST(req('confirm', { email: address, code: '001234' }))
    expect([response.status, await response.json(), response.cookies.get('sb-auth')?.value]).toEqual([200, { status: 'completed' }, 'completed'])
  })

  it('maps bad OTP, malformed result, wrong-account session, replacement and postflight outage to fixed failures without child cookies', async () => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    const cases = [
      { result: { data: { user: null, session: null }, error: { status: 400, message: 'private code' } }, status: 401 },
      { result: { data: { user: null, session: { user: user() } }, error: null }, status: 503 },
      { result: { data: { user: user(target, null, 'wrong'), session: { user: user(target, null) } }, error: null }, status: 503 },
      { result: { data: { user: user(target, null), session: { user: user(target, null, 'wrong') } }, error: null }, status: 503 },
    ]
    for (const testCase of cases) {
      state.verifyOtp.mockImplementationOnce(async () => { state.clients.at(-1)!.write('child', 'private'); return testCase.result })
      const response = await POST(req('confirm', confirmBody))
      expect(response.status).toBe(testCase.status)
      expect(response.cookies.get('child')).toBeUndefined()
      expect(await response.text()).not.toContain('private code')
    }
    state.getUser.mockImplementationOnce(async () => verified(user())).mockImplementationOnce(async () => verified(user(current, 'replaced@example.test')))
    expect((await POST(req('confirm', confirmBody))).status).toBe(503)
    state.getUser.mockImplementationOnce(async () => verified(user())).mockRejectedValueOnce(new Error('private outage'))
    expect((await POST(req('confirm', confirmBody))).status).toBe(503)
  })

  it('does not claim pending if a null/null result is followed by changed account state', async () => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    state.getUser.mockImplementationOnce(async () => verified(user())).mockImplementationOnce(async () => verified(user(target, null)))
    const response = await POST(req('confirm', confirmBody))
    expect([response.status, response.headers.get('retry-after')]).toEqual([503, '60'])
  })

  it('does not claim completion on changed target, uncleared pending state, or a provider throttle', async () => {
    const { POST } = await import('../app/api/account/email-change/confirm/route')
    for (const returned of [user('replaced@example.test', null), user(` ${target.toUpperCase()} `, null), user(target, 'still@example.test'), user(target, ' ')]) {
      state.verifyOtp.mockResolvedValueOnce({ data: { user: returned, session: { user: returned } }, error: null })
      expect((await POST(req('confirm', confirmBody))).status).toBe(503)
    }
    state.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { status: 429, message: 'private' } })
    const response = await POST(req('confirm', confirmBody))
    expect([response.status, response.headers.get('retry-after')]).toEqual([429, '60'])
  })
})
