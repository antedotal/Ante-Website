// Enforce one trusted origin, two fixed admission buckets, and bounded inputs before public Auth calls.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { createCallbackClient } from '../supabase/server'
import { admitCallback, admitEmailSubject, unavailableCallbackResponse } from './callback-admission'

type Action = 'request' | 'verify'
type Input = { email: string; code?: string }

// All route outcomes are private and carry only fixed public messages.
function answer(status: number, body: { ok: true } | { error: string }, retryAfter?: number) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(retryAfter))
  return response
}

function error(status: number, retryAfter?: number) {
  const messages: Record<number, string> = {
    400: 'Invalid request', 401: 'Invalid or expired code', 403: 'Invalid origin',
    413: 'Request too large', 415: 'Unsupported content type',
    429: 'Please try again later', 503: 'Authentication temporarily unavailable',
  }
  return answer(status, { error: messages[status] }, retryAfter)
}

// Require the browser origin and visible host to agree with the configured canonical site.
function trustedOrigin(request: NextRequest, siteOrigin: string) {
  const site = new URL(siteOrigin)
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  return origin === siteOrigin && request.nextUrl.origin === siteOrigin && host === site.host &&
    (!forwardedHost || forwardedHost === site.host) &&
    (!forwardedProto || `${forwardedProto}:` === site.protocol)
}

// Read at most 4096 bytes from the stream; headers cannot assert a smaller actual body.
async function boundedJson(request: NextRequest): Promise<unknown | NextResponse> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return error(415)
  const statedLength = request.headers.get('content-length')
  if (statedLength && /^\d+$/.test(statedLength) && Number(statedLength) > 4096) return error(413)
  if (!request.body) return error(400)
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4096) {
        void reader.cancel().catch(() => {})
        return error(413)
      }
      parts.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return error(400)
  } finally {
    reader.releaseLock()
  }
}

// Accept ordinary bounded addresses, with one canonical lowercase spelling for quota and Auth.
function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || email.length < 3) return null
  const at = email.indexOf('@')
  if (at < 1 || at !== email.lastIndexOf('@')) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  return email
}

function validInput(value: unknown, action: Action): Input | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== (action === 'request' ? 'email' : 'code,email')) return null
  const email = normalizedEmail(record.email)
  if (!email) return null
  if (action === 'verify') {
    if (typeof record.code !== 'string' || !/^[0-9]{6,10}$/.test(record.code)) return null
    return { email, code: record.code }
  }
  return { email }
}

function providerStatus(errorValue: unknown): number | null {
  if (typeof errorValue !== 'object' || !errorValue || !('status' in errorValue)) return null
  return typeof errorValue.status === 'number' ? errorValue.status : null
}

function providerUnavailable(errorValue: unknown) {
  const status = providerStatus(errorValue)
  return status === null || status === 0 || status === 408 || status >= 500
}

export async function handleEmailAuth(request: NextRequest, action: Action) {
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return unavailableCallbackResponse() }
  if (!trustedOrigin(request, siteOrigin)) return error(403)

  // Admit the visitor before touching the body or constructing a Supabase Auth client.
  const visitorAdmission = await admitCallback(request)
  if (visitorAdmission) return visitorAdmission
  const parsed = await boundedJson(request)
  if (parsed instanceof NextResponse) return parsed
  const input = validInput(parsed, action)
  if (!input) return error(400)
  const subjectAdmission = await admitEmailSubject(input.email)
  if (subjectAdmission) return subjectAdmission

  // SSR writes go onto this response only; failures return a fresh response without provisional cookies.
  const success = answer(action === 'request' ? 202 : 200, { ok: true })
  try {
    const supabase = createCallbackClient(request, success)
    if (action === 'request') {
      const { error: providerError } = await supabase.auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: true } })
      if (providerStatus(providerError) === 429) return error(429, 60)
      if (providerError && providerUnavailable(providerError)) return error(503, 60)
      // Issuing a code never establishes a session, even if an SDK callback wrote cookies.
      return answer(202, { ok: true })
    }
    const { data, error: providerError } = await supabase.auth.verifyOtp({ email: input.email, token: input.code!, type: 'email' })
    if (providerStatus(providerError) === 429) return error(429, 60)
    if (providerError && providerUnavailable(providerError)) return error(503, 60)
    if (providerError || !data?.session || !data?.user?.id) return error(401)
    return success
  } catch {
    return error(503, 60)
  }
}
