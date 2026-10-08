// Subscription DTOs reuse accepted canonical hashes; syntax validation never grants provider or billing authority.
import { exact, internalId, canonicalRequest, paymentRequestHash } from './web-payment-provider-contract.mjs';
export { exact, internalId, canonicalRequest, paymentRequestHash };
export const SUBSCRIPTION_ACTIONS=Object.freeze(['subscription.checkout','subscription.manage','subscription.read','subscription.list','subscription.recover','entitlement.read']);
export const SUBSCRIPTION_ERRORS=Object.freeze(['invalid_input','not_found','configuration_missing','activation_closed','policy_changed','revision_conflict','payload_conflict','dependency_open','rate_limited','provider_unknown','provider_declined','return_adapter_unavailable','event_adapter_unavailable','funding_adapter_unavailable']);
// Bounds match PostgreSQL integer revisions; UUIDs are lowercase canonical internal identities.
export const revision=(value,min=1)=>Number.isInteger(value)&&value>=min&&value<=2147483647;
export const uuid=value=>internalId(value)&&value===value.toLowerCase();
// Opaque provider IDs are fixed object-specific grammar, still requiring independent account/owner provenance.
const objectPrefixes=Object.freeze({checkout_session:'cs_',subscription:'sub_',invoice:'in_',price:'price_',product:'prod_',customer:'cus_',payment_intent:'pi_',refund:'re_',dispute:'dp_'});
export const billingObjectId=(kind,value)=>Object.hasOwn(objectPrefixes,kind)&&typeof value==='string'&&new RegExp(`^${objectPrefixes[kind]}[A-Za-z0-9_]{1,240}$`).test(value);
export const isoTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
// Owner requests contain no provider IDs, money, country, URL, event or generic SDK selector.
export function parseSubscriptionRequest(action,value){
 const keys=action==='subscription.checkout'?['operation_id','customer_revision','entitlement_revision','configuration_id','configuration_revision','consent_id','consent_revision','plan_key']:action==='subscription.manage'?['operation_id','subscription_id','subscription_revision','entitlement_revision','action']:action==='subscription.read'?['subscription_id']:action==='subscription.list'?['limit','cursor']:action==='subscription.recover'?['operation_id']:action==='entitlement.read'?[]:null;
 if(!keys||!exact(value,keys))throw new TypeError('invalid_input');
 for(const key of keys){
  if(key.endsWith('_id')&&!uuid(value[key]))throw new TypeError('invalid_input');
  if(key.endsWith('_revision')&&!revision(value[key],key==='entitlement_revision'?0:1))throw new TypeError('invalid_input');
 }
 if(action==='subscription.checkout'&&!['monthly','annual'].includes(value.plan_key)||action==='subscription.manage'&&value.action!=='cancel_at_period_end'||action==='subscription.list'&&(!Number.isInteger(value.limit)||value.limit<1||value.limit>50||value.cursor!==null&&(typeof value.cursor!=='string'||!value.cursor.length||value.cursor.length>512||!/^[0-9a-f]{32}$/.test(value.cursor))))throw new TypeError('invalid_input');
 return structuredClone(value);
}
// Missing approved cap/config is unknown. Premium requires an evidenced interval and exact cap version.
export function parseEntitlement(value){
 if(!exact(value,['revision','tier','provider_verified','effective_until','cap_configuration_id','cap_configuration_revision'])||!revision(value.revision,0)||!['free','premium','unknown'].includes(value.tier)||typeof value.provider_verified!=='boolean'||value.effective_until!==null&&!isoTime(value.effective_until)||value.cap_configuration_id!==null&&!uuid(value.cap_configuration_id)||value.cap_configuration_revision!==null&&!revision(value.cap_configuration_revision)||((value.cap_configuration_id===null)!==(value.cap_configuration_revision===null)))throw new TypeError('invalid_receipt');
 if(value.tier==='premium'&&(!value.provider_verified||value.effective_until===null||value.cap_configuration_id===null||value.revision===0)||value.tier==='unknown'&&(value.provider_verified||value.effective_until!==null||value.cap_configuration_id!==null))throw new TypeError('invalid_receipt');
 return structuredClone(value);
}
// Current closed projection cannot deliver Checkout URLs until accepted purpose-specific return composition.
export function parseSubscription(value){
 if(!exact(value,['subscription_id','revision','plan_key','state','paid_through','cancel_at_period_end','checkout_url'])||!uuid(value.subscription_id)||!revision(value.revision)||!['monthly','annual'].includes(value.plan_key)||!['checkout_pending','active','past_due','cancel_scheduled','canceled','unknown'].includes(value.state)||value.paid_through!==null&&!isoTime(value.paid_through)||typeof value.cancel_at_period_end!=='boolean'||value.checkout_url!==null||value.state==='cancel_scheduled'&&!value.cancel_at_period_end)throw new TypeError('invalid_receipt');
 return structuredClone(value);
}
// Original receipt carries independent operation/resource revisions; current progress is a separate read.
export function parseSubscriptionReceipt(action,value){
 if(!SUBSCRIPTION_ACTIONS.includes(action)||!exact(value,['subscription_contract_version','operation_id','operation_revision','resource_revision','status','result','error_code','retry_after_seconds'])||value.subscription_contract_version!==1||!['completed','pending','requires_action','unknown','denied','conflict'].includes(value.status)||value.operation_id!==null&&!uuid(value.operation_id)||value.operation_revision!==null&&!revision(value.operation_revision)||((value.operation_id===null)!==(value.operation_revision===null))||value.resource_revision!==null&&!revision(value.resource_revision,action==='entitlement.read'?0:1)||value.error_code!==null&&!SUBSCRIPTION_ERRORS.includes(value.error_code)||value.retry_after_seconds!==null&&(!Number.isInteger(value.retry_after_seconds)||value.retry_after_seconds<1||value.retry_after_seconds>60)||(value.error_code==='rate_limited')!==(value.retry_after_seconds!==null))throw new TypeError('invalid_receipt');
 if(value.result===null){if(value.resource_revision!==null||!['denied','conflict','unknown'].includes(value.status))throw new TypeError('invalid_receipt');}
 else if(action==='entitlement.read'){parseEntitlement(value.result);if(value.resource_revision!==value.result.revision)throw new TypeError('invalid_receipt');}
 else if(action==='subscription.list'){
  if(!exact(value.result,['subscriptions','next_cursor'])||!Array.isArray(value.result.subscriptions)||value.result.subscriptions.length>50||value.resource_revision!==null||value.result.next_cursor!==null&&(typeof value.result.next_cursor!=='string'||value.result.next_cursor.length>512||!/^[0-9a-f]{32}$/.test(value.result.next_cursor)))throw new TypeError('invalid_receipt');
  value.result.subscriptions.forEach(parseSubscription);
 }else{parseSubscription(value.result);if(value.resource_revision!==value.result.revision)throw new TypeError('invalid_receipt');}
 return structuredClone(value);
}
// This sanitized evidence grammar is transport data only; SQL still requires the accepted event/retrieval authority.
export function parseBillingEvidence(value){
 const keys=['evidence_version','kind','customer_id','subscription_id','invoice_id','price_id','product_id','currency','amount_paid','period_start','period_end','subscription_status','invoice_status','payment_status','interval','interval_count','quantity','livemode','source_revision'];
 if(!exact(value,keys)||value.evidence_version!==1||value.kind!=='paid_period'||!['customer','subscription','invoice','price','product'].every(kind=>billingObjectId(kind,value[`${kind}_id`]))||value.currency!=='aud'||!Number.isSafeInteger(value.amount_paid)||value.amount_paid<1||value.amount_paid>2147483647||!Number.isSafeInteger(value.period_start)||value.period_start<1||!Number.isSafeInteger(value.period_end)||value.period_end<=value.period_start||value.period_end>8640000000000||!['active','past_due','canceled'].includes(value.subscription_status)||value.invoice_status!=='paid'||value.payment_status!=='succeeded'||!['month','year'].includes(value.interval)||value.interval_count!==1||value.quantity!==1||typeof value.livemode!=='boolean'||!revision(value.source_revision))throw new TypeError('invalid_evidence');
 return structuredClone(value);
}
// Non-paid reconciliation records method/renewal state only. Closure needs settled invoice inventory, never an active/paid shortcut.
export function parseBillingStateEvidence(value){
 const keys=['evidence_version','kind','customer_id','subscription_id','invoice_id','invoice_state','subscription_state','cancel_at_period_end','method_id','method_inventory_complete','remaining_dependency','livemode','source_revision','refund_id','refund_amount','refund_status','dispute_id','dispute_status'];
 if(!exact(value,keys)||value.evidence_version!==1||!['invoice_pending','cancel_scheduled','renewal_closed','refund','dispute','unknown'].includes(value.kind)||!billingObjectId('customer',value.customer_id)||!billingObjectId('subscription',value.subscription_id)||value.invoice_id!==null&&!billingObjectId('invoice',value.invoice_id)||value.method_id!==null&&!/^pm_[A-Za-z0-9_]{1,240}$/.test(value.method_id)||!['paid','open','void','uncollectible','unknown'].includes(value.invoice_state)||!['active','past_due','canceled','unknown'].includes(value.subscription_state)||!['cancel_at_period_end','method_inventory_complete','remaining_dependency','livemode'].every(k=>typeof value[k]==='boolean')||!revision(value.source_revision))throw new TypeError('invalid_evidence');
 if(value.kind==='refund'?(!billingObjectId('refund',value.refund_id)||!revision(value.refund_amount)||!['succeeded','pending','failed','canceled'].includes(value.refund_status)||value.dispute_id!==null||value.dispute_status!==null):value.refund_id!==null||value.refund_amount!==null||value.refund_status!==null)throw new TypeError('invalid_evidence');
 if(value.kind==='dispute'?(!billingObjectId('dispute',value.dispute_id)||!['lost','needs_response','prevented','under_review','warning_closed','warning_needs_response','warning_under_review','won'].includes(value.dispute_status)):value.dispute_id!==null||value.dispute_status!==null)throw new TypeError('invalid_evidence');
 if(value.kind==='renewal_closed'&&(value.subscription_state!=='canceled'||!value.method_inventory_complete||value.remaining_dependency||value.invoice_id===null||!['paid','void'].includes(value.invoice_state))||value.kind==='unknown'&&(value.subscription_state!=='unknown'||value.method_inventory_complete||!value.remaining_dependency)||['invoice_pending','cancel_scheduled','refund','dispute'].includes(value.kind)&&!value.remaining_dependency||value.kind==='cancel_scheduled'&&!value.cancel_at_period_end)throw new TypeError('invalid_evidence');
 return structuredClone(value);
}
