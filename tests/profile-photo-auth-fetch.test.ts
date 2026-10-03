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

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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

it.each([
  [206, {}],
  [200, { 'content-range': 'bytes 0-12/13' }],
] as const)('rejects a partial success with valid JSON at HTTP %s', async (status, headers) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"user":{}}', { status, headers })))
  await expect(createProfilePhotoAuthFetch(project, new AbortController().signal)(url)).rejects.toThrow('Profile photo Auth unavailable')
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

it('returns a known error status at the ten-second operation deadline when its body stalls', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  const transport = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 9_500))
    return new Response(new ReadableStream({ cancel }), { status: 403 })
  })
  vi.stubGlobal('fetch', transport)
  const pending = createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url)
  const observed = pending.catch(error => error)
  await vi.advanceTimersByTimeAsync(10_000)
  const response = await observed
  expect(response).toBeInstanceOf(Response)
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
  expect(transport).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('fails with a fixed error when owner aborts after error headers arrive', async () => {
  const owner = new AbortController()
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 403 })))
  const pending = createProfilePhotoAuthFetch(project, owner.signal)(url)
  const observed = pending.catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  owner.abort()
  const result = await observed
  expect(result).toBeInstanceOf(Error)
  expect(result.message).toBe('Profile photo Auth unavailable')
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

// A Worker clock can stay frozen during ready microtasks; a finite producer ceiling keeps regressions safe.
it.each([200, 403])('bounds ready empty Auth chunks at status %s without clock progress or timer callbacks', async status => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  let reads = 0
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (++reads > 80) { controller.close(); return }
    controller.enqueue(new Uint8Array())
  }, cancel }, { highWaterMark: 0 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
  const observed = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url).catch(error => error)
  expect(reads).toBe(33)
  expect(cancel).toHaveBeenCalledOnce()
  if (status === 200) expect(observed).toBeInstanceOf(Error)
  else {
    expect(observed.status).toBe(403)
    expect(await observed.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
  }
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
})

it('resets empty progress counts and copies mutable Auth producer chunks', async () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const pieces = ['{"a":', 'true}']; const shared = new Uint8Array(5)
  let reads = 0
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    reads++
    if (reads === 33 || reads === 66) { shared.set(new TextEncoder().encode(pieces.shift()!)); controller.enqueue(shared) }
    else if (reads > 66) controller.close()
    else controller.enqueue(new Uint8Array())
  } }, { highWaterMark: 0 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
  const result = await createProfilePhotoAuthFetch(project, new AbortController().signal)(url)
  expect(await result.json()).toEqual({ a: true })
  expect(reads).toBe(67)
  vi.restoreAllMocks()
})

it.each([200, 403])('checks the operation deadline after settled fetch/read without timer dispatch at %s', async status => {
  vi.useFakeTimers()
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const cancel = vi.fn()
  let reads = 0
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (++reads > 80) { controller.close(); return }
    now = 10000; controller.enqueue(new TextEncoder().encode('{"ok":true}'))
  }, cancel }, { highWaterMark: 0 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
  const result = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url).catch(error => error)
  if (status === 200) expect(result).toBeInstanceOf(Error)
  else { expect(result.status).toBe(403); expect(await result.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' }) }
  expect(reads).toBe(1)
  expect(cancel).toHaveBeenCalledOnce()
  vi.restoreAllMocks()
})

it('checks the shorter received-error body deadline even when timers cannot run', async () => {
  vi.useFakeTimers()
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  let reads = 0
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (++reads === 1) { now = 1000; controller.enqueue(new TextEncoder().encode('{"error_code":"session_not_found"}')) }
    else controller.close()
  }, cancel }, { highWaterMark: 0 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 403 })))
  const result = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url)
  expect(await result.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' })
  expect(reads).toBe(1); expect(cancel).toHaveBeenCalledOnce()
  vi.restoreAllMocks()
})

it.each([200, 403])('checks the monotonic bound after late fetch headers at status %s', async status => {
  vi.useFakeTimers()
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const cancel = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => {
    now = 10000
    return new Response(new ReadableStream({ cancel }), { status })
  }))
  const result = await createAuthFetch(project, createProfilePhotoAuthFetch(project, new AbortController().signal))(url).catch(error => error)
  if (status === 200) expect(result).toBeInstanceOf(Error)
  else { expect(result.status).toBe(403); expect(await result.json()).toEqual({ code: 'auth_error', msg: 'Authentication request failed' }) }
  expect(cancel).toHaveBeenCalledOnce()
})
