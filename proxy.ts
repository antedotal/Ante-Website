// Refresh account cookies before server rendering and prevent shared caches from storing them.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { accountConfig } from './lib/supabase/config'

export async function proxy(request: NextRequest) {
  // Callback admission runs in its route before any Supabase Auth work.
  if (request.nextUrl.pathname === '/auth/callback') {
    const response = NextResponse.next({ request })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  const { url, key } = accountConfig()
  let response = NextResponse.next({ request })
  response.headers.set('Cache-Control', 'private, no-store')

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        // Request cookies feed Server Components; response cookies update the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.set('Expires', '0')
        response.headers.set('Pragma', 'no-cache')
      },
    },
  })

  // Claims are signature-verified; the unverified user stored in a cookie is never an auth decision.
  await supabase.auth.getClaims()
  return response
}

export const config = { matcher: ['/account/:path*'] }
