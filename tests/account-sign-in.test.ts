// Verify that Google OAuth starts a PKCE callback on this site, never a caller-supplied destination.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOAuth = vi.hoisted(() => vi.fn())
vi.mock('@supabase/ssr', () => ({ createBrowserClient: vi.fn(() => ({ auth: { signInWithOAuth } })) }))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
  signInWithOAuth.mockReset()
  vi.stubGlobal('window', { location: { origin: 'https://ante.test' } })
})

describe('Google account sign-in', () => {
  it('starts at the fixed same-origin callback', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/' }, error: null })
    const { beginGoogleSignIn } = await import('../lib/supabase/google-sign-in')
    expect(await beginGoogleSignIn()).toBeNull()
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://ante.test/auth/callback' },
    })
  })

  it('reports a safe error if OAuth cannot start', async () => {
    signInWithOAuth.mockRejectedValue(new Error('secret provider response'))
    const { beginGoogleSignIn } = await import('../lib/supabase/google-sign-in')
    expect(await beginGoogleSignIn()).toBe('Unable to start Google sign-in. Please try again.')
  })

  it('refuses OAuth when the current origin differs from the canonical website', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://evil.example' } })
    const { beginGoogleSignIn } = await import('../lib/supabase/google-sign-in')
    expect(await beginGoogleSignIn()).toBe('Unable to start Google sign-in. Please try again.')
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })
})
