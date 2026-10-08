// Browser state contains only validated owner DTOs and temporary intent IDs.
// Original receipts are immutable; later resource progress is a separate view.
export type Card = { card_id: string; revision: number; brand: string; last4: string; expiry_month: number; expiry_year: number; state: string; is_default: boolean }
export type Policy = { purpose: 'card.save' | 'accountability' | 'premium'; available: boolean; policy_id: string | null; policy_version: string | null; policy_revision: number | null; policy_hash: string | null }
export type Consent = { consent_id: string | null; revision: number; policy_id: string; policy_version: string; policy_hash: string | null; approved_text: string | null; scope_keys: string[]; state: 'active' | 'revoked' | 'unavailable'; accepted_at: string | null; revoked_at: string | null }
export type Summary = { operation_id: string; action: string; status: string; recovery: string; operation_revision: number; resource_id: string | null; resource_revision: number | null; support_available: false }
export type Operation = { summary: Summary; original_contract: string; original_receipt: Receipt; current_contract: string; current_receipt: Receipt }
export type Receipt = { status: string; operation_id?: string | null; operation_revision?: number | null; error_code?: string | null; result: Record<string, unknown> | null }
export type Context = { customer: { customer_id: string; reservation_revision: number; provider_revision: number | null; reservation_state: string; provider_state: string | null } | null; policies: Policy[]; consents: Consent[]; unfinished_operations: Summary[]; next_cursor: string | null; support_available: false }
// Historical snapshots are fetched through owned consent IDs, independently
// of current policies/cards; their cursor never denotes complete history.
export type PaymentView = { phase: 'loading' | 'ready' | 'unavailable' | 'unknown'; context: Context | null; cards: Card[]; operations: Operation[]; history?: Consent[]; historyReady?: boolean; historyCursor?: string | null; message: string }
export const emptyPaymentView: PaymentView = { phase: 'loading', context: null, cards: [], operations: [], message: '' }
// Late reads from an old owner/action generation cannot overwrite newer state.
export class PaymentGeneration {
 private revision = 0
 next() { return ++this.revision }
 current(revision: number) { return this.revision === revision }
}
// Pending mutations must be read/reconciled under their original operation ID;
// a browser never labels unknown outcomes as failed or creates a replacement.
export function operationMessage(status: string, recovery: string) {
 if (status === 'completed') return 'Completed'
 if (status === 'requires_action') return 'Card authentication required'
 if (status === 'unknown') return 'Outcome unknown. Check this operation before trying again.'
 if (status === 'pending') return recovery === 'reconcile' ? 'Checking the existing provider result' : 'Processing'
 if (status === 'conflict') return 'The account changed. Refresh before continuing.'
 return 'This action is unavailable'
}
export function separateOperation(previous: Operation | undefined, next: Operation): Operation {
 if (previous && (previous.summary.operation_id !== next.summary.operation_id || JSON.stringify(previous.original_receipt) !== JSON.stringify(next.original_receipt))) throw new Error('Changed original receipt')
 return { ...next, original_receipt: previous?.original_receipt ?? next.original_receipt }
}
// Saving a card has its own explicit purpose. Accountability never inherits it.
export function policyFor(context: Context | null, purpose: Policy['purpose']) { return context?.policies.find(policy => policy.purpose === purpose && policy.available) ?? null }

// Current acceptance requires the exact approved immutable policy identity; a
// grant for an older version remains historical authorization only.
export function acceptsPolicy(consent: Consent, policy: Policy | null, purpose: Policy['purpose'], scopeKey:string=purpose) {
 return !!policy && consent.state === 'active' && consent.scope_keys.includes(scopeKey) && consent.policy_id === policy.policy_id && consent.policy_version === policy.policy_version && consent.policy_hash === policy.policy_hash
}

// Product surfaces share one finite action vocabulary; unknown protocol keys
// remain internal and cannot be echoed into recovery or operation history.
export function paymentActionLabel(action: string) {
 const labels = { 'customer.ensure': 'Prepare card account', 'consent.accept': 'Accept terms', 'consent.revoke': 'Revoke consent', 'card.setup.begin': 'Add card', 'card.default.set': 'Make default', 'card.remove': 'Remove card' } as const
 return Object.hasOwn(labels, action) ? labels[action as keyof typeof labels] : 'Payment action'
}
// Current resource state remains distinct from the immutable original reply,
// with ordinary labels instead of SQL revisions or transport status spelling.
export function paymentResourceLabel(state: unknown) {
 const labels = { reserved: 'Account reserved', creating: 'Preparing account', ready: 'Ready', active: 'Active', revoked: 'Revoked', pending: 'Processing', requires_action: 'Card authentication required', succeeded: 'Completed', canceled: 'Canceled', failed: 'Failed', unknown: 'Outcome unknown', blocked: 'Unavailable', unavailable: 'Unavailable', removal_pending: 'Removal in progress', detached: 'Removed' } as const
 return typeof state === 'string' && Object.hasOwn(labels, state) ? labels[state as keyof typeof labels] : 'Unavailable'
}
