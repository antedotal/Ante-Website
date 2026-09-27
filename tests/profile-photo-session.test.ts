import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyProfilePhotoSession } from '../lib/server/profile-photo-session'
import { createCallbackClient } from '../lib/supabase/server'

vi.mock('server-only', () => ({}))
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
afterEach(() => vi.useRealTimers())

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
