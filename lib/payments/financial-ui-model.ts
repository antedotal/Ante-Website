// Browser models accept only approved owner projections. No price, backing,
// entitlement or operation identity is inferred from a provider redirect.
import { exact, internalId } from './browser-dto-v1/primitives.mjs'
import { parseFinancialTaskReceipt } from './browser-dto-v1/web-payment-task-admission-contract.mjs'
import { parseSubscriptionReceipt } from './browser-dto-nonpaid-v1/web-payment-subscription-contract.mjs'
export type FinancialAction='task.quote'|'task.admit'|'premium.checkout'|'premium.cancel'
export type FinancialReceipt={operation_id:string|null;status:string;result:Record<string,unknown>|null;error_code:string|null;retry_after_seconds:number|null}
export type Quote={quote_id:string;quote_hash:string;task_id:string;task_revision:number;amount_minor:string;currency:'AUD';expires_at:string;eligibility_revision:number;snapshot_hash:string}
export type TaskProgress={task_id:string;task_revision:number;state:'draft'|'payment_pending'|'active';commitment_id:string|null;commitment_revision:number|null;amount_minor:string;currency:'AUD';quote_id:string;quote_hash:string;funding_state:'authorized'|'active_unsecured'|null;started_at:string|null}
export type Entitlement={revision:number;tier:'free'|'premium'|'unknown';provider_verified:boolean;effective_until:string|null;cap_configuration_id:string|null;cap_configuration_revision:number|null}
export type Subscription={subscription_id:string;revision:number;plan_key:'monthly'|'annual';state:string;paid_through:string|null;cancel_at_period_end:boolean;checkout_url:null}
export type TaskSelection={configuration_id:string;configuration_revision:number;card_id:string;card_revision:number;consent_id:string;consent_revision:1;settings_hash:string;eligibility_revision:number}
export type PremiumSelection={customer_revision:number;entitlement_revision:number;configuration_id:string;configuration_revision:number;consent_id:string;consent_revision:1}
export type FinancialPolicy={purpose:'accountability'|'premium';scope_key:string;policy_id:string;policy_version:string;policy_revision:number;policy_hash:string;customer_revision:number}
export type FinancialContext={policies:FinancialPolicy[];task:{selections:{funding_mode:'short_authorization'|'long_unsecured';cutoff_seconds:number|null;processing_buffer_seconds:number|null;selection:TaskSelection}[];lists:{list_id:string;label:string}[];verifiers:{verifier_id:string;label:string}[];available:boolean};premium:{plans:{plan_key:'monthly'|'annual';amount_minor:string;currency:'AUD';selection:PremiumSelection}[];available:boolean}}
const revision=(v:unknown,min=1)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=2147483647
// Exact context parsing permits only internal selectors and human display text;
// provider objects, secrets, approvals and client-controlled amounts are absent.
export function financialContext(v:unknown):FinancialContext {
 if(!exact(v,['policies','task','premium']))throw new Error('Unavailable context');const c=v as FinancialContext,t=c.task,p=c.premium
 if(!Array.isArray(c.policies)||c.policies.length>4||c.policies.some(p=>!exact(p,['purpose','scope_key','policy_id','policy_version','policy_revision','policy_hash','customer_revision'])||!['accountability','premium'].includes(p.purpose)||!internalId(p.policy_id)||!revision(p.policy_revision)||!revision(p.customer_revision)||typeof p.policy_version!=='string'||! /^[A-Za-z0-9._-]{1,64}$/.test(p.policy_version)||typeof p.policy_hash!=='string'||! /^[0-9a-f]{64}$/.test(p.policy_hash)||typeof p.scope_key!=='string'||! /^[a-z][a-z0-9._-]{0,63}$/.test(p.scope_key)))throw new Error('Unavailable context')
 if(!exact(t,['selections','lists','verifiers','available'])||!exact(p,['plans','available'])||typeof t.available!=='boolean'||typeof p.available!=='boolean'||!Array.isArray(t.lists)||t.lists.length>100||!Array.isArray(t.verifiers)||t.verifiers.length>100||!Array.isArray(p.plans)||p.plans.length>2)throw new Error('Unavailable context')
 const selection=(s:unknown,task:boolean)=>{const keys=task?['configuration_id','configuration_revision','card_id','card_revision','consent_id','consent_revision','settings_hash','eligibility_revision']:['customer_revision','entitlement_revision','configuration_id','configuration_revision','consent_id','consent_revision'];if(!exact(s,keys))return false;const r=s as Record<string,unknown>;return keys.every(k=>k.endsWith('_id')?internalId(r[k])&&r[k]===String(r[k]).toLowerCase():k==='settings_hash'?typeof r[k]==='string'&&/^[0-9a-f]{64}$/.test(r[k]):revision(r[k],k==='entitlement_revision'?0:1))&&r.consent_revision===1}
 if(!Array.isArray(t.selections)||t.selections.length>2||new Set(t.selections.map(s=>s.funding_mode)).size!==t.selections.length||t.selections.some(s=>!exact(s,['funding_mode','cutoff_seconds','processing_buffer_seconds','selection'])||!['short_authorization','long_unsecured'].includes(s.funding_mode)||!selection(s.selection,true)||s.cutoff_seconds!==null&&(!revision(s.cutoff_seconds)||s.cutoff_seconds>259200)||s.processing_buffer_seconds!==null&&(!revision(s.processing_buffer_seconds)||s.processing_buffer_seconds>86400)||s.funding_mode==='short_authorization'&&(s.cutoff_seconds===null||s.processing_buffer_seconds===null))||t.available&&!t.selections.length)throw new Error('Unavailable context')
 const label=(s:unknown)=>typeof s==='string'&&s.trim().length>0&&new TextEncoder().encode(s).length<=512
 if(t.lists.some(l=>!exact(l,['list_id','label'])||typeof l.list_id!=='string'||l.list_id.length<1||l.list_id.length>128||!label(l.label))||t.verifiers.some(f=>!exact(f,['verifier_id','label'])||!internalId(f.verifier_id)||!label(f.label))||p.plans.some(plan=>!exact(plan,['plan_key','amount_minor','currency','selection'])||!['monthly','annual'].includes(plan.plan_key)||!/^\d{1,10}$/.test(plan.amount_minor)||BigInt(plan.amount_minor)<1n||BigInt(plan.amount_minor)>2147483647n||plan.currency!=='AUD'||!selection(plan.selection,false))||new Set(p.plans.map(plan=>plan.plan_key)).size!==p.plans.length||p.available&&!p.plans.length)throw new Error('Unavailable context')
 return structuredClone(c)
}
// Decimal input is converted with integer arithmetic, so defaults never round
// fractional cents or use the browser's numbers as task financial authority.
export function audCents(input:string):number|null {if(!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(input))return null;const [whole,fraction='']=input.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return cents>=100&&cents<=5000?cents:null}
export function audMoney(minor:string|number){return new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(minor)/100)}
// Task10 alone reports admission/start. An authenticated browser completion only
// asks for a fresh read and cannot promote a pending commitment into backing.
export function financialProgressLabel(progress:{state:string;funding_state:string|null}) {if(progress.state==='active')return progress.funding_state==='authorized'?'Started with a verified hold':progress.funding_state==='active_unsecured'?'Started without reserved funds':'Start outcome unknown';return progress.state==='payment_pending'?'Waiting for verified backing':'Draft — review before starting'}
// Immutable original receipts cannot be replaced by newer progress or another
// correlated operation. The resource read is stored separately by the caller.
function sameOriginal(a:unknown,b:unknown):boolean {if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&sameOriginal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export class FinancialOperation {
 original:Record<string,unknown>|null=null
 constructor(readonly operationId:string,readonly action:FinancialAction){}
 record(receipt:Record<string,unknown>){if(receipt.operation_id!==this.operationId||this.original&&!sameOriginal(this.original,receipt))throw new Error('Changed original receipt');this.original??=structuredClone(receipt)}
}
export function financialReceipt(action:FinancialAction|'task.read'|'task.settings'|'premium.read'|'premium.list'|'premium.entitlement',value:unknown):FinancialReceipt {return (action.startsWith('task.')?parseFinancialTaskReceipt(value):parseSubscriptionReceipt(action==='premium.entitlement'?'entitlement.read':action==='premium.cancel'?'subscription.manage':action.replace('premium.','subscription.'),value)) as FinancialReceipt}
// Current paid access needs a provider-verified effective interval and exact cap
// version. Checkout/active subscription state is intentionally insufficient.
export function currentPremium(value:Partial<Omit<Entitlement,'tier'>> & {tier?:string},now=Date.now()) {return value.tier==='premium'&&value.provider_verified===true&&typeof value.effective_until==='string'&&Date.parse(value.effective_until)>now&&!!value.cap_configuration_id&&revision(value.cap_configuration_revision)&&revision(value.revision)}
// Only the protected Premium transport may supply an original hosted Checkout
// URL. User query/return fields and arbitrary URLs never choose a destination.
export function safeCheckoutUrl(value:unknown):value is string {if(typeof value!=='string'||value.length>4096)return false;try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.port&&!u.username&&!u.password&&!u.search&&/^\/c\/pay\/cs_[A-Za-z0-9_]+$/.test(u.pathname)}catch{return false}}

// Billing labels and recovery controls describe ordinary owner projections only.
// A scheduled cancellation has precedence over active billing. Cancelability is
// a view hint; the original server still selects revisions and decides authority.
export function subscriptionBilling(subscription:Pick<Subscription,'state'|'cancel_at_period_end'>){const state=subscription.state,label=state==='active'&&subscription.cancel_at_period_end?'Renewal cancellation scheduled':({checkout_pending:'Checkout pending',active:'Active subscription',past_due:'Payment overdue',unpaid:'Subscription unpaid',paused:'Subscription paused',cancel_scheduled:'Renewal cancellation scheduled',canceled:'Canceled',unknown:'Outcome unknown'} as Record<string,string>)[state]??'Outcome unknown';return {label,cancelable:!subscription.cancel_at_period_end&&['active','past_due','unpaid','paused'].includes(state),needsRecovery:['past_due','unpaid','paused'].includes(state)}}
