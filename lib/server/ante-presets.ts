// Validate public preset input and RPC output at the website account boundary.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { createCallbackClient } from '../supabase/server'
import { boundedAccountJson, exactAccountRecord, trustedAccountOrigin } from './account-request'

type Action = 'read' | 'write'
type Amounts = { easy_cents: number; medium_cents: number; hard_cents: number }
type Presets = Amounts & { currency: 'AUD'; updated_at: string }
type Success = { ok: true; presets: Presets | null }

// Every response is private; public error text is fixed independently of provider details.
function answer(status: number, body: Success | { error: string }, retryAfter?: number) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(retryAfter))
  return response
}

function failure(status: 400 | 401 | 403 | 413 | 415 | 429 | 503, retryAfter?: number) {
  const messages = {
    400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin',
    413: 'Request too large', 415: 'Unsupported content type',
    429: 'Please try again later', 503: 'Presets temporarily unavailable',
  } as const
  return answer(status, { error: messages[status] }, retryAfter)
}

// Only independently selected whole AUD cents in the contract range may reach the RPC.
function amount(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 100 && value <= 5000
}

function inputAmounts(value: unknown): Amounts | null {
  if (!exactAccountRecord(value, ['easy_cents', 'medium_cents', 'hard_cents'])) return null
  if (!amount(value.easy_cents) || !amount(value.medium_cents) || !amount(value.hard_cents)) return null
  return { easy_cents: value.easy_cents, medium_cents: value.medium_cents, hard_cents: value.hard_cents }
}

// The SQL timestamptz value must be a bounded real calendar time with an explicit zone.
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const offset = match[7]
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return false
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day)
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day && !Number.isNaN(Date.parse(value))
}

// Reject extra keys and malformed success or denial envelopes, even from a trusted RPC.
function rpcResult(value: unknown, action: Action): Success | { ok: false; retry_after_seconds: number } | null {
  if (exactAccountRecord(value, ['ok', 'presets']) && value.ok === true) {
    if (value.presets === null) return action === 'read' ? { ok: true, presets: null } : null
    if (!exactAccountRecord(value.presets, ['currency', 'easy_cents', 'medium_cents', 'hard_cents', 'updated_at'])) return null
    const preset = value.presets
    if (preset.currency !== 'AUD' || !amount(preset.easy_cents) || !amount(preset.medium_cents) ||
      !amount(preset.hard_cents) || !timestamp(preset.updated_at)) return null
    return { ok: true, presets: {
      currency: 'AUD', easy_cents: preset.easy_cents, medium_cents: preset.medium_cents,
      hard_cents: preset.hard_cents, updated_at: preset.updated_at,
    } }
  }
  if (exactAccountRecord(value, ['ok', 'error', 'retry_after_seconds']) && value.ok === false &&
    value.error === 'rate_limited' && Number.isInteger(value.retry_after_seconds) &&
    typeof value.retry_after_seconds === 'number' && value.retry_after_seconds >= 1 && value.retry_after_seconds <= 60) {
    return { ok: false, retry_after_seconds: value.retry_after_seconds }
  }
  return null
}

function providerStatus(value: unknown) {
  return value && typeof value === 'object' && 'status' in value && typeof value.status === 'number' ? value.status : null
}

function providerCode(value: unknown) {
  return value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' ? value.code : null
}

// A verified refresh remains attached to all later outcomes; failed identity loses provisional cookies.
function withVerifiedCookies(response: NextResponse, provisional: NextResponse) {
  for (const cookie of provisional.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie)
  if (provisional.headers.has('set-cookie')) {
    response.headers.set('Expires', '0')
    response.headers.set('Pragma', 'no-cache')
  }
  return response
}

export async function handleAntePresets(request: NextRequest, action: Action) {
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503, 60) }
  if (!trustedAccountOrigin(request, siteOrigin, action === 'write')) return failure(403)
  if (request.nextUrl.search) return failure(400)

  let amounts: Amounts | null = null
  if (action === 'write') {
    const parsed = await boundedAccountJson(request, failure)
    if (parsed instanceof NextResponse) return parsed
    amounts = inputAmounts(parsed)
    if (!amounts) return failure(400)
  }

  const provisional = answer(200, { ok: true, presets: null })
  let supabase: ReturnType<typeof createCallbackClient>
  try { supabase = createCallbackClient(request, provisional) } catch { return failure(503, 60) }

  // getUser asks Auth to verify the caller; a cookie's unchecked metadata is never authority.
  try {
    const { data, error } = await supabase.auth.getUser()
    if (providerStatus(error) === 429) return failure(429, 60)
    if (error) {
      const status = providerStatus(error)
      return status === null || status === 0 || status === 408 || status >= 500 ? failure(503, 60) : failure(401)
    }
    if (!data?.user || typeof data.user.id !== 'string' || !data.user.id) return failure(401)
  } catch { return failure(503, 60) }

  // The public authenticated RPC derives its owner from auth.uid() and enforces its own quota.
  try {
    const { data, error } = action === 'read'
      ? await supabase.rpc('get_my_ante_presets')
      : await supabase.rpc('set_my_ante_presets', {
        p_easy_cents: amounts!.easy_cents, p_medium_cents: amounts!.medium_cents,
        p_hard_cents: amounts!.hard_cents,
      })
    if (error) {
      if (providerStatus(error) === 429) return withVerifiedCookies(failure(429, 60), provisional)
      const code = providerCode(error)
      if (code === '22023') return withVerifiedCookies(failure(400), provisional)
      if (code === '28000') return withVerifiedCookies(failure(401), provisional)
      return withVerifiedCookies(failure(503, 60), provisional)
    }
    const result = rpcResult(data, action)
    if (!result) return withVerifiedCookies(failure(503, 60), provisional)
    if (!result.ok) return withVerifiedCookies(failure(429, result.retry_after_seconds), provisional)
    return withVerifiedCookies(answer(200, result), provisional)
  } catch {
    return withVerifiedCookies(failure(503, 60), provisional)
  }
}
