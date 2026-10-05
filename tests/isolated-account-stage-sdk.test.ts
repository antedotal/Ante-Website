import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

it('sanitizes rejected Auth transport errors before the installed SDK logs them', async () => {
  const privateText = 'private-email@example.test secret-code-004321 private-upstream-url'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(privateText) }))
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const stage = createIsolatedAccountStage(new NextRequest('https://ante.test/api/account/email-change/confirm'))
    const result = await stage.client.auth.verifyOtp({ email: 'private-email@example.test', token: '004321', type: 'email_change' })
    expect(result.error).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
    const logged = errorLog.mock.calls.flat().map(String).join(' ')
    expect(logged).not.toContain('private-email@example.test')
    expect(logged).not.toContain('secret-code-004321')
    expect(logged).not.toContain('private-upstream-url')
    expect(JSON.stringify(result.error)).not.toContain(privateText)
  } finally {
    errorLog.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('does not log private provider details during an expired session refresh', async () => {
  const privateText = 'private-provider-detail@example.test secret-refresh-004321'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  const session = {
    access_token: 'expired-access-token', refresh_token: 'expired-refresh-token', token_type: 'bearer',
    expires_at: 1, expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: 'current@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} },
  }
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'provider_error', msg: privateText }), {
    status: 400, headers: { 'content-type': 'application/json' },
  })))
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const request = new NextRequest('https://ante.test/api/account/email-change/request', {
      headers: { cookie: `sb-yxilmwxptfnebnjsikwo-auth-token=${encoded}` },
    })
    const stage = createIsolatedAccountStage(request)
    await new Promise<void>((resolve) => {
      const { data } = stage.client.auth.onAuthStateChange((event: string) => {
        if (event === 'INITIAL_SESSION') {
          data.subscription.unsubscribe()
          resolve()
        }
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetch).toHaveBeenCalled()
    const logged = [...errorLog.mock.calls, ...warningLog.mock.calls].flat().map(String).join(' ')
    expect(logged).not.toContain(privateText)
  } finally {
    errorLog.mockRestore()
    warningLog.mockRestore()
    vi.unstubAllGlobals()
  }
})

it.each([400, 429])('preserves provider HTTP %s for route classification without retaining its private body', async (status) => {
  const privateText = 'private-provider-error@example.test secret-token-009999'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'private_code', msg: privateText }), {
    status, statusText: privateText, headers: { 'content-type': 'application/json', 'x-private-detail': privateText },
  })))
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const stage = createIsolatedAccountStage(new NextRequest('https://ante.test/api/account/email-change/confirm'))
    const result = await stage.client.auth.verifyOtp({ email: 'current@example.test', token: '004321', type: 'email_change' })
    expect(result.error?.status).toBe(status)
    expect(String(result.error)).not.toContain(privateText)
    expect(errorLog.mock.calls.flat().map(String).join(' ')).not.toContain(privateText)
  } finally {
    errorLog.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('does not log malformed successful JSON during expired-session refresh', async () => {
  vi.useFakeTimers()
  const privateText = 'private-provider-detail@example.test secret-refresh-004321'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  const session = {
    access_token: 'expired-access-token', refresh_token: 'expired-refresh-token', token_type: 'bearer',
    expires_at: 1, expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: 'current@example.test', created_at: '2026-09-25T00:00:00Z', app_metadata: {}, user_metadata: {} },
  }
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  vi.stubGlobal('fetch', vi.fn(async () => new Response(privateText, {
    status: 200, headers: { 'content-type': 'application/json' },
  })))
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const request = new NextRequest('https://ante.test/api/account/email-change/request', {
      headers: { cookie: `sb-yxilmwxptfnebnjsikwo-auth-token=${encoded}` },
    })
    const stage = createIsolatedAccountStage(request)
    const initial = new Promise<void>((resolve) => {
      const { data } = stage.client.auth.onAuthStateChange((event: string) => {
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
    const logged = [...errorLog.mock.calls, ...warningLog.mock.calls].flat().map(String).join(' ')
    expect(logged).not.toContain('private-pr')
    expect(logged).not.toContain('secret-refresh-004321')
  } finally {
    errorLog.mockRestore()
    warningLog.mockRestore()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  }
})
