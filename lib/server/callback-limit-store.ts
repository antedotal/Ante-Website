// Call the durable callback limiter with a nonreversible visitor digest and a server-only key.
import 'server-only'
import { accountConfig } from '../supabase/config'

export type CallbackLimitResult =
  | { kind: 'allowed' }
  | { kind: 'denied'; retryAfter: number }
  | { kind: 'unavailable' }

const unavailable: CallbackLimitResult = { kind: 'unavailable' }

// Opaque secret keys are apikey-only; legacy service JWTs also require bearer auth.
function serviceCredential(): { key: string; bearer: boolean } | null {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (secret !== undefined) {
    return /^sb_secret_[A-Za-z0-9_-]+$/.test(secret) && !/placeholder|example|your[-_]/i.test(secret)
      ? { key: secret, bearer: false }
      : null
  }

  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!legacy || !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(legacy)) return null
  try {
    const payload = JSON.parse(atob(legacy.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return payload.role === 'service_role' ? { key: legacy, bearer: true } : null
  } catch {
    return null
  }
}

// Only the expected two-field RPC record can permit authentication work.
function parseResult(value: unknown): CallbackLimitResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return unavailable
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, 'allowed') || !Object.hasOwn(record, 'retry_after_seconds')) return unavailable
  const retry = record.retry_after_seconds
  if (record.allowed === true && retry === 0) return { kind: 'allowed' }
  if (record.allowed === false && Number.isInteger(retry) && typeof retry === 'number' && retry >= 1 && retry <= 60) {
    return { kind: 'denied', retryAfter: retry }
  }
  return unavailable
}

// Both fixed service-only admission RPCs share credential, timeout and reply validation.
async function consumeLimit(visitorHash: string, functionName: 'consume_website_callback_limit' | 'consume_website_account_limit'): Promise<CallbackLimitResult> {
  if (!/^[a-f0-9]{64}$/.test(visitorHash)) return unavailable
  const credential = serviceCredential()
  if (!credential) return unavailable

  try {
    // Reuse the validated account project; the visitor cannot choose a store URL.
    const { url } = accountConfig()
    const headers: Record<string, string> = {
      apikey: credential.key,
      'content-type': 'application/json',
      accept: 'application/json',
    }
    if (credential.bearer) headers.Authorization = `Bearer ${credential.key}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
        method: 'POST', headers, body: JSON.stringify({ p_visitor_hash: visitorHash }),
        cache: 'no-store', redirect: 'error', signal: controller.signal,
      })
      // Failed responses may contain provider details, so never read their bodies.
      if (!response.ok || response.redirected) return unavailable
      return parseResult(await response.json())
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // Configuration, transport and protocol failures all fail closed without detail logging.
    return unavailable
  }
}

// Keep the callback and normalized-email five-per-minute store unchanged.
export function consumeCallbackLimit(visitorHash: string): Promise<CallbackLimitResult> {
  return consumeLimit(visitorHash, 'consume_website_callback_limit')
}

// Consume the separate account visitor quota through its fixed service-only RPC.
export function consumeAccountLimit(visitorHash: string): Promise<CallbackLimitResult> {
  return consumeLimit(visitorHash, 'consume_website_account_limit')
}
