import { afterEach, expect, it, vi } from 'vitest'
import { createAuthFetch } from '../lib/supabase/auth-fetch'

vi.mock('server-only', () => ({}))

const project = 'https://yxilmwxptfnebnjsikwo.supabase.co'
const secret = 'private-provider@example.test secret-token-004321'

afterEach(() => vi.unstubAllGlobals())

it.each([400, 401, 429, 503])('replaces only Auth HTTP %s details and cancels its discarded body', async (status) => {
  const cancel = vi.fn(async () => {})
  const body = new ReadableStream({ cancel })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    status, statusText: secret,
    headers: { 'content-type': 'application/json', 'x-provider-detail': secret },
  })))
  const response = await createAuthFetch(project)(`${project}/auth/v1/token?private=${secret}`)
  expect(response.status).toBe(status)
  expect(response.statusText).not.toContain(secret)
  expect(response.headers.get('x-provider-detail')).toBeNull()
  expect(await response.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
  expect(cancel).toHaveBeenCalledOnce()
})

it('does not wait for a hostile body cancellation promise', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 400 })))
  const response = await createAuthFetch(project)(`${project}/auth/v1/user`)
  expect(response.status).toBe(400)
  expect(cancel).toHaveBeenCalledOnce()
})

it('sanitizes Auth transport and successful JSON parse failures without changing valid success streams', async () => {
  const original = new Response(JSON.stringify({ user: { id: 'verified' } }), {
    status: 200, headers: { 'x-api-version': '2024-01-01' },
  })
  const transport = vi.fn(async () => original)
  vi.stubGlobal('fetch', transport)
  const fetcher = createAuthFetch(project)
  const success = await fetcher(new URL(`${project}/auth/v1/user`))
  expect(success).toBe(original)
  expect(success.bodyUsed).toBe(false)
  expect(success.headers.get('x-api-version')).toBe('2024-01-01')
  expect(await success.json()).toEqual({ user: { id: 'verified' } })
  const malformed = new Response(secret, { status: 200 })
  transport.mockImplementationOnce(async () => malformed)
  const parsed = await fetcher(new Request(`${project}/auth/v1/user`))
  expect(parsed).toBe(malformed)
  const parseError = await parsed.json().catch((error: unknown) => error)
  expect(parseError).toBeInstanceOf(SyntaxError)
  expect(parseError).toMatchObject({ message: 'Invalid Auth response JSON' })
  expect(Object.hasOwn(parseError, 'cause')).toBe(false)
  transport.mockImplementationOnce(async () => { throw new Error(secret) })
  const transportError = await fetcher(`${project}/auth/v1/token`).catch((error: unknown) => error)
  expect(transportError).toBeInstanceOf(Error)
  expect(transportError).toMatchObject({ message: 'Auth transport unavailable' })
  expect(Object.hasOwn(transportError as Error, 'cause')).toBe(false)
})

it('passes RPC and Storage response identity, SQL envelopes, headers and rejection values unchanged', async () => {
  const fetcher = createAuthFetch(project)
  const bodyCases = [
    [`${project}/rest/v1/rpc/get_my_profile_name`, { code: 'P0002', details: secret, message: secret }],
    [`${project}/rest/v1/rpc/set_my_profile_name`, { code: '22023', details: secret, message: secret }],
    [`${project}/storage/v1/object/private-avatar`, { error: secret }],
  ] as const
  for (const [url, body] of bodyCases) {
    const response = new Response(JSON.stringify(body), { status: 409, statusText: secret, headers: { 'x-provider-detail': secret } })
    vi.stubGlobal('fetch', vi.fn(async () => response))
    const result = await fetcher(url)
    expect(result).toBe(response)
    expect(result.status).toBe(409)
    expect(result.statusText).toBe(secret)
    expect(result.headers.get('x-provider-detail')).toBe(secret)
    expect(await result.json()).toEqual(body)
  }
  const thrown = new Error(secret)
  vi.stubGlobal('fetch', vi.fn(async () => { throw thrown }))
  await expect(fetcher(`${project}/rest/v1/rpc/get_my_profile_name`)).rejects.toBe(thrown)
})

it.each([
  `${project}/auth/v10/token`, `${project}/auth/v1evil/token`,
  `https://yxilmwxptfnebnjsikwo.supabase.co.evil.test/auth/v1/token`,
  `https://evil.test/auth/v1/token`, `https://yxilmwxptfnebnjsikwo.supabase.co:444/auth/v1/token`,
])('passes lookalike or foreign URL through unchanged: %s', async (url) => {
  const response = new Response(secret, { status: 400 })
  vi.stubGlobal('fetch', vi.fn(async () => response))
  const result = await createAuthFetch(project)(url)
  expect(result).toBe(response)
  expect(await result.text()).toBe(secret)
})

it('classifies exact Auth root, URL, and Request inputs while preserving non-Auth Request input', async () => {
  const response = new Response(secret, { status: 400 })
  vi.stubGlobal('fetch', vi.fn(async () => response))
  const fetcher = createAuthFetch(project)
  expect(await (await fetcher(`${project}/auth/v1`)).text()).not.toContain(secret)
  expect(await (await fetcher(new URL(`${project}/auth/v1/token`))).text()).not.toContain(secret)
  expect(await (await fetcher(new Request(`${project}/auth/v1/user`))).text()).not.toContain(secret)
  const storage = await fetcher(new Request(`${project}/storage/v1/object/file`))
  expect(storage).toBe(response)
})

it('rejects malformed input with a fixed error without passing private text to transport', async () => {
  const transport = vi.fn()
  vi.stubGlobal('fetch', transport)
  const error = await createAuthFetch(project)(`invalid-${secret}`).catch((failure: unknown) => failure)
  expect(error).toBeInstanceOf(Error)
  expect(error).toMatchObject({ message: 'Invalid Auth request URL' })
  expect(Object.hasOwn(error as Error, 'cause')).toBe(false)
  expect(transport).not.toHaveBeenCalled()
})
