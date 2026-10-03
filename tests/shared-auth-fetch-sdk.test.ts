import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const projectUrl = 'https://yxilmwxptfnebnjsikwo.supabase.co'
const privateText = 'private-provider-detail@example.test secret-refresh-004321'

function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = projectUrl
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
}

function expiredRequest() {
  const session = {
    access_token: 'expired-access-token', refresh_token: 'expired-refresh-token', token_type: 'bearer',
    expires_at: 1, expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: 'current@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} },
  }
  return new NextRequest('https://ante.test/auth/callback', {
    headers: { cookie: `sb-yxilmwxptfnebnjsikwo-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` },
  })
}

async function refreshThroughOlderAdapter() {
  const { createCallbackClient } = await import('../lib/supabase/server')
  const client = createCallbackClient(expiredRequest(), NextResponse.next())
  await new Promise<void>((resolve) => {
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') {
        data.subscription.unsubscribe()
        resolve()
      }
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => vi.unstubAllGlobals())

it('keeps rejected transport details out of installed SDK logs on the older callback adapter', async () => {
  configure()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(privateText) }))
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { createCallbackClient } = await import('../lib/supabase/server')
    const result = await createCallbackClient(new NextRequest('https://ante.test/auth/callback'), NextResponse.next())
      .auth.verifyOtp({ email: 'current@example.test', token: '004321', type: 'email' })
    expect(result.error).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
    expect(logged.mock.calls.flat().map(String).join(' ')).not.toContain(privateText)
  } finally { logged.mockRestore() }
})

it('keeps failed HTTP body and status text out of expired refresh logs on the older adapter', async () => {
  configure()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'provider_error', msg: privateText }), {
    status: 400, statusText: privateText, headers: { 'content-type': 'application/json' },
  })))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await refreshThroughOlderAdapter()
    expect(fetch).toHaveBeenCalled()
    expect([...error.mock.calls, ...warn.mock.calls].flat().map(String).join(' ')).not.toContain(privateText)
  } finally { error.mockRestore(); warn.mockRestore() }
})

it('keeps malformed successful JSON out of expired refresh logs on the older adapter', async () => {
  configure()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(privateText, {
    status: 200, headers: { 'content-type': 'application/json' },
  })))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { createCallbackClient } = await import('../lib/supabase/server')
    const client = createCallbackClient(expiredRequest(), NextResponse.next())
    const initial = new Promise<void>((resolve) => {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION') {
          data.subscription.unsubscribe()
          resolve()
        }
      })
    })
    await vi.advanceTimersByTimeAsync(120000)
    await initial
    await Promise.resolve()
    expect(fetch).toHaveBeenCalled()
    expect([...error.mock.calls, ...warn.mock.calls].flat().map(String).join(' ')).not.toContain('private-pr')
  } finally { error.mockRestore(); warn.mockRestore(); vi.useRealTimers() }
})
