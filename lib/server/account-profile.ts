// Validate canonical profile-name input and the owner-derived Supabase RPC boundary.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { createCallbackClient } from '../supabase/server'
import { boundedAccountJson, exactAccountRecord, trustedAccountOrigin } from './account-request'
import { admitAccountVisitor } from './callback-admission'
import { accountTimestamp, providerCode, providerStatus, verifyAccountUser, withVerifiedCookies } from './account-session'

type Action = 'read' | 'write'
type Profile = { full_name: string | null; updated_at: string | null }
type Success = { ok: true; profile: Profile }
type Denial = { ok: false; retry_after_seconds: number }

// Keep every account response private and expose only fixed public errors.
function answer(status: number, body: Success | { error: string }, retryAfter?: number) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(retryAfter))
  return response
}

function failure(status: 400 | 401 | 403 | 404 | 413 | 415 | 429 | 503, retryAfter?: number) {
  const messages = {
    400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin',
    404: 'Profile not found', 413: 'Request too large', 415: 'Unsupported content type',
    429: 'Please try again later', 503: 'Profile temporarily unavailable',
  } as const
  return answer(status, { error: messages[status] }, retryAfter)
}

// Match the SQL setter: ASCII edge spaces, Unicode code points, and no controls or broken UTF-16.
function normalizedName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/^ +| +$/g, '')
  let codePoints = 0
  for (let i = 0; i < name.length; i++) {
    const unit = name.charCodeAt(i)
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)) return null
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = name.charCodeAt(++i)
      if (!(low >= 0xdc00 && low <= 0xdfff)) return null
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return null
    if (++codePoints > 120) return null
  }
  return codePoints >= 1 ? name : null
}

// A read may return a provider-created legacy name; writes require the normalized SQL result.
function rpcResult(value: unknown, action: Action, writtenName: string | null): Success | Denial | null {
  if (exactAccountRecord(value, ['ok', 'profile']) && value.ok === true) {
    if (!exactAccountRecord(value.profile, ['full_name', 'updated_at'])) return null
    const profile = value.profile
    if (profile.full_name !== null && typeof profile.full_name !== 'string') return null
    if (profile.updated_at !== null && !accountTimestamp(profile.updated_at)) return null
    if (action === 'write' && (profile.full_name !== writtenName || profile.updated_at === null)) return null
    return { ok: true, profile: { full_name: profile.full_name, updated_at: profile.updated_at } }
  }
  if (exactAccountRecord(value, ['ok', 'error', 'retry_after_seconds']) && value.ok === false &&
    value.error === 'rate_limited' && Number.isInteger(value.retry_after_seconds) &&
    typeof value.retry_after_seconds === 'number' && value.retry_after_seconds >= 1 && value.retry_after_seconds <= 60) {
    return { ok: false, retry_after_seconds: value.retry_after_seconds }
  }
  return null
}

export async function handleAccountProfile(request: NextRequest, action: Action) {
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503, 60) }
  if (!trustedAccountOrigin(request, siteOrigin, action === 'write')) return failure(403)
  if (request.nextUrl.search) return failure(400)

  let name: string | null = null
  if (action === 'write') {
    const parsed = await boundedAccountJson(request, failure)
    if (parsed instanceof NextResponse) return parsed
    if (!exactAccountRecord(parsed, ['full_name'])) return failure(400)
    name = normalizedName(parsed.full_name)
    if (name === null) return failure(400)
  }

  // Admission is the only service-key operation and precedes public SSR/Auth construction.
  const admission = await admitAccountVisitor(request)
  if (admission) return admission

  const provisional = answer(200, { ok: true, profile: { full_name: null, updated_at: null } })
  let supabase: ReturnType<typeof createCallbackClient>
  try { supabase = createCallbackClient(request, provisional) } catch { return failure(503, 60) }

  const identityFailure = await verifyAccountUser(supabase)
  if (identityFailure) return failure(identityFailure, identityFailure === 401 ? undefined : 60)

  // These fixed RPCs derive the owner from the verified JWT and enforce their own read/write quota.
  try {
    const { data, error } = action === 'read'
      ? await supabase.rpc('get_my_profile_name')
      : await supabase.rpc('set_my_profile_name', { p_full_name: name! })
    if (error) {
      if (providerStatus(error) === 429) return withVerifiedCookies(failure(429, 60), provisional)
      const code = providerCode(error)
      if (code === '28000') return withVerifiedCookies(failure(401), provisional)
      if (code === 'P0002') return withVerifiedCookies(failure(404), provisional)
      if (code === '22023') return withVerifiedCookies(failure(400), provisional)
      return withVerifiedCookies(failure(503, 60), provisional)
    }
    const result = rpcResult(data, action, name)
    if (!result) return withVerifiedCookies(failure(503, 60), provisional)
    if (!result.ok) return withVerifiedCookies(failure(429, result.retry_after_seconds), provisional)
    return withVerifiedCookies(answer(200, result), provisional)
  } catch {
    return withVerifiedCookies(failure(503, 60), provisional)
  }
}
