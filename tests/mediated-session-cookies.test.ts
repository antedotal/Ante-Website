// Exercise the installed SSR/Auth implementations through the production session boundary;
// only provider HTTP is replaced, so hidden SDK initialization and retry calls remain visible.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyProfilePhotoSession, reverifyProfilePhotoSession } from '../lib/server/profile-photo-session'
import { createCallbackClient } from '../lib/supabase/server'
import { createProfilePhotoAuthFetch } from '../lib/server/profile-photo-auth-fetch'

vi.mock('server-only', () => ({}))
const origin = 'https://ante.test'
const owner = '00000000-0000-4000-8000-000000000001'
const token = 'exact.initial.token'
const refreshedToken = 'exact.refreshed.token'
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
  email_confirmed_at: '2026-01-01T00:00:00Z', phone: '', confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_anonymous: false }
const session = (expires = 3600, access = token) => ({ access_token: access, token_type: 'bearer', expires_in: Math.max(1, expires),
  expires_at: Math.floor(Date.now() / 1000) + expires, refresh_token: 'genuine-shaped-refresh-token', user })
const cookieModule = () => import('../scripts/acceptance/hosted-profile-photo-mediated-cookies.mjs')
const request = (header: string) => new NextRequest(`${origin}/api/profiles/${owner}/photo`, { headers: { cookie: header } })

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = origin
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('has a cookie serializer without constructing or calling a provider client', async () => {
  const cookieExports = await cookieModule().catch(() => null)
  expect(cookieExports?.sessionCookies).toBeTypeOf('function')
})

it.each([false, true])('complete genuine-shaped SSR session refresh=%s has exactly two checks plus optional refresh', async forceRefresh => {
  const { sessionCookies, cookieHeader, applyResponseCookies, sessionFromCookies } = await cookieModule()
  const calls: Array<{ path: string; bearer: string | null }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ path: new URL(url).pathname, bearer: new Headers(init.headers).get('authorization') })
    return Response.json(url.includes('/token?') ? session(3600, refreshedToken) : user)
  })
  const jar = sessionCookies(session(), origin, { forceRefresh })
  expect(calls).toHaveLength(0)
  const deadline = new AbortController()
  const initial = await verifyProfilePhotoSession(request(cookieHeader(jar, origin)), deadline.signal)
  expect(initial.kind).toBe('verified')
  if (initial.kind !== 'verified') throw Error('initial verification failed')
  expect(initial.session.ownerId).toBe(owner)
  expect(await reverifyProfilePhotoSession(initial.session, deadline.signal)).toEqual({ kind: 'verified' })
  expect(calls.filter(call => call.path === '/auth/v1/user')).toEqual([
    { path: '/auth/v1/user', bearer: `Bearer ${forceRefresh ? refreshedToken : token}` },
    { path: '/auth/v1/user', bearer: `Bearer ${forceRefresh ? refreshedToken : token}` },
  ])
  expect(calls).toHaveLength(forceRefresh ? 3 : 2)
  applyResponseCookies(jar, initial.session.provisional.headers, origin)
  expect((await sessionFromCookies(jar)).access_token).toBe(forceRefresh ? refreshedToken : token)
})

// Advancing fake time beyond all retry windows exposes continuations that outlive the request.
// Removing the shared signal guard, SDK retries, or full session user field breaks these cases.
it.each(['503', 'network', 'retry-success', 'margin', 'short-lived'] as const)(
  'installed SDK %s path stays within 26 Auth dispatches and cannot dispatch after shared abort', async mode => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
    vi.spyOn(console, 'error').mockImplementation(() => {}) // SDK logs safe synthetic transport failures.
    const { sessionCookies, cookieHeader } = await cookieModule()
    const deadline = new AbortController()
    const startedAt = Date.now()
    const calls: Array<{ elapsed: number; path: string; aborted: boolean }> = []
    let refreshes = 0
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push({ elapsed: Date.now() - startedAt, path: new URL(url).pathname, aborted: deadline.signal.aborted })
      if (!url.includes('/token?')) return Response.json(user)
      refreshes++
      if (mode === 'network') throw Error('synthetic offline')
      if (mode === '503' || mode === 'retry-success' && refreshes < 4) return Response.json({ message: 'synthetic unavailable' }, { status: 503 })
      return Response.json(session(mode === 'short-lived' ? 1 : 3600, refreshedToken))
    })
    const jar = sessionCookies(session(mode === 'margin' ? 30 : -1), origin)
    const timer = setTimeout(() => deadline.abort(), 30_000)
    const result = (async () => {
      const initial = await verifyProfilePhotoSession(request(cookieHeader(jar, origin)), deadline.signal)
      if (initial.kind === 'verified') await reverifyProfilePhotoSession(initial.session, deadline.signal)
      return initial
    })()
    await vi.advanceTimersByTimeAsync(30_000)
    const settled = await result
    const atAbort = calls.length
    await vi.advanceTimersByTimeAsync(180_000)
    expect(calls.length).toBe(atAbort)
    expect(calls.length).toBeLessThanOrEqual(26)
    expect(calls.every(call => call.elapsed < 30_000 && !call.aborted)).toBe(true)
    expect(refreshes).toBeGreaterThan(0)
    if (mode === '503' || mode === 'network') {
      expect(settled).toEqual({ kind: 'failed', status: 503 })
      expect(refreshes).toBe(8)
    } else expect(settled.kind).toBe('verified')
    clearTimeout(timer)
  },
)

it.each(['concurrent', 'serial'] as const)('initialization/listener and explicit session loads settle %s under the same abort', async settlement => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { sessionCookies, cookieHeader } = await cookieModule()
  const { NextResponse } = await import('next/server')
  const deadline = new AbortController()
  let calls = 0, afterAbort = 0
  vi.stubGlobal('fetch', async () => { calls++; if (deadline.signal.aborted) afterAbort++; return Response.json({ message: 'unavailable' }, { status: 503 }) })
  const req = request(cookieHeader(sessionCookies(session(-1), origin), origin))
  const client = createCallbackClient(req, new NextResponse(), createProfilePhotoAuthFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!, deadline.signal))
  setTimeout(() => deadline.abort(), 30_000)
  // Client construction starts initialization and registers its session listener; both
  // use the same real transport as explicit getSession. Do not replace SDK methods.
  const work = settlement === 'concurrent'
    ? Promise.all([client.auth.getSession(), client.auth.getSession()])
    : client.auth.getSession().then(() => client.auth.getSession())
  await vi.advanceTimersByTimeAsync(30_000)
  const atAbort = calls
  await vi.advanceTimersByTimeAsync(180_000)
  await work
  expect(calls).toBe(atAbort)
  expect(afterAbort).toBe(0)
  expect(calls).toBeLessThanOrEqual(26)
  expect(calls).toBe(13)
})
