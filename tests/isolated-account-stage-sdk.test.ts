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
