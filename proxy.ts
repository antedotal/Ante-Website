// Refresh account cookies before server rendering and prevent shared caches from storing them.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { accountConfig, accountCookieOptions } from './lib/supabase/config'
import { createAuthFetch } from './lib/supabase/auth-fetch'
import { admitAccountVisitor } from './lib/server/callback-admission'
import { closedFinancialPage } from './lib/payments/financial-page-source-gate'
import { financialWebsiteSourceEnabled } from './lib/payments/financial-source-gate'
import { paymentWebsiteSourceEnabled } from './lib/payments/website-source-gate'
import { paymentReturnIngressResponse } from './lib/payments/payment-return-ingress'
import { trustedAccountOrigin } from './lib/server/account-request'

// Fixed private errors keep configuration and ingress details out of responses.
function gateError(status: 403 | 503) {
  const response = new NextResponse(status === 403 ? 'Invalid origin' : 'Account temporarily unavailable', {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...(status === 503 ? { 'Retry-After': '60' } : {}) },
  })
  return response
}

export async function proxy(request: NextRequest) {
  // Preserve the accepted first-hop query discard before account configuration
  // even when this proxy is invoked directly without the outer Worker.
  const paymentReturn = paymentReturnIngressResponse(request)
  if (paymentReturn) return new NextResponse(paymentReturn.body, { status: paymentReturn.status, headers: paymentReturn.headers })
  if (closedFinancialPage(request.nextUrl.pathname, new URL(request.url).pathname, request.nextUrl.search || (request.url.includes('?') ? '?' : ''), request.method) || request.nextUrl.pathname === '/account/payments' && !paymentWebsiteSourceEnabled() || ['/account/financial-tasks','/account/premium'].includes(request.nextUrl.pathname) && !financialWebsiteSourceEnabled()) {
    const response = NextResponse.next({ request })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  // API and callback routes own their admission; proxy protects account pages only.
  if (request.nextUrl.pathname === '/auth/callback' || request.nextUrl.pathname.startsWith('/api/account/')) {
    const response = NextResponse.next({ request })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  let config: ReturnType<typeof accountConfig>
  try { config = accountConfig() } catch { return gateError(503) }
  const { url, key, siteOrigin } = config
  if (!trustedAccountOrigin(request, siteOrigin, false)) return gateError(403)
  // Sign-in is a static public entrypoint and performs no server Auth work.
  if (request.nextUrl.pathname === '/account/sign-in') {
    const response = NextResponse.next({ request })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  const admission = await admitAccountVisitor(request)
  if (admission) return admission
  let response = NextResponse.next({ request })
  response.headers.set('Cache-Control', 'private, no-store')

  const supabase = createServerClient(url, key, {
    global: { fetch: createAuthFetch(url) },
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
    // A malformed cookie can make claim parsing throw; deny account content.
    const denied = NextResponse.redirect(new URL('/account/sign-in', siteOrigin))
    denied.headers.set('Cache-Control', 'private, no-store')
    denied.headers.set('Expires', '0')
    denied.headers.set('Pragma', 'no-cache')
    return denied
  }
  return response
}

export const config = { matcher: ['/account/:path*'] }
