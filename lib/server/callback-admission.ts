// Admit callback work only after a trusted Cloudflare visitor identity consumes a shared limit.
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse, type NextRequest } from 'next/server'
import { consumeCallbackLimit } from './callback-limit-store'

const crossZoneSentinel = '2a06:98c0:3600::103'

// URL's IPv6 parser canonicalizes equivalent forms; mapped addresses share IPv4 buckets.
function canonicalIp(value: string | null): string | null {
  if (!value || value !== value.trim() || value.includes('%')) return null
  const family = isIP(value)
  if (family === 4) return value
  if (family !== 6) return null
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
    if (canonical === crossZoneSentinel) return null
    const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical)
    if (!mapped) return canonical
    const high = Number.parseInt(mapped[1], 16)
    const low = Number.parseInt(mapped[2], 16)
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`
  } catch {
    return null
  }
}

// Unavailable admission must carry retry guidance and forbid shared caching.
export function unavailableCallbackResponse() {
  console.warn('Auth callback admission unavailable')
  return new NextResponse('Authentication temporarily unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
  })
}

export async function admitCallback(request: NextRequest): Promise<NextResponse | null> {
  // The operator must explicitly enable direct Cloudflare ingress; headers alone never opt in.
  const secret = process.env.ANTE_AUTH_LIMIT_HMAC_SECRET
  const ip = process.env.ANTE_AUTH_INGRESS === 'cloudflare' && !request.headers.has('cf-worker')
    ? canonicalIp(request.headers.get('cf-connecting-ip')) : null
  if (!ip || !secret || Buffer.byteLength(secret, 'utf8') < 32) return unavailableCallbackResponse()

  // This digest is stable across instances without sending the visitor address to Supabase.
  const digest = createHmac('sha256', secret).update(`website-auth-callback:v1:${ip}`).digest('hex')
  const result = await consumeCallbackLimit(digest)
  if (result.kind === 'allowed') return null
  if (result.kind === 'denied') {
    console.warn('Auth callback admission denied')
    return new NextResponse('Please try again later', {
      status: 429,
      headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(result.retryAfter) },
    })
  }
  return unavailableCallbackResponse()
}

// Consume the same fixed five-per-minute RPC in a separate normalized-email namespace.
export async function admitEmailSubject(email: string): Promise<NextResponse | null> {
  const secret = process.env.ANTE_AUTH_LIMIT_HMAC_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return unavailableCallbackResponse()
  const digest = createHmac('sha256', secret).update(`website-auth-email:v1:${email}`).digest('hex')
  const result = await consumeCallbackLimit(digest)
  if (result.kind === 'allowed') return null
  if (result.kind === 'denied') {
    console.warn('Auth email admission denied')
    return new NextResponse('Please try again later', {
      status: 429,
      headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(result.retryAfter) },
    })
  }
  return unavailableCallbackResponse()
}
