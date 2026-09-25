'use client'

// Create a browser-only cookie-backed Auth client for the account sign-in flow.
import { createBrowserClient } from '@supabase/ssr'
import { accountConfig, accountCookieOptions } from './config'

export function createClient() {
  if (typeof window === 'undefined') throw new Error('Account browser client requires a browser')
  const { url, key, siteOrigin } = accountConfig()
  return createBrowserClient(url, key, { cookieOptions: accountCookieOptions(siteOrigin) })
}
