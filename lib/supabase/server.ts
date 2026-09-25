// Adapt Supabase SSR cookie writes to each Next server request and response.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { accountConfig, accountCookieOptions } from './config'
import { createAuthFetch } from './auth-fetch'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, key, siteOrigin } = accountConfig()
  return createServerClient(url, key, {
    global: { fetch: createAuthFetch(url) },
    cookieOptions: accountCookieOptions(siteOrigin),
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        // Server Components cannot write cookies; the proxy refreshes them before rendering.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...options, ...accountCookieOptions(siteOrigin) }))
        } catch {
          // A read-only Server Component reaches this branch after proxy already updated cookies.
        }
      },
    },
  })
}

export function createCallbackClient(request: NextRequest, response: NextResponse) {
  const { url, key, siteOrigin } = accountConfig()
  return createServerClient(url, key, {
    global: { fetch: createAuthFetch(url) },
    cookieOptions: accountCookieOptions(siteOrigin),
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        // The callback must return the exchanged session cookies and cache controls on its redirect.
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, { ...options, ...accountCookieOptions(siteOrigin) })
        })
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.set('Expires', '0')
        response.headers.set('Pragma', 'no-cache')
      },
    },
  })
}
