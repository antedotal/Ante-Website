// Exchange one PKCE code for cookies, then redirect only to a fixed local path.
import { NextRequest, NextResponse } from 'next/server'
import { createCallbackClient } from '../../../lib/supabase/server'
import { accountConfig } from '../../../lib/supabase/config'
import { admitCallback, unavailableCallbackResponse } from '../../../lib/server/callback-admission'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Preserve Supabase's token-endpoint throttle signal without exposing provider details or OAuth codes.
function providerRateLimitResponse() {
  console.warn('Auth callback rate limited by Supabase')
  return new NextResponse('Please try again later', {
    status: 429,
    headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
  })
}

function isProviderRateLimit(error: unknown): error is { status: 429 } {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 429
}

export async function GET(request: NextRequest) {
  let siteOrigin: string
  try {
    siteOrigin = accountConfig().siteOrigin
  } catch {
    // Public account configuration failure has the same private response as unavailable admission.
    return unavailableCallbackResponse()
  }
  const site = new URL(siteOrigin)
  // Reject a forged Host or forwarded host before using the OAuth code or emitting a redirect.
  const host = request.headers.get('host')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (request.nextUrl.origin !== siteOrigin || (host && host !== site.host) || (forwardedHost && forwardedHost !== site.host) || (forwardedProto && `${forwardedProto}:` !== site.protocol)) {
    return new NextResponse('Invalid callback origin', { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
  }
  // Consume the shared limit before parsing a code or constructing an Auth client.
  const admission = await admitCallback(request)
  if (admission) return admission
  const codes = request.nextUrl.searchParams.getAll('code')
  const code = codes[0]
  const malformed = codes.length !== 1 || !code || code.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(code) || request.nextUrl.searchParams.has('error') || request.nextUrl.searchParams.has('access_token') || request.nextUrl.searchParams.has('refresh_token')
  if (malformed) {
    const response = NextResponse.redirect(new URL('/account/sign-in?error=invalid_callback', siteOrigin))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  const response = NextResponse.redirect(new URL('/account', siteOrigin))
  response.headers.set('Cache-Control', 'private, no-store')
  try {
    const supabase = createCallbackClient(request, response)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return response
    if (isProviderRateLimit(error)) return providerRateLimitResponse()
  } catch (error) {
    if (isProviderRateLimit(error)) return providerRateLimitResponse()
    // Network, configuration, and expired-code errors all map to a safe public code.
  }

  const failure = NextResponse.redirect(new URL('/account/sign-in?error=exchange_failed', siteOrigin))
  failure.headers.set('Cache-Control', 'private, no-store')
  return failure
}
