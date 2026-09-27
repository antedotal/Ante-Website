import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { verifyProfilePhotoSession, reverifyProfilePhotoSession } from '../lib/server/profile-photo-session'
import { createCallbackClient } from '../lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: vi.fn(actual.createClient) }
})
const sdk = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }))
vi.mock('../lib/supabase/server', () => ({ createCallbackClient: vi.fn(() => ({ auth: sdk })) }))

const owner = '00000000-0000-4000-8000-000000000001'
const forged = '00000000-0000-4000-8000-000000000002'
const token = 'exact.checked.token'
const request = (signal?: AbortSignal) => new NextRequest('https://ante.test/api/profiles/x/photo', { signal })
const session = () => ({ data: { session: { access_token: token, user: { id: forged } } }, error: null })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  sdk.getSession.mockResolvedValue(session())
  sdk.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('returns fixed 503 when SDK getSession never settles after one 30-second cap', async () => {
  vi.useFakeTimers()
  sdk.getSession.mockImplementation(() => new Promise(() => {}))
  const observed = verifyProfilePhotoSession(request())
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await observed).toEqual({ kind: 'failed', status: 503 })
  expect(sdk.getUser).not.toHaveBeenCalled()
})

it('shares one 30-second cap across SDK initialization and exact-token getUser', async () => {
  vi.useFakeTimers()
  sdk.getSession.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(session()), 20_000)))
  sdk.getUser.mockImplementation(() => new Promise(() => {}))
  const observed = verifyProfilePhotoSession(request())
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await observed).toEqual({ kind: 'failed', status: 503 })
  expect(sdk.getUser).toHaveBeenCalledWith(token)
})

it.each(['request', 'parent'] as const)('returns fixed 503 on %s abort and prevents subsequent getUser', async (which) => {
  const requestAbort = new AbortController()
  const parentAbort = new AbortController()
  sdk.getSession.mockImplementation(() => new Promise(() => {}))
  const observed = verifyProfilePhotoSession(request(requestAbort.signal), parentAbort.signal)
  ;(which === 'request' ? requestAbort : parentAbort).abort()
  expect(await observed).toEqual({ kind: 'failed', status: 503 })
  expect(sdk.getUser).not.toHaveBeenCalled()
})

it('uses the extracted exact token and fresh getUser identity, preserving successful refresh cookies', async () => {
  vi.mocked(createCallbackClient).mockImplementationOnce((_request, provisional) => {
    provisional.cookies.set('sb-auth', 'rotated', { secure: true })
    return { auth: sdk } as never
  })
  const result = await verifyProfilePhotoSession(request())
  expect(result.kind).toBe('verified')
  if (result.kind !== 'verified') return
  expect(result.session.ownerId).toBe(owner)
  expect(result.session.ownerId).not.toBe(forged)
  expect(result.session.token).toBe(token)
  expect(result.session.provisional.headers.get('set-cookie')).toContain('rotated')
  expect(sdk.getUser).toHaveBeenCalledWith(token)
})

it('does not return a verified result from session.user when fresh getUser fails', async () => {
  sdk.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
  expect(await verifyProfilePhotoSession(request())).toEqual({ kind: 'failed', status: 401 })
})

// Final Auth uses a separate SDK client and never receives the initial response's cookie adapter.
const verified = () => {
  const provisional = new NextResponse()
  provisional.cookies.set('sb-auth', 'initial-refresh', { secure: true })
  return { ownerId: owner, token, provisional }
}

it('performs only exact-token final getUser and leaves provisional cookies untouched', async () => {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null })
  const getSession = vi.fn(); const refreshSession = vi.fn()
  vi.mocked(createClient).mockReturnValueOnce({ auth: { getUser, getSession, refreshSession } } as never)
  const initial = verified(); const cookies = initial.provisional.headers.get('set-cookie')
  expect(await reverifyProfilePhotoSession(initial, new AbortController().signal)).toEqual({ kind: 'verified' })
  expect(getUser).toHaveBeenCalledExactlyOnceWith(token)
  expect(getSession).not.toHaveBeenCalled(); expect(refreshSession).not.toHaveBeenCalled()
  expect(createClient).toHaveBeenCalledWith(process.env.NEXT_PUBLIC_SUPABASE_URL, 'sb_publishable_testvalue', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: expect.any(Function) },
  })
  expect(createCallbackClient).not.toHaveBeenCalled()
  expect(initial.provisional.headers.get('set-cookie')).toBe(cookies)
})

it.each([
  [{ id: forged }, null, 401], [null, null, 503], [{ id: 'UPPERCASE' }, null, 503],
  [null, { status: 401 }, 401], [null, { status: 403 }, 401], [null, { status: 429 }, 503],
  [null, { status: 408 }, 503], [null, { status: 500 }, 503], [null, { status: 302 }, 503],
])('maps final Auth identity or error to fixed status %#', async (user, error, status) => {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error })
  vi.mocked(createClient).mockReturnValueOnce({ auth: { getUser } } as never)
  const initial = verified(); const cookies = initial.provisional.headers.get('set-cookie')
  expect(await reverifyProfilePhotoSession(initial, new AbortController().signal)).toEqual({ kind: 'failed', status })
  expect(getUser).toHaveBeenCalledExactlyOnceWith(token)
  expect(initial.provisional.headers.get('set-cookie')).toBe(cookies)
})

it('bounds stuck final SDK initialization/getUser at ten seconds and prevents post-abort I/O', async () => {
  vi.useFakeTimers()
  const getUser = vi.fn(() => new Promise(() => {}))
  vi.mocked(createClient).mockReturnValueOnce({ auth: { getUser } } as never)
  const pending = reverifyProfilePhotoSession(verified(), new AbortController().signal)
  await vi.advanceTimersByTimeAsync(10000)
  expect(await pending).toEqual({ kind: 'failed', status: 503 })
  expect(getUser).toHaveBeenCalledExactlyOnceWith(token)
  expect(vi.getTimerCount()).toBe(0)
  const parent = new AbortController(); parent.abort()
  vi.mocked(createClient).mockClear()
  expect(await reverifyProfilePhotoSession(verified(), parent.signal)).toEqual({ kind: 'failed', status: 503 })
  expect(createClient).not.toHaveBeenCalled()
})

it('returns unavailable on parent abort while final SDK settlement is stuck', async () => {
  const getUser = vi.fn(() => new Promise(() => {}))
  vi.mocked(createClient).mockReturnValueOnce({ auth: { getUser } } as never)
  const parent = new AbortController()
  const pending = reverifyProfilePhotoSession(verified(), parent.signal)
  await Promise.resolve(); parent.abort()
  expect(await pending).toEqual({ kind: 'failed', status: 503 })
})

it('uses the installed SDK with one public-key exact-token user request and no session persistence', async () => {
  const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js')
  vi.mocked(createClient).mockImplementationOnce(actual.createClient)
  const transport = vi.fn(async () => new Response(JSON.stringify({ id: owner, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', transport)
  const initial = verified(); const cookies = initial.provisional.headers.get('set-cookie')
  expect(await reverifyProfilePhotoSession(initial, new AbortController().signal)).toEqual({ kind: 'verified' })
  expect(transport).toHaveBeenCalledOnce()
  const [url, init] = vi.mocked(fetch).mock.calls[0]
  expect(String(url)).toBe(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`)
  const headers = new Headers(init?.headers)
  expect(headers.get('apikey')).toBe('sb_publishable_testvalue')
  expect(headers.get('authorization')).toBe(`Bearer ${token}`)
  expect(headers.get('cookie')).toBeNull()
  expect(initial.provisional.headers.get('set-cookie')).toBe(cookies)
  expect(createCallbackClient).not.toHaveBeenCalled()
})

it.each([401, 403, 408, 429, 500, 302])('isolates final installed-SDK denial at HTTP %s from initial refresh cookies', async status => {
  const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js')
  vi.mocked(createClient).mockImplementationOnce(actual.createClient)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'session_not_found', detail: 'private-provider-detail' }), { status })))
  const initial = verified(); const cookies = initial.provisional.headers.get('set-cookie')
  expect(await reverifyProfilePhotoSession(initial, new AbortController().signal)).toEqual({ kind: 'failed', status: status === 401 || status === 403 ? 401 : 503 })
  expect(fetch).toHaveBeenCalledOnce()
  expect(initial.provisional.headers.get('set-cookie')).toBe(cookies)
  expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('private-provider-detail')
  log.mockRestore()
})
