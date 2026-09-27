// Admit callback work only after a trusted Cloudflare visitor identity consumes a shared limit.
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse, type NextRequest } from 'next/server'
import { consumeAccountLimit, consumeCallbackLimit, type CallbackLimitResult } from './callback-limit-store'

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

// Only direct Cloudflare ingress can supply the single canonical visitor identity.
function visitorDigest(request: NextRequest, domain: 'website-auth-callback:v1:' | 'website-account:v1:'): string | null {
  const secret = process.env.ANTE_AUTH_LIMIT_HMAC_SECRET
  const ip = process.env.ANTE_AUTH_INGRESS === 'cloudflare' && !request.headers.has('cf-worker')
    ? canonicalIp(request.headers.get('cf-connecting-ip')) : null
  if (!ip || !secret || Buffer.byteLength(secret, 'utf8') < 32) return null
  return createHmac('sha256', secret).update(`${domain}${ip}`).digest('hex')
}

// Admission responses use fixed private text and validated retry guidance.
function accountLimitResponse(result: CallbackLimitResult): NextResponse | null {
  if (result.kind === 'allowed') return null
  if (result.kind === 'denied') {
    console.warn('Account visitor admission denied')
    return new NextResponse('Please try again later', {
      status: 429,
      headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(result.retryAfter) },
    })
  }
  console.warn('Account visitor admission unavailable')
  return new NextResponse('Account temporarily unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
  })
}

// Account pages and APIs consume a separate sixty-per-minute visitor quota.
export async function admitAccountVisitor(request: NextRequest, signal?: AbortSignal): Promise<NextResponse | null> {
  const digest = visitorDigest(request, 'website-account:v1:')
  // The transport observes both client disconnects and an optional operation deadline.
  const operationSignal = signal ? AbortSignal.any([request.signal, signal]) : request.signal
  return accountLimitResponse(digest ? await consumeAccountLimit(digest, operationSignal) : { kind: 'unavailable' })
}

export async function admitCallback(request: NextRequest): Promise<NextResponse | null> {
  // The operator must explicitly enable direct Cloudflare ingress; headers alone never opt in.
  const digest = visitorDigest(request, 'website-auth-callback:v1:')
  if (!digest) return unavailableCallbackResponse()

  // This digest is stable across instances without sending the visitor address to Supabase.
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

// A verified account gets separate fixed five-per-minute buckets for each email-change action.
export async function admitEmailChangeUser(userId: string, action: 'request' | 'confirm'): Promise<NextResponse | null> {
  const secret = process.env.ANTE_AUTH_LIMIT_HMAC_SECRET
  if (typeof userId !== 'string' || !userId.trim() || userId !== userId.trim() ||
      (action !== 'request' && action !== 'confirm') || !secret || Buffer.byteLength(secret, 'utf8') < 32) {
    return unavailableCallbackResponse()
  }
  const digest = createHmac('sha256', secret).update(`website-email-change-${action}:v1:${userId}`).digest('hex')
  const result = await consumeCallbackLimit(digest)
  if (result.kind === 'allowed') return null
  if (result.kind === 'denied') {
    console.warn('Email change user admission denied')
    return new NextResponse('Please try again later', {
      status: 429,
      headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(result.retryAfter) },
    })
  }
  return unavailableCallbackResponse()
}

// A verified UUID consumes one action-specific photo quota without revealing the identifier to the store.
export async function admitProfilePhotoUser(userId: string, action: 'upload' | 'delete' | 'read', signal?: AbortSignal): Promise<NextResponse | null> {
  const secret = process.env.ANTE_AUTH_LIMIT_HMAC_SECRET
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId) ||
      !['upload', 'delete', 'read'].includes(action) || !secret || Buffer.byteLength(secret, 'utf8') < 32) {
    return photoAdmissionResponse({ kind: 'unavailable' })
  }
  const digest = createHmac('sha256', secret).update(`website-photo-${action}:v1:${userId}`).digest('hex')
  const result = action === 'read' ? await consumeAccountLimit(digest, signal) : await consumeCallbackLimit(digest, signal)
  return photoAdmissionResponse(result)
}

// Keep photo quota failures fixed and private, including the provider's retry interval.
function photoAdmissionResponse(result: CallbackLimitResult): NextResponse | null {
  if (result.kind === 'allowed') return null
  const denied = result.kind === 'denied'
  console.warn(denied ? 'Profile photo user admission denied' : 'Profile photo user admission unavailable')
  return new NextResponse(denied ? 'Please try again later' : 'Photo temporarily unavailable', {
    status: denied ? 429 : 503,
    headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(denied ? result.retryAfter : 60) },
  })
}
