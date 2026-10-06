// Parse only the bounded owner/consent v1 projections. Server parsing reuses existing exact-object/calendar checks.
import { createHash } from 'node:crypto'
import { exactAccountRecord } from '../server/account-request'
import { accountTimestamp } from '../server/account-session'

export type PaymentAction = 'customer.ensure' | 'consent.read' | 'consent.accept' | 'consent.revoke'
type Status = 'completed' | 'pending' | 'requires_action' | 'unknown' | 'denied' | 'conflict'
type ErrorCode = 'configuration_missing' | 'activation_closed' | 'not_found' | 'ownership_denied' | 'revision_conflict' | 'payload_conflict' | 'policy_changed' | 'rate_limited' | 'invalid_input'
export type PaymentOperation = { operation_id: string; operation_revision: number; action: PaymentAction; resource_id: string; resource_revision: number; status: Status; recovery: 'none' | 'await_policy'; continuation_token: null; action_expires_at: null }
export type PaymentCustomer = { customer_id: string; revision: number; state: 'reserved' | 'creating' | 'ready' | 'unknown' | 'blocked'; operation: PaymentOperation }
export type PaymentConsent = { consent_id: string | null; revision: number; policy_id: string; policy_version: string; policy_hash: string | null; approved_text: string | null; scope_keys: string[]; state: 'unavailable' | 'active' | 'revoked'; accepted_at: string | null; revoked_at: string | null; operation?: PaymentOperation }
export type PaymentEnvelope = { contract_version: 1; operation_id: string | null; operation_revision: number | null; status: Status; resource_revision: number | null; result: PaymentCustomer | PaymentConsent | null; error_code: ErrorCode | null; retry_after_seconds: number | null }

// Internal selectors are UUIDs; provider identity is intentionally absent from every input/result in this slice.
export const paymentUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const paymentRevision = (v: unknown, minimum = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= minimum && v <= 2147483647
export const paymentPolicyVersion = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(v)
export const paymentHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const envelopeKeys = ['contract_version', 'operation_id', 'operation_revision', 'status', 'resource_revision', 'result', 'error_code', 'retry_after_seconds']
const consentKeys = ['consent_id', 'revision', 'policy_id', 'policy_version', 'policy_hash', 'approved_text', 'scope_keys', 'state', 'accepted_at', 'revoked_at']
const errors: readonly unknown[] = ['configuration_missing', 'activation_closed', 'not_found', 'ownership_denied', 'revision_conflict', 'payload_conflict', 'policy_changed', 'rate_limited', 'invalid_input']

// Match every operation binding against its parent response so malformed progress cannot masquerade as another resource.
function operation(value: unknown, action: PaymentAction, envelope: Record<string, unknown>, resource: string, revision: number) {
  return exactAccountRecord(value, ['operation_id', 'operation_revision', 'action', 'resource_id', 'resource_revision', 'status', 'recovery', 'continuation_token', 'action_expires_at']) &&
    value.operation_id === envelope.operation_id && value.operation_revision === envelope.operation_revision && paymentRevision(value.operation_revision, 1) &&
    value.action === action && value.resource_id === resource && value.resource_revision === revision && value.status === envelope.status &&
    value.recovery === (value.status === 'pending' ? 'await_policy' : 'none') && value.continuation_token === null && value.action_expires_at === null
}

// Scope is canonical, sorted, unique and bounded; returned text is approved read-only content with a fixed UTF-8 ceiling.
function consent(value: unknown, action: PaymentAction, envelope: Record<string, unknown>) {
  const read = action === 'consent.read'
  if (!exactAccountRecord(value, read ? consentKeys : [...consentKeys, 'operation']) || !paymentUuid(value.policy_id) || !paymentPolicyVersion(value.policy_version) ||
    !paymentRevision(value.revision) || !Array.isArray(value.scope_keys) || value.scope_keys.length > 20 ||
    value.scope_keys.some((v, i, a) => typeof v !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(v) || (i > 0 && a[i - 1] >= v))) return false
  if (value.revision !== envelope.resource_revision) return false
  if (read) {
    if (value.state === 'unavailable') return value.consent_id === null && value.accepted_at === null && value.revoked_at === null && value.revision === 0 && value.policy_hash === null && value.approved_text === null && value.scope_keys.length === 0
    if (!paymentHash(value.policy_hash) || typeof value.approved_text !== 'string' || new TextEncoder().encode(value.approved_text).length < 1 ||
      new TextEncoder().encode(value.approved_text).length > 65536 || createHash('sha256').update(value.approved_text, 'utf8').digest('hex') !== value.policy_hash || value.scope_keys.length === 0) return false
    // A null consent ID denotes current policy; a UUID denotes retained owner history, never fresh authority.
    if (value.consent_id === null) return value.state === 'active' && value.revision >= 1 && value.accepted_at === null && value.revoked_at === null
    if (!paymentUuid(value.consent_id) || !accountTimestamp(value.accepted_at)) return false
    if (value.state === 'active') return value.revision === 1 && value.revoked_at === null
    return value.state === 'revoked' && value.revision === 2 && accountTimestamp(value.revoked_at) && Date.parse(value.revoked_at) >= Date.parse(value.accepted_at)
  }
  if (!paymentUuid(value.consent_id) || !paymentHash(value.policy_hash) || value.approved_text !== null || value.scope_keys.length === 0 || !accountTimestamp(value.accepted_at)) return false
  if (action === 'consent.accept' && (value.state !== 'active' || value.revision !== 1 || value.revoked_at !== null)) return false
  if (action === 'consent.revoke' && (value.state !== 'revoked' || value.revision !== 2 || !accountTimestamp(value.revoked_at) || Date.parse(value.revoked_at) < Date.parse(value.accepted_at))) return false
  return operation(value.operation, action, envelope, value.consent_id, value.revision)
}

// Reject extra keys, secrets, mismatched operation/resource revisions and malformed denial Retry-After.
export function parsePaymentEnvelope(value: unknown, action: PaymentAction): PaymentEnvelope | null {
  if (!exactAccountRecord(value, envelopeKeys) || value.contract_version !== 1 ||
    (value.operation_id !== null && !paymentUuid(value.operation_id)) || (value.resource_revision !== null && !paymentRevision(value.resource_revision)) ||
    (value.operation_id === null ? value.operation_revision !== null : !paymentRevision(value.operation_revision, 1))) return null
  if (value.status === 'denied' || value.status === 'conflict') {
    if (value.result !== null || value.resource_revision !== null || !errors.includes(value.error_code)) return null
    if (value.status === 'conflict' && !['revision_conflict', 'payload_conflict', 'policy_changed'].includes(String(value.error_code))) return null
    if (value.error_code === 'rate_limited' ? !paymentRevision(value.retry_after_seconds, 1) || value.retry_after_seconds > 60 : value.retry_after_seconds !== null) return null
    return value as PaymentEnvelope
  }
  if (value.error_code !== null || value.retry_after_seconds !== null) return null
  if (action === 'customer.ensure') {
    const c = value.result
    if (!['pending', 'unknown'].includes(String(value.status)) || value.operation_id === null || !exactAccountRecord(c, ['customer_id', 'revision', 'state', 'operation']) ||
      !paymentUuid(c.customer_id) || !paymentRevision(c.revision, 1) || c.revision !== value.resource_revision || !['reserved', 'creating', 'ready', 'unknown', 'blocked'].includes(String(c.state)) ||
      !operation(c.operation, action, value, c.customer_id, c.revision)) return null
  } else if (value.status !== 'completed' || (action === 'consent.read' ? value.operation_id !== null : value.operation_id === null) || !consent(value.result, action, value)) return null
  return value as PaymentEnvelope
}
