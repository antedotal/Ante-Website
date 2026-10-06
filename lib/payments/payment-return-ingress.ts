// This pure first-hop handler has no application, session, provider or logging dependencies.
import { PRODUCTION_SITE_ORIGIN } from '../production-origin'

const PAYMENT_RETURN_PATH = '/account/payments/return'
const PAYMENT_ACCOUNT_LOCATION = `${PRODUCTION_SITE_ORIGIN}/account/payments`
const PRODUCTION_APEX_HOST = new URL(PRODUCTION_SITE_ORIGIN).hostname

// Recognize only the fixed return family, including encoded segments/repeated or trailing slashes.
// Nonliteral aliases are denied rather than sent to a later redirect that could preserve their query.
function isReturnAlias(pathname: string): boolean {
  try { return /^\/+account\/+payments\/+return\/*$/.test(decodeURIComponent(pathname)) }
  catch { return false }
}

// Construct every handled reply from fixed values; no query, cookie, header or request body is read.
// Browser/CDN caching and referrer propagation are disabled, and no validator or secret Vary is emitted.
function returnReply(status: 303 | 403 | 405): Response {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    Pragma: 'no-cache',
    Expires: '0',
  })
  if (status === 303) headers.set('Location', PAYMENT_ACCOUNT_LOCATION)
  if (status === 405) headers.set('Allow', 'GET')
  return new Response(null, { status, headers })
}

// Intercept production payment returns before canonicalization/OpenNext, independently of payment gates.
// Only exact HTTPS/default-port GET navigates to the fixed clean account URL. GET never completes payment.
// HEAD/unsafe methods deny without redirect; unsafe origins and nonliteral return aliases fail closed.
// All other hosts/paths retain the existing production and private-ingress behavior unchanged.
export function paymentReturnIngressResponse(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.hostname !== PRODUCTION_APEX_HOST && url.hostname !== `www.${PRODUCTION_APEX_HOST}`) return null
  if (url.pathname !== PAYMENT_RETURN_PATH && !isReturnAlias(url.pathname)) return null
  if (url.protocol !== 'https:' || url.port !== '' || url.pathname !== PAYMENT_RETURN_PATH) return returnReply(403)
  return returnReply(request.method === 'GET' ? 303 : 405)
}
