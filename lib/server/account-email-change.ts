// Bind authenticated email changes to one verified account and an isolated public Auth cookie stage.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { applyAccountCookieStages, createIsolatedAccountStage, type AccountCookieStage } from '../supabase/isolated-account-stage'
import { boundedAccountJson, exactAccountRecord, trustedAccountOrigin } from './account-request'
import { providerStatus } from './account-session'
import { admitAccountVisitor, admitEmailChangeUser } from './callback-admission'
import { normalizedEmail } from './email-validation'

type Action = 'request' | 'confirm'
type FailureStatus = 400 | 401 | 403 | 413 | 415 | 429 | 503
type Identity = { id: string; current: string; pending: string | null }

// Return narrow private responses so provider addresses, codes and errors cannot escape.
function answer(status: number, body: object, retryAfter?: number) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(retryAfter))
  return response
}

function failure(status: FailureStatus, retryAfter?: number) {
  const messages = {
    400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin',
    413: 'Request too large', 415: 'Unsupported content type',
    429: 'Please try again later', 503: 'Email change temporarily unavailable',
  } as const
  return answer(status, { error: messages[status] }, retryAfter)
}

// Only absent, null, or empty pending fields count as cleared after completion.
function clearedPending(value: unknown) {
  return value === undefined || value === null || value === ''
}

// Read only verified Auth identity fields, normalizing email for pair comparisons.
function identity(value: unknown): Identity | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const current = normalizedEmail(record.email)
  if (typeof record.id !== 'string' || !record.id.trim() || record.id !== record.id.trim() || !current) return null
  const pending = clearedPending(record.new_email) ? null : normalizedEmail(record.new_email)
  if (!clearedPending(record.new_email) && !pending) return null
  return { id: record.id, current, pending }
}

// A pending postflight must preserve the entire caller, current and target snapshot.
function samePair(actual: Identity | null, snapshot: Identity) {
  return actual?.id === snapshot.id && actual.current === snapshot.current && actual.pending === snapshot.pending
}

// Completion requires the exact confirmed target and a genuinely cleared pending field.
function completedIdentity(value: unknown, snapshot: Identity) {
  const actual = identity(value)
  return actual?.id === snapshot.id && (value as Record<string, unknown>).email === snapshot.pending && actual.pending === null
}

// Auth's status is the only provider detail used for these fixed response classes.
function authFailure(error: unknown, phase: 'identity' | 'request' | 'confirm'): FailureStatus | 202 {
  const status = providerStatus(error)
  if (status === 429) return 429
  if (status === null || status < 400 || status === 408 || status >= 500) return 503
  if (phase === 'request' && status >= 400 && status < 500 && status !== 401 && status !== 403) return 202
  if (phase === 'confirm') return status >= 400 && status < 500 ? 401 : 503
  return 401
}

// Apply the verified baseline first and only release a child after its postflight passes.
function staged(response: NextResponse, stage: AccountCookieStage, accepted?: AccountCookieStage) {
  return accepted ? applyAccountCookieStages(response, stage, accepted) : applyAccountCookieStages(response, stage)
}

// Every mutation uses the verified ID, then checks fresh provider state before releasing its cookies.
export async function handleAccountEmailChange(request: NextRequest, action: Action) {
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503, 60) }
  if (!trustedAccountOrigin(request, siteOrigin, true)) return failure(403)
  if (request.nextUrl.search) return failure(400)
  const parsed = await boundedAccountJson(request, failure)
  if (parsed instanceof NextResponse) return parsed

  let target: string | null = null
  let code: string | null = null
  if (action === 'request') {
    if (!exactAccountRecord(parsed, ['newEmail'])) return failure(400)
    target = normalizedEmail(parsed.newEmail)
    if (!target) return failure(400)
  } else {
    if (!exactAccountRecord(parsed, ['email', 'code'])) return failure(400)
    target = normalizedEmail(parsed.email)
    code = typeof parsed.code === 'string' && /^\d{6,10}$/.test(parsed.code) ? parsed.code : null
    if (!target || !code) return failure(400)
  }

  // This operator gate is required even when public credentials happen to be configured.
  if (process.env.ANTE_EMAIL_CHANGE_MODE !== 'secure-two-inbox-otp') return failure(503, 60)
  const visitorAdmission = await admitAccountVisitor(request)
  if (visitorAdmission) return visitorAdmission

  let baseline: AccountCookieStage
  try { baseline = createIsolatedAccountStage(request) } catch { return failure(503, 60) }
  let caller: Identity | null
  try {
    const result = await baseline.client.auth.getUser()
    if (result.error) {
      const status = authFailure(result.error, 'identity')
      return failure(status === 202 ? 503 : status, status === 429 || status === 503 ? 60 : undefined)
    }
    caller = identity(result.data?.user)
  } catch { return failure(503, 60) }
  if (!caller) return failure(401)

  // The durable per-user action limit follows server-verified identity.
  const userAdmission = await admitEmailChangeUser(caller.id, action)
  if (userAdmission) return staged(userAdmission, baseline)
  if (action === 'request' && target === caller.current) return staged(failure(400), baseline)
  if (action === 'confirm' && (!caller.pending || caller.pending === caller.current || (target !== caller.current && target !== caller.pending))) {
    return staged(failure(400), baseline)
  }

  const child = baseline.fork()
  if (action === 'request') {
    try {
      const result = await child.client.auth.updateUser({ email: target! })
      if (result.error) {
        const status = authFailure(result.error, 'request')
        return staged(status === 202 ? answer(202, { ok: true }) : failure(status, status === 429 || status === 503 ? 60 : undefined), baseline)
      }
      if (result.data?.user && result.data.user.id !== caller.id) return staged(failure(503, 60), baseline)
      const postflight = await child.client.auth.getUser()
      if (postflight.error || !samePair(identity(postflight.data?.user), { ...caller, pending: target }) || postflight.data?.user?.new_email !== target) {
        return staged(failure(503, 60), baseline)
      }
      return staged(answer(202, { ok: true }), baseline, child)
    } catch { return staged(failure(503, 60), baseline) }
  }

  try {
    const result = await child.client.auth.verifyOtp({ email: target!, token: code!, type: 'email_change' })
    if (result.error) {
      const status = authFailure(result.error, 'confirm')
      return staged(failure(status === 202 ? 503 : status, status === 429 || status === 503 ? 60 : undefined), baseline)
    }
    const returnedUser = result.data?.user
    const returnedSession = result.data?.session
    if (returnedUser === null && returnedSession === null) {
      // SDK null/null does not prove which inbox code was accepted; re-read the original verified stage.
      const postflight = await baseline.client.auth.getUser()
      if (postflight.error || !samePair(identity(postflight.data?.user), caller)) return staged(failure(503, 60), baseline)
      return staged(answer(200, { status: 'pending' }), baseline)
    }
    if (!returnedUser || !returnedSession || !completedIdentity(returnedUser, caller) || !completedIdentity(returnedSession.user, caller)) {
      return staged(failure(503, 60), baseline)
    }
    const postflight = await child.client.auth.getUser()
    if (postflight.error || !completedIdentity(postflight.data?.user, caller)) return staged(failure(503, 60), baseline)
    return staged(answer(200, { status: 'completed' }), baseline, child)
  } catch { return staged(failure(503, 60), baseline) }
}
