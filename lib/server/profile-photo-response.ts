import 'server-only'
import { NextResponse } from 'next/server'

// Apply one private cache policy to every photo outcome, including framework-facing 405s.
export function privateProfilePhotoResponse(response: NextResponse): NextResponse {
  for (const name of ['ETag', 'Last-Modified', 'Accept-Ranges', 'Content-Range', 'Age', 'Surrogate-Control']) response.headers.delete(name)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('CDN-Cache-Control', 'no-store')
  response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  const vary = response.headers.get('Vary')?.split(',').map(value => value.trim()).filter(Boolean) ?? []
  if (!vary.some(value => value.toLowerCase() === 'cookie')) vary.push('Cookie')
  response.headers.set('Vary', vary.join(', '))
  return response
}
