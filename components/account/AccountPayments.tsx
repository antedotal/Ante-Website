"use client"
// Explicit owner actions retain their original intention on uncertain outcomes.
// Provider continuation stays in RAM; authenticated cookies own operation input.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FinancialPolicy } from '../../lib/payments/financial-ui-model'
import CardSetup, { type SetupTicket } from './CardSetup'
import { emptyPaymentView, PaymentGeneration, operationMessage, separateOperation, policyFor, acceptsPolicy, paymentActionLabel, paymentResourceLabel, type PaymentView, type Context, type Card, type Operation, type Consent } from '../../lib/payments/card-ui-model'
const base = '/api/account/payments/browser/'
// Issued-generation metadata belongs only to transient card-entry memory.
// The authenticated page's verified-owner key supplies component isolation.
type IssuedSetupTicket = SetupTicket & { issuedGeneration: number }
type BrowserIntent = { requestId: string; operationId?: string; action: string; input?: Record<string, unknown> }
// Every mounted page supplies its verified owner to fence an account switch.
// Only fixed messages are rendered; raw network/provider errors stay private.
async function paymentRequest(path: string, body?: unknown, ownerId?: string) {
 const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(ownerId ? { 'X-Ante-Payment-Owner': ownerId } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'same-origin', cache: 'no-store', redirect: 'error' })
 const value = await response.json()
 if (!response.ok) throw new Error(response.status === 429 ? 'Please wait before trying again.' : response.status === 409 ? 'Check the original intention before another action.' : 'Payments are temporarily unavailable.')
 return value
}
// Current terms and owned historical grants have independent render paths.
// Revocation uses the original consent ID/revision and does not require cards,
// current commercial availability, or an unrelated operation to be completed.
function ConsentPanel({ purpose, title, context, scopeKey=purpose, policyOverride, historyOnly=false, showHistory=true, includeFinancialHistory=false, history = [], historyReady = false, busy, acceptanceBlocked = false, ownerId, act }: { purpose: 'card.save' | 'accountability' | 'premium'; scopeKey?:string;policyOverride?:FinancialPolicy;historyOnly?:boolean;showHistory?:boolean;includeFinancialHistory?:boolean; title: string; context: Context | null; history?: Consent[]; historyReady?: boolean; busy: boolean; acceptanceBlocked?: boolean; ownerId?: string; act: (action: string, input: Record<string, unknown>) => Promise<void> }) {
 const policy = policyOverride?{...policyOverride,available:true}:policyFor(context, purpose), [terms, setTerms] = useState<(Consent & { loadedOwner?: string }) | null>(null), [affirmedPolicy, setAffirmedPolicy] = useState<string | null>(null), [message, setMessage] = useState(''), generation = useRef(new PaymentGeneration())
 const policyId = policy?.policy_id, policyVersion = policy?.policy_version, policyHash = policy?.policy_hash
 const policyIdentity = JSON.stringify([ownerId, policyId, policyVersion, policyHash]), affirmed = affirmedPolicy === policyIdentity
 const active = (policyOverride?[...history,...(context?.consents??[])]:context?.consents)?.find(c => acceptsPolicy(c, policy, purpose, scopeKey))
 // A current context grant is still owned history when a history page misses it.
 // Full immutable text comes from consent_id reads, never a policy projection.
 const grants = [...history, ...(context?.consents ?? []).filter(c => !history.some(h => h.consent_id === c.consent_id))].filter(c => c.consent_id && (includeFinancialHistory?c.scope_keys.some(scope=>scope!=='card.save'&&scope!=='premium.subscribe'):c.scope_keys.includes(scopeKey)))
 useEffect(() => {
  const currentGeneration = generation.current, revision = currentGeneration.next()
  if (policyId && policyVersion) void paymentRequest('consent?policy_id=' + policyId + '&version=' + encodeURIComponent(policyVersion), undefined, ownerId).then(reply => { if (currentGeneration.current(revision)) setTerms({ ...reply.result as Consent, loadedOwner: ownerId }) }).catch(() => { if (currentGeneration.current(revision)) setMessage('Approved terms are unavailable.') })
  return () => { currentGeneration.next() }
 }, [ownerId, policyId, policyVersion, policyHash])
 // Synchronous identity matching also hides old terms before the replacement
 // effect runs, including a same-version hash change or unavailable policy.
 const currentTerms = policy && terms && terms.state !== 'unavailable' && terms.loadedOwner === ownerId && terms.policy_id === policyId && terms.policy_version === policyVersion && terms.policy_hash === policyHash && terms.scope_keys.includes(scopeKey) ? terms : null
 return <section className="rounded-2xl border border-[#003a4a]/15 p-6">
  <h2 className="text-xl font-semibold">{title}</h2>
  {!historyOnly&&(!currentTerms ? <p className="mt-3 text-sm">{message || 'Approved terms are unavailable. No authorization can be granted.'}</p> : <>
   <p className="mt-3 text-sm">Version {currentTerms.policy_version}</p>
   <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f4f8f9] p-4 text-sm">{currentTerms.approved_text}</div>
   {active ? <p className="mt-4">Consent active for this version</p> : <>
    <label className="mt-4 flex items-start gap-3"><input type="checkbox" checked={affirmed} disabled={busy || acceptanceBlocked} onChange={e => setAffirmedPolicy(e.target.checked ? policyIdentity : null)} /><span>I agree to these {purpose === 'card.save' ? 'card saving' : purpose==='premium'?'Premium subscription':'accountability'} terms.</span></label>
    <button disabled={busy || acceptanceBlocked || !affirmed || !(policyOverride?.customer_revision||context?.customer)} className="mt-4 rounded-lg bg-[#003a4a] px-4 py-2 text-white disabled:opacity-50" onClick={() => void act('consent.accept', { customer_revision: policyOverride?.customer_revision??context!.customer!.reservation_revision, policy_id: currentTerms.policy_id, policy_version: currentTerms.policy_version, policy_revision: currentTerms.revision, policy_hash: currentTerms.policy_hash, affirmative: true })}>Accept this version</button>
   </>}
  </>)}
  {showHistory&&<><h3 className="mt-5 font-medium">Recorded consent</h3>
  {grants.length === 0 && <p className="mt-2 text-sm">{historyReady ? 'No consent on this history page.' : 'Consent history has not been confirmed.'}</p>}
  {grants.map(grant => <div key={grant.consent_id} className="mt-3 rounded-lg bg-[#f4f8f9] p-4 text-sm">
   <p>Version {grant.policy_version} · {grant.state}</p>
   {grant.approved_text && <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{grant.approved_text}</div>}
   {/* Display the recorded dates using the existing Australian account date style; authorization still compares the full immutable policy hash. */}
   <p className="mt-2">Accepted: {grant.accepted_at ? <time dateTime={grant.accepted_at}>{new Date(grant.accepted_at).toLocaleString('en-AU')}</time> : 'Not confirmed'}{grant.revoked_at && <> · Revoked: <time dateTime={grant.revoked_at}>{new Date(grant.revoked_at).toLocaleString('en-AU')}</time></>}</p>
   {grant.state === 'active' && <button disabled={busy} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void act('consent.revoke', { consent_id: grant.consent_id, consent_revision: grant.revision })}>Revoke consent</button>}
  </div>)}</>}
  {purpose === 'accountability' && <p className="mt-3 text-sm">Saving a card does not accept these terms or create a hold.</p>}
 </section>
}
export default function AccountPayments({ enabled, publishableKey, ownerId, consentOnlyPurpose, financialPolicies=[] }: { enabled: boolean; publishableKey?: string; ownerId?: string;consentOnlyPurpose?:'accountability'|'premium';financialPolicies?:FinancialPolicy[] }) {
 const [ownedView, setView] = useState<PaymentView & { ownerId?: string }>(emptyPaymentView), [busy, setBusy] = useState(false), [ticket, setTicket] = useState<IssuedSetupTicket | null>(null), [recovery, setRecovery] = useState<BrowserIntent | null>(null), [revokeRecovery, setRevokeRecovery] = useState<BrowserIntent | null>(null), [intentReady, setIntentReady] = useState(false), generation = useRef(new PaymentGeneration()), intent = useRef<BrowserIntent | null>(null), originalOperations = useRef<Operation[]>([]), revokeIntent = useRef<BrowserIntent | null>(null), activeTicket = useRef<IssuedSetupTicket | null>(null)
 // An owner prop transition hides old snapshots synchronously, before effects
 // or pending reads have a chance to finish. The server still verifies identity.
 const view = ownedView.ownerId === ownerId ? ownedView : emptyPaymentView
 const request = useCallback((path: string, body?: unknown) => paymentRequest(path, body, ownerId), [ownerId])
 // A removed frame must not clear or recover a newer same-owner ticket. Every
 // clear invalidates the exact active object; callbacks also require its issuing
 // generation, including when the old asynchronous frame finishes later.
 const clearTicket = useCallback(() => { activeTicket.current = null; setTicket(null) }, [])
 const expire = useCallback(() => { if (!ticket || activeTicket.current !== ticket || !generation.current.current(ticket.issuedGeneration)) return; clearTicket(); setView(v => ({ ...v, message: 'Secure card entry expired. Check the existing setup.' })) }, [ticket, clearTicket])
 // Parallel owned reads do not make history dependent on current cards/policy.
 // Clear all old snapshots at the start and fence every subsequent reply. The
 // fixed owner header prevents mixed-owner results during a browser account swap.
 // Carry the current action announcement through snapshot rereads. A successful
 // read confirms data availability, not the outcome of an unknown execution.
 // This call-local message stays inside the existing owner/generation fence.
 const refresh = useCallback(async (historyAfter?: string, announcement = '') => {
  if (!enabled) return
  const revision = generation.current.next(); setView({ ...emptyPaymentView, ownerId }); setRecovery(null); setRevokeRecovery(null); setIntentReady(false); clearTicket()
  try {
   const [contextReply, cardsReply, operationsReply, historyReply, intentReply] = await Promise.allSettled([request('context'), request('cards'), request('operations?limit=20'), request('consents/history?limit=20' + (historyAfter ? '&after=' + historyAfter : '')), request('intent')])
   const summaries: { operation_id: string }[] = operationsReply.status === 'fulfilled' ? [...operationsReply.value.result.operations] : []
   // Recovery never depends on whether the original operation happens to appear
   // in the first history page. Read its exact cookie-restored ID as well.
   if (intentReply.status === 'fulfilled') for (const restored of [intentReply.value, intentReply.value.revocation]) if (restored?.operation_id && !summaries.some(summary => summary.operation_id === restored.operation_id)) summaries.push({ operation_id: restored.operation_id })
   const entries: Consent[] = historyReply.status === 'fulfilled' ? historyReply.value.result.entries : []
   const [detailReplies, consentReplies] = await Promise.all([
    Promise.allSettled(summaries.map((summary: { operation_id: string }) => request('operation?operation_id=' + summary.operation_id))),
    Promise.allSettled(entries.map(entry => request('consent?consent_id=' + entry.consent_id)))
   ])
   if (!generation.current.current(revision)) return
   const details = detailReplies.flatMap(reply => reply.status === 'fulfilled' ? [reply.value.result as Operation] : [])
   // An absent SQL row is never terminal. Cookie restoration is independent of
   // operation reads, so prepared-but-unexecuted and lost-ACK work can resume.
   if (intentReply.status === 'fulfilled') {
    const restored = intentReply.value
    const original: BrowserIntent | null = restored.request_id && restored.operation_id && restored.action ? { requestId: restored.request_id, operationId: restored.operation_id, action: restored.action } : null
    const terminal = original && details.some(detail => detail.summary.operation_id === original.operationId && ['completed', 'denied'].includes(detail.summary.status))
    intent.current = terminal ? null : original; setRecovery(intent.current)
    const child = restored.revocation, revocation: BrowserIntent | null = child ? { requestId: child.request_id, operationId: child.operation_id, action: child.action } : null
    const revokeTerminal = revocation && details.some(detail => detail.summary.operation_id === revocation.operationId && ['completed', 'denied'].includes(detail.summary.status))
    revokeIntent.current = revokeTerminal ? null : revocation; setRevokeRecovery(revokeIntent.current); setIntentReady(true)
   }
   const operations = details.map(detail => separateOperation(originalOperations.current.find(previous => previous.summary.operation_id === detail.summary.operation_id), detail)); originalOperations.current = operations
   const available = contextReply.status === 'fulfilled' && cardsReply.status === 'fulfilled'
   setView({ ownerId, phase: available ? 'ready' : 'unavailable', context: contextReply.status === 'fulfilled' ? contextReply.value.result as Context : null, cards: cardsReply.status === 'fulfilled' ? cardsReply.value.cards as Card[] : [], operations, history: consentReplies.flatMap(reply => reply.status === 'fulfilled' ? [reply.value.result as Consent] : []), historyReady: historyReply.status === 'fulfilled' && consentReplies.every(reply => reply.status === 'fulfilled'), historyCursor: historyReply.status === 'fulfilled' ? historyReply.value.result.next_cursor : null, message: available ? announcement : [announcement, 'Current cards or policies are unavailable. Owned consent history and original operation recovery are shown separately.'].filter(Boolean).join(' ') })
  } catch {
   if (generation.current.current(revision)) setView({ ...emptyPaymentView, ownerId, phase: 'unavailable', message: 'Payments are temporarily unavailable. Check the original intention before another action.' })
  }
 }, [enabled, ownerId, request, clearTicket])
 useEffect(() => {
  const currentGeneration = generation.current
  intent.current = null; revokeIntent.current = null; originalOperations.current = []
  if (enabled) void refresh()
  return () => { currentGeneration.next() }
 }, [enabled, ownerId, refresh])
 // Execution, including explicit resume, sends only correlation IDs. Neither
 // restored UI state nor caller input can select the cookie's operation/payload.
 async function executeOriginal(original: BrowserIntent, revokeSlot: boolean, revision: number) {
  if (!original.operationId) throw new Error('Check the original intention.')
  const reply = await request('execute', { request_id: original.requestId, expected_operation_id: original.operationId })
  if (!generation.current.current(revision)) return
  const announcement = operationMessage(reply.status, reply.result?.operation?.recovery ?? 'none')
  setView(v => ({ ...v, message: announcement }))
  if (['completed', 'denied'].includes(reply.status)) { if (revokeSlot) { revokeIntent.current = null; setRevokeRecovery(null) } else { intent.current = null; setRecovery(null) } }
  else { if (revokeSlot) setRevokeRecovery(original); else setRecovery(original); setView(v => ({ ...v, phase: 'unknown' })) }
  await refresh(undefined, announcement)
 }
 async function resumeOriginal(revokeSlot = false) {
  const original = revokeSlot ? revokeRecovery : recovery
  if (!enabled || busy || !intentReady || !original) return
  setBusy(true); const revision = generation.current.next(); clearTicket()
  try { await executeOriginal(original, revokeSlot, revision) } catch { if (generation.current.current(revision)) setView(v => ({ ...v, phase: 'unknown', message: 'The outcome is unknown. Check or resume the same original intention.' })) } finally { setBusy(false) }
 }
 // Historical revoke deliberately bypasses commercial UI readiness, but re-reads
 // the exact owned consent before preparing and keeps the cookie replacement
 // fence. A single owner-only revoke slot preserves unrelated provider recovery.
 async function act(action: string, input: Record<string, unknown>) {
  if (!enabled || busy || !intentReady) return
  const revokeSlot = action === 'consent.revoke' && (intent.current?.action !== 'consent.revoke'), prior = action === 'consent.revoke' ? revokeIntent.current ?? (intent.current?.action === 'consent.revoke' ? intent.current : null) : revokeIntent.current ?? intent.current
  if (prior) { if (prior === revokeIntent.current) setRevokeRecovery(prior); else setRecovery(prior); setView(v => ({ ...v, message: 'Check or resume the original ' + paymentActionLabel(prior.action) + ' action before preparing this action.' })); return }
  setBusy(true); const revision = generation.current.next(); clearTicket()
  try {
   if (action === 'consent.revoke') {
    const owned = (await request('consent?consent_id=' + input.consent_id)).result as Consent
    if (!generation.current.current(revision)) return
    if (owned.consent_id !== input.consent_id || owned.state !== 'active' || owned.revision !== input.consent_revision) { await refresh(); setView(v => ({ ...v, message: 'Consent changed. Review its current recorded state before revoking.' })); return }
   }
   const original: BrowserIntent = { requestId: crypto.randomUUID(), action, input }; if (revokeSlot) revokeIntent.current = original; else intent.current = original
   const prepared = await request('prepare', { request_id: original.requestId, action, input })
   if (!generation.current.current(revision)) return
   original.operationId = prepared.operation_id; if (revokeSlot) setRevokeRecovery(original); else setRecovery(original)
   await executeOriginal(original, revokeSlot, revision)
  } catch { if (generation.current.current(revision)) { const announcement = 'The outcome is unknown. Check the original intention before another action.'; setView(v => ({ ...v, phase: 'unknown', message: announcement })); await refresh(undefined, announcement) } } finally { setBusy(false) }
 }
 async function continueSetup() {
  if (!enabled || busy) return; setBusy(true); const revision = generation.current.next()
  try { await request('setup/return', {}); if (!generation.current.current(revision)) return; const reply = await request('setup/continuation', {}); if (!generation.current.current(revision)) return; if (!reply.client_secret || reply.return_route_key !== 'account_payments' || !Number.isFinite(Date.parse(reply.expires_at))) throw new Error('Unavailable'); const issued: IssuedSetupTicket = { client_secret: reply.client_secret, expires_at: reply.expires_at, return_route_key: 'account_payments', issuedGeneration: revision }; activeTicket.current = issued; setTicket(issued) } catch { if (generation.current.current(revision)) setView(v => ({ ...v, message: 'Card entry is unavailable. Check the existing setup; no replacement was created.' })) } finally { setBusy(false) }
 }
 async function checkSetup() {
  if (!enabled || busy) return; setBusy(true); clearTicket(); const revision = generation.current.next()
  try { const reply = await request('setup/return/consume', {}); if (!generation.current.current(revision)) return; const announcement = operationMessage(reply.status, 'none'); setView(v => ({ ...v, message: announcement })); await refresh(undefined, announcement) } catch { if (generation.current.current(revision)) setView(v => ({ ...v, message: 'The setup outcome is unknown. Its original operation remains recorded.' })) } finally { setBusy(false) }
 }
 // Captured callbacks from an old frame can never initiate current-cookie
 // recovery after refresh, ticket replacement or the keyed owner's unmount.
 async function confirmIssuedTicket() {
  if (!ticket || activeTicket.current !== ticket || !generation.current.current(ticket.issuedGeneration)) return
  await checkSetup()
 }
 const customer = view.context?.customer, cardConsent = view.context?.consents.find(c => acceptsPolicy(c, policyFor(view.context, 'card.save'), 'card.save'))
 const unfinished = !!recovery || !!revokeRecovery || view.operations.some(o => !['completed', 'denied'].includes(o.summary.status)) || Boolean(view.context?.unfinished_operations.some(o => !['completed', 'denied'].includes(o.status)))
 const newActionBlocked = busy || !intentReady || unfinished || view.phase !== 'ready', pendingSetup = view.operations.some(o => o.summary.action === 'card.setup.begin' && ['pending', 'requires_action', 'unknown'].includes(o.summary.status))
 const Container=consentOnlyPurpose?'section':'main'
 return <Container className={consentOnlyPurpose?'space-y-4':'mx-auto min-h-screen max-w-3xl px-6 py-20 text-[#003a4a]'}>
  {!consentOnlyPurpose&&<><h1 className="text-3xl font-semibold">Cards and consent</h1><p className="mt-3 text-sm">Manage saved cards and review each authorization separately.</p></>}
  {!enabled ? <p role="status" className="mt-8 rounded-xl border p-5">Card management is not available yet.</p> : <>
   <div className="mt-6 flex flex-wrap items-center gap-4"><button disabled={busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void refresh()}>Check progress</button><p role="status" aria-live="polite" className="text-sm">{view.phase === 'loading' ? 'Loading your cards…' : view.message}</p></div>
   {recovery && <section className="mt-6 rounded-xl border p-5"><p>Original action: {paymentActionLabel(recovery.action)}</p><p className="mt-2 text-sm">Check progress or resume this same action before starting another.</p><button disabled={busy || !intentReady} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void resumeOriginal()}>Resume original action</button></section>}
   {revokeRecovery && <section className="mt-6 rounded-xl border p-5"><p>Original action: Revoke consent</p><p className="mt-2 text-sm">Check or resume this same revocation while the original card action remains recorded.</p><button disabled={busy || !intentReady} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void resumeOriginal(true)}>Resume original revocation</button></section>}
   {!consentOnlyPurpose&&<section className="mt-8 rounded-2xl border border-[#003a4a]/15 p-6"><h2 className="text-xl font-semibold">Saved cards</h2>
    {view.cards.length === 0 ? <p className="mt-4 text-sm">{view.phase === 'ready' ? 'No saved cards.' : 'Saved cards have not been confirmed.'}</p> : <ul className="mt-4 space-y-4">{view.cards.map(card => <li key={card.card_id} className="rounded-xl bg-[#f4f8f9] p-4"><p className="font-medium">{card.brand} •••• {card.last4}{card.is_default ? ' · Default' : ''}</p><p className="mt-1 text-sm">Expires {card.expiry_month}/{card.expiry_year} · {card.state}</p><div className="mt-3 flex gap-3">{!card.is_default && <button disabled={newActionBlocked || card.state !== 'active'} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => void act('card.default.set', { customer_revision: customer?.provider_revision, card_id: card.card_id, card_revision: card.revision })}>Make default</button>}<button disabled={newActionBlocked || card.state !== 'active'} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => void act('card.remove', { customer_revision: customer?.provider_revision, card_id: card.card_id, card_revision: card.revision })}>Remove card</button></div></li>)}</ul>}
    {!customer ? <button disabled={newActionBlocked} className="mt-5 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void act('customer.ensure', { customer_revision: 0 })}>Prepare card account</button> : <button disabled={newActionBlocked || !cardConsent || customer.provider_state !== 'ready'} className="mt-5 rounded-lg bg-[#003a4a] px-4 py-2 text-white disabled:opacity-50" onClick={() => void act('card.setup.begin', { customer_revision: customer.provider_revision, consent_id: cardConsent!.consent_id })}>Add a card</button>}
    {pendingSetup && <div className="mt-5 flex gap-3"><button disabled={busy || !!ticket} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void continueSetup()}>Continue existing setup</button><button disabled={busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void checkSetup()}>Check card setup</button></div>}
    {ticket && publishableKey && <CardSetup ticket={ticket} publishableKey={publishableKey} onExpired={expire} onConfirmed={confirmIssuedTicket} />}<p className="mt-4 text-sm">Saving a card does not start a payment or accountability hold.</p>
   </section>}
   {consentOnlyPurpose?<div className="space-y-6">{financialPolicies.filter(p=>p.purpose===consentOnlyPurpose).map(policy=><ConsentPanel key={ownerId+':'+policy.policy_id+':'+policy.policy_version+':'+policy.policy_hash} purpose={policy.purpose} showHistory={false} scopeKey={policy.scope_key} policyOverride={policy} title={policy.purpose==='premium'?'Premium subscription consent':'Accountability consent'} ownerId={ownerId} context={view.context} history={view.history} historyReady={view.historyReady} busy={busy||!intentReady} acceptanceBlocked={busy||!intentReady||unfinished} act={act}/>)}<ConsentPanel historyOnly includeFinancialHistory={consentOnlyPurpose==='accountability'} purpose={consentOnlyPurpose} scopeKey={consentOnlyPurpose==='premium'?'premium.subscribe':'accountability'} title={consentOnlyPurpose==='premium'?'Recorded Premium consent':'Other recorded payment consent'} ownerId={ownerId} context={view.context} history={view.history} historyReady={view.historyReady} busy={busy||!intentReady} act={act}/>{financialPolicies.filter(p=>p.purpose===consentOnlyPurpose).length===0&&<p>Approved {consentOnlyPurpose==='premium'?'Premium':'accountability'} terms are unavailable. No new authorization can be granted.</p>}</div>:<div className="mt-8 space-y-6">{(['card.save', 'accountability'] as const).map(purpose => <ConsentPanel key={ownerId + ':' + purpose + ':' + JSON.stringify(policyFor(view.context, purpose))} purpose={purpose} title={purpose === 'card.save' ? 'Card saving consent' : 'Accountability authorization'} ownerId={ownerId} context={view.context} history={view.history} historyReady={view.historyReady} busy={busy || !intentReady} acceptanceBlocked={newActionBlocked} act={act} />)}</div>}
   {view.historyCursor && <button disabled={busy} className="mt-4 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void refresh(view.historyCursor!)}>Next consent history page</button>}
   <section className="mt-8"><h2 className="text-xl font-semibold">Recorded operations</h2><ul className="mt-4 space-y-4">{view.operations.map(operation => <li className="rounded-xl border p-4" key={operation.summary.operation_id}><p className="font-medium">{paymentActionLabel(operation.summary.action)}</p><p className="mt-2 text-sm">Original response: {operationMessage(operation.original_receipt.status, 'none')}</p><p className="mt-1 text-sm">Current progress: {operationMessage(operation.summary.status, operation.summary.recovery)}</p><p className="mt-1 text-sm">Current result: {paymentResourceLabel(operation.current_receipt.result?.state)}</p></li>)}</ul></section>
  </>}
 </Container>
}
