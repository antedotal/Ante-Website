'use client'

// Begin Google OAuth with a fixed callback; return only safe UI text on failure.
import { createClient } from './client'
import { accountConfig } from './config'

export async function beginGoogleSignIn(): Promise<string | null> {
  try {
    const { siteOrigin } = accountConfig()
    if (window.location.origin !== siteOrigin) return 'Unable to start Google sign-in. Please try again.'
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteOrigin}/auth/callback` },
    })
    return error ? 'Unable to start Google sign-in. Please try again.' : null
  } catch {
    return 'Unable to start Google sign-in. Please try again.'
  }
}
