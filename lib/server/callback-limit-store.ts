// Call the durable callback limiter with a nonreversible visitor digest and a server-only key.
import 'server-only'
import { accountConfig } from '../supabase/config'
import { boundedProviderRequest } from './bounded-provider-request'
import { serviceCredential } from './service-credential'

export type CallbackLimitResult =
  | { kind: 'allowed' }
  | { kind: 'denied'; retryAfter: number }
  | { kind: 'unavailable' }

const unavailable: CallbackLimitResult = { kind: 'unavailable' }

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
async function consumeLimit(visitorHash: string, functionName: 'consume_website_callback_limit' | 'consume_website_account_limit', signal?: AbortSignal): Promise<CallbackLimitResult> {
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
    const result = await boundedProviderRequest(`${url}/rest/v1/rpc/${functionName}`, {
      method: 'POST', headers, body: JSON.stringify({ p_visitor_hash: visitorHash }),
      cache: 'no-store', redirect: 'error',
    }, 16384, { signal, timeoutMs: 5000 })
    // Admission only trusts a complete JSON record from an exact successful RPC reply.
    if (!result || result.response.status !== 200) return unavailable
    return parseResult(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)))
  } catch {
    // Configuration, transport and protocol failures all fail closed without detail logging.
    return unavailable
  }
}

// Keep the callback and normalized-email five-per-minute store unchanged.
export function consumeCallbackLimit(visitorHash: string, signal?: AbortSignal): Promise<CallbackLimitResult> {
  return consumeLimit(visitorHash, 'consume_website_callback_limit', signal)
}

// Consume the separate account visitor quota through its fixed service-only RPC.
export function consumeAccountLimit(visitorHash: string, signal?: AbortSignal): Promise<CallbackLimitResult> {
  return consumeLimit(visitorHash, 'consume_website_account_limit', signal)
}
