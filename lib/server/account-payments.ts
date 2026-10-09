// Fixed dormant owner/consent adapters reuse account origin, bounded input, visitor admission, verified Auth and cookies.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { createCallbackClient } from '../supabase/server'
import { boundedAccountJson, exactAccountRecord, trustedAccountOrigin } from './account-request'
import { admitAccountVisitor } from './callback-admission'
import { providerCode, verifyAccountUser, withVerifiedCookies } from './account-session'
import { parsePaymentEnvelope, paymentHash, paymentPolicyVersion, paymentRevision, paymentUuid, type PaymentAction, type PaymentEnvelope } from '../payments/contract'

// Private transport failures contain fixed messages only; SQL typed receipts remain unchanged after validation.
function answer(status: number, body: PaymentEnvelope | { error: string }, retryAfter?: number) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  if (retryAfter !== undefined) response.headers.set('Retry-After', String(retryAfter))
  return response
}
function failure(status: 400 | 401 | 403 | 413 | 415 | 429 | 503) {
  const messages = { 400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin', 413: 'Request too large', 415: 'Unsupported content type', 429: 'Please try again later', 503: 'Payments temporarily unavailable' }
  return answer(status, { error: messages[status] }, status === 429 || status === 503 ? 60 : undefined)
}
// Server-only opt-in is checked before config/visitor/Auth construction; no shipping configuration enables it.
function activationClosed() {
  return answer(503, { contract_version: 1, operation_id: null, operation_revision: null, status: 'denied', resource_revision: null, result: null, error_code: 'activation_closed', retry_after_seconds: null })
}

// Dispatch inputs are fixed per action, never owner/provider selectors or arbitrary RPC names.
function mutation(value: unknown, action: PaymentAction): Record<string, unknown> | null {
  if (action === 'customer.ensure') {
    if (!exactAccountRecord(value, ['operation_id', 'customer_revision']) || !paymentUuid(value.operation_id) || !paymentRevision(value.customer_revision)) return null
    return { p_operation_id: value.operation_id, p_customer_revision: value.customer_revision }
  }
  if (action === 'consent.accept') {
    if (!exactAccountRecord(value, ['operation_id', 'customer_revision', 'policy_id', 'policy_version', 'policy_revision', 'policy_hash', 'affirmative']) ||
      !paymentUuid(value.operation_id) || !paymentRevision(value.customer_revision, 1) || !paymentUuid(value.policy_id) || !paymentPolicyVersion(value.policy_version) ||
      !paymentRevision(value.policy_revision, 1) || !paymentHash(value.policy_hash) || value.affirmative !== true) return null
    return { p_operation_id: value.operation_id, p_customer_revision: value.customer_revision, p_policy_id: value.policy_id, p_policy_version: value.policy_version, p_policy_revision: value.policy_revision, p_policy_hash: value.policy_hash, p_affirmative: true }
  }
  if (action === 'consent.revoke' && exactAccountRecord(value, ['operation_id', 'consent_id', 'consent_revision']) && paymentUuid(value.operation_id) && paymentUuid(value.consent_id) && paymentRevision(value.consent_revision, 1)) {
    return { p_operation_id: value.operation_id, p_consent_id: value.consent_id, p_consent_revision: value.consent_revision }
  }
  return null
}
const rpcNames = { 'customer.ensure': 'ensure_my_payment_customer_v1', 'consent.read': 'read_my_payment_consent_v1', 'consent.accept': 'accept_my_payment_consent_v1', 'consent.revoke': 'revoke_my_payment_consent_v1' } as const

export async function handleAccountPayments(request: NextRequest, action: PaymentAction) {
  if (process.env.ANTE_WEB_PAYMENTS_MODE !== 'owner-consent-v1') return activationClosed()
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503) }
  if (!trustedAccountOrigin(request, siteOrigin, action !== 'consent.read')) return failure(403)
  let args: Record<string, unknown> | null
  if (action === 'consent.read') {
    const query = request.nextUrl.searchParams
    if (query.size === 1 && query.getAll('consent_id').length === 1 && paymentUuid(query.get('consent_id'))) {
      args = { p_policy_id: null, p_version: null, p_consent_id: query.get('consent_id') }
    } else if (query.size === 2 && query.getAll('policy_id').length === 1 && query.getAll('version').length === 1 &&
      paymentUuid(query.get('policy_id')) && paymentPolicyVersion(query.get('version'))) {
      args = { p_policy_id: query.get('policy_id'), p_version: query.get('version'), p_consent_id: null }
    } else return failure(400)
  } else {
    if (request.nextUrl.search) return failure(400)
    const input = await boundedAccountJson(request, failure)
    if (input instanceof NextResponse) return input
    args = mutation(input, action)
    if (!args) return failure(400)
  }
  const admission = await admitAccountVisitor(request)
  if (admission) return admission
  const provisional = answer(200, { error: 'Provisional response' })
  let supabase: ReturnType<typeof createCallbackClient>
  try { supabase = createCallbackClient(request, provisional) } catch { return failure(503) }
  const identityFailure = await verifyAccountUser(supabase)
  if (identityFailure) return failure(identityFailure)
  try {
    const { data, error, status } = await supabase.rpc(rpcNames[action], args)
    if (error) {
      const code = providerCode(error)
      return withVerifiedCookies(failure(status === 429 ? 429 : code === '28000' || code === 'P0001' ? 401 : code === '22023' ? 400 : 503), provisional)
    }
    const result = parsePaymentEnvelope(data, action)
    if (!result) return withVerifiedCookies(failure(503), provisional)
    // Correlate the validated projection with the original selectors; a valid unrelated receipt is still unusable.
    const sameId = (returned: string | null, requested: unknown) => returned !== null && typeof requested === 'string' && returned.toLowerCase() === requested.toLowerCase()
    if (result.operation_id !== null && !sameId(result.operation_id, args.p_operation_id)) return withVerifiedCookies(failure(503), provisional)
    if (result.result && 'policy_id' in result.result) {
      const consent = result.result
      if (action === 'consent.read' && (args.p_consent_id !== null ? !sameId(consent.consent_id, args.p_consent_id) : consent.consent_id !== null || !sameId(consent.policy_id, args.p_policy_id) || consent.policy_version !== args.p_version) ||
        action === 'consent.accept' && (!sameId(consent.policy_id, args.p_policy_id) || consent.policy_version !== args.p_policy_version || consent.policy_hash !== args.p_policy_hash) ||
        action === 'consent.revoke' && !sameId(consent.consent_id, args.p_consent_id)) return withVerifiedCookies(failure(503), provisional)
    }
    if (result.result && 'customer_id' in result.result && result.resource_revision !== (args.p_customer_revision === 0 ? 1 : args.p_customer_revision)) return withVerifiedCookies(failure(503), provisional)
    const httpStatus = result.error_code === 'rate_limited' ? 429 : result.status === 'conflict' ? 409 : result.error_code === 'not_found' || result.error_code === 'ownership_denied' ? 404 : result.error_code === 'configuration_missing' || result.error_code === 'activation_closed' ? 503 : result.error_code === 'invalid_input' ? 400 : 200
    return withVerifiedCookies(answer(httpStatus, result, result.retry_after_seconds ?? undefined), provisional)
  } catch { return withVerifiedCookies(failure(503), provisional) }
}
