// Refresh account cookies before server rendering and prevent shared caches from storing them.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { accountConfig, accountCookieOptions } from './lib/supabase/config'

export async function proxy(request: NextRequest) {
  // Callback admission runs in its route before any Supabase Auth work.
  if (request.nextUrl.pathname === '/auth/callback') {
    const response = NextResponse.next({ request })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  const { url, key, siteOrigin } = accountConfig()
  let response = NextResponse.next({ request })
  response.headers.set('Cache-Control', 'private, no-store')

  const supabase = createServerClient(url, key, {
    cookieOptions: accountCookieOptions(siteOrigin),
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        // Request cookies feed Server Components; response cookies update the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...accountCookieOptions(siteOrigin) }))
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.set('Expires', '0')
        response.headers.set('Pragma', 'no-cache')
      },
    },
  })

  // Claims are signature-verified; the unverified user stored in a cookie is never an auth decision.
  try {
    await supabase.auth.getClaims()
  } catch {
    // A malformed cookie can make claim parsing throw; keep sign-in reachable and deny account content.
    if (request.nextUrl.pathname === '/account/sign-in') return response
    const denied = NextResponse.redirect(new URL('/account/sign-in', siteOrigin))
    denied.headers.set('Cache-Control', 'private, no-store')
    denied.headers.set('Expires', '0')
    denied.headers.set('Pragma', 'no-cache')
    return denied
  }
  return response
}

export const config = { matcher: ['/account/:path*'] }
