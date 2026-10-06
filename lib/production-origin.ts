// Production host routing is fixed and independent of untrusted Host or forwarded headers.
export const PRODUCTION_SITE_ORIGIN = 'https://antedotal.com'

// Canonicalize only the recognized production alternate before OpenNext/account processing.
// GET/HEAD preserve the encoded path/query. Other methods deny without a Location to prevent replay.
// Local, workers.dev, acceptance and preview URLs pass through unchanged.
export function productionOriginResponse(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.hostname !== 'www.antedotal.com') return null
  const headers = { 'Cache-Control': 'private, no-store' }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Invalid origin', { status: 403, headers })
  }
  const target = new URL(PRODUCTION_SITE_ORIGIN)
  target.pathname = url.pathname
  target.search = url.search
  return new Response(null, { status: 308, headers: { ...headers, Location: target.href } })
}
