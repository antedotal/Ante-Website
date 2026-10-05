// Enforce one trusted origin, two fixed admission buckets, and bounded inputs before public Auth calls.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { createCallbackClient } from '../supabase/server'
import { admitCallback, admitEmailSubject, unavailableCallbackResponse } from './callback-admission'
import { boundedAccountJson, exactAccountRecord, trustedAccountOrigin } from './account-request'
import { normalizedEmail } from './email-validation'

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

function validInput(value: unknown, action: Action): Input | null {
  if (!exactAccountRecord(value, action === 'request' ? ['email'] : ['email', 'code'])) return null
  const record = value
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
  if (!trustedAccountOrigin(request, siteOrigin, true)) return error(403)

  // Admit the visitor before touching the body or constructing a Supabase Auth client.
  const visitorAdmission = await admitCallback(request)
  if (visitorAdmission) return visitorAdmission
  const parsed = await boundedAccountJson(request, error)
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
