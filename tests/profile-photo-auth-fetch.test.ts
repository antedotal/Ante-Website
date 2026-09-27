import { afterEach, expect, it, vi } from 'vitest'
import { createProfilePhotoAuthFetch } from '../lib/server/profile-photo-auth-fetch'
import { createAuthFetch } from '../lib/supabase/auth-fetch'

vi.mock('server-only', () => ({}))

const project = 'https://yxilmwxptfnebnjsikwo.supabase.co'
const url = `${project}/auth/v1/user`
const secret = 'private-provider-token-123'
const json = (value: string, headers: Record<string, string> = {}) => new Response(value, {
  headers: { 'content-type': 'application/json', ...headers },
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('accepts exactly 65536 complete JSON bytes', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(65524) })
  expect(new TextEncoder().encode(body)).toHaveLength(65536)
  vi.stubGlobal('fetch', vi.fn(async () => json(body)))
  const result = await createProfilePhotoAuthFetch(project, new AbortController().signal)(url)
  expect(await result.json()).toEqual({ value: 'x'.repeat(65524) })
})

it('rejects 65537 successful bytes without Content-Length and cancels the stream', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ value: 'x'.repeat(65525) }))) }, cancel,
  }), { headers: { 'content-type': 'application/json' } })))
  const result = createProfilePhotoAuthFetch(project, new AbortController().signal)(url)
  await expect(result).rejects.toThrow('Profile photo Auth unavailable')
  expect(cancel).toHaveBeenCalledOnce()
})

it.each(['invalid', '65537', '12'])('rejects malformed, excessive or lying success length %s', async (length) => {
  vi.stubGlobal('fetch', vi.fn(async () => json('{"user":{}}', { 'content-length': length })))
  await expect(createProfilePhotoAuthFetch(project, new AbortController().signal)(url)).rejects.toThrow('Profile photo Auth unavailable')
})

it('rejects malformed success JSON and redirect responses', async () => {
  const transport = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => { void args; return json(secret) })
  vi.stubGlobal('fetch', transport)
  const bounded = createProfilePhotoAuthFetch(project, new AbortController().signal)
  await expect(bounded(url)).rejects.toThrow('Profile photo Auth unavailable')
  transport.mockImplementationOnce(async () => new Response(null, { status: 302, headers: { location: `https://evil.test/${secret}` } }))
  await expect(bounded(url)).rejects.toThrow('Profile photo Auth unavailable')
  expect(transport.mock.calls[1]?.[1]).toMatchObject({ redirect: 'manual' })
})

it.each([`${project}/storage/v1/object/x`, 'https://evil.test/auth/v1/user', 'http://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/user'])('rejects a foreign or non-Auth URL before transport: %s', async (address) => {
  const transport = vi.fn(async () => json('{}'))
  vi.stubGlobal('fetch', transport)
  await expect(createProfilePhotoAuthFetch(project, new AbortController().signal)(address)).rejects.toThrow('Profile photo Auth unavailable')
  expect(transport).not.toHaveBeenCalled()
})

it('keeps malformed project configuration out of errors', () => {
  expect(() => createProfilePhotoAuthFetch(`invalid-${secret}`, new AbortController().signal)).toThrow('Profile photo Auth unavailable')
})

it('bounds stalled fetch at 10 seconds and cancels a late response without awaiting cancel', async () => {
  vi.useFakeTimers()
  const late = deferred<Response>()
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(() => late.promise))
  const pending = createProfilePhotoAuthFetch(project, new AbortController().signal)(url)
  const observed = pending.catch(error => error)
  await vi.advanceTimersByTimeAsync(10_000)
  expect((await observed).message).toBe('Profile photo Auth unavailable')
  late.resolve(new Response(new ReadableStream({ cancel })))
  await Promise.resolve()
  await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
})

it('bounds a stalled successful body at 10 seconds even when cancel never settles', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }))))
  const observed = createProfilePhotoAuthFetch(project, new AbortController().signal)(url).catch(error => error)
  await vi.advanceTimersByTimeAsync(10_000)
  expect((await observed).message).toBe('Profile photo Auth unavailable')
  expect(cancel).toHaveBeenCalledOnce()
})

it.each(['request', 'init', 'owner'] as const)('stops I/O on %s abort', async (which) => {
  const request = new AbortController()
  const init = new AbortController()
  const owner = new AbortController()
  const transport = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => { void args; return new Promise<Response>(() => {}) })
  vi.stubGlobal('fetch', transport)
  const pending = createProfilePhotoAuthFetch(project, owner.signal)(new Request(url, { signal: request.signal }), { signal: init.signal })
  const observed = pending.catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  ;({ request, init, owner })[which].abort()
  expect((await observed).message).toBe('Profile photo Auth unavailable')
  expect((transport.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true)
})

it('does not issue transport I/O if its owner is already aborted', async () => {
  const owner = new AbortController(); owner.abort()
  const transport = vi.fn()
  vi.stubGlobal('fetch', transport)
  await expect(createProfilePhotoAuthFetch(project, owner.signal)(url)).rejects.toThrow('Profile photo Auth unavailable')
  expect(transport).not.toHaveBeenCalled()
})

it('keeps bounded error status and revoked classification through the existing sanitizer', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'session_not_found', detail: secret }), { status: 403 })))
  const result = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url)
  expect(result.status).toBe(403)
  expect(await result.json()).toEqual({ code: 'auth_error', error_code: 'session_not_found', msg: 'Authentication request failed' })
})

it.each(['oversize', 'stalled'] as const)('preserves error status but drops %s error body', async (kind) => {
  vi.useFakeTimers()
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    start(controller) { if (kind === 'oversize') controller.enqueue(new TextEncoder().encode(JSON.stringify({ error_code: 'session_not_found', padding: 'x'.repeat(2048) }))) }, cancel,
  }), { status: 403 })))
  const pending = createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url)
  await vi.advanceTimersByTimeAsync(1000)
  const result = await pending
  expect(result.status).toBe(403)
  expect(await result.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
  expect(cancel).toHaveBeenCalledOnce()
})

it('preserves an Auth error status while dropping a malformed-length body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'session_not_found' }), {
    status: 403, headers: { 'content-length': 'private-invalid' },
  })))
  const response = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url)
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
})

it('keeps raw network error text out of the SDK-facing error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(secret) }))
  const error = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url).catch(error => error)
  expect(error.message).toBe('Auth transport unavailable')
  expect(String(error)).not.toContain(secret)
})
