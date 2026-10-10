// Fixed read-only resources extend the sole private SDK catalog. This module
// receives the one already-constructed client; it constructs no client/executor
// and cannot POST, search, list, capture, charge or choose a provider URL.
import type Stripe from 'stripe';
import type {Permit,Observation} from './webPaymentProviderContractJoint.ts';
import type {GuardedTransport} from './webPaymentProviderClientV4.ts';
import {parseNoticePermit,verifyCanonicalNotice,unknownNotice,type NoticePermit,type CanonicalNotice} from './webPaymentJointNotice.ts';
export async function retrieveCanonicalNotice(p:NoticePermit,sdk:Stripe,transport:GuardedTransport,originalRead:(p:Permit)=>Promise<Observation>):Promise<CanonicalNotice>{
 try{
  p=parseNoticePermit(p);const get=<T>(work:()=>Promise<T>)=>{parseNoticePermit(p);return transport.run(work);};
  // Capture immutable notice identity before any asynchronous work or callback.
  // Every initial ID/type comes only from the protected original signed job.
  // Any additional ID is an exact bounded reference from its canonical GET.
  // Each follow-up object must carry the same pinned API response provenance,
  // including dependent charge/SKU/payment reads, before its facts are combined.
  const api=(value:unknown)=>!!value&&typeof value==='object'&&(value as {lastResponse?:{apiVersion?:string}}).lastResponse?.apiVersion===p.api_version;
  const options={maxNetworkRetries:0};let raw:unknown;
  switch(p.object_kind){
   case 'payment_intent':raw=await get(()=>sdk.paymentIntents.retrieve(p.object_id,undefined,options));break;
   case 'setup_intent':raw=await get(()=>sdk.setupIntents.retrieve(p.object_id,undefined,options));break;
   case 'checkout.session':raw=await get(()=>sdk.checkout.sessions.retrieve(p.object_id,undefined,options));break;
   case 'subscription':raw=await get(()=>sdk.subscriptions.retrieve(p.object_id,undefined,options));break;
   case 'charge':raw=await get(()=>sdk.charges.retrieve(p.object_id,undefined,options));break;
   case 'refund':raw=await get(()=>sdk.refunds.retrieve(p.object_id,undefined,options));break;
   case 'dispute':raw=await get(()=>sdk.disputes.retrieve(p.object_id,undefined,options));break;
   case 'invoice':raw=await get(()=>sdk.invoices.retrieve(p.object_id,{expand:['payments']},options));break;
  }
  const result=verifyCanonicalNotice(p,raw);
  if(p.object_kind==='refund'||p.object_kind==='dispute'){
   const charge=await get(()=>sdk.charges.retrieve(result.charge_id!,undefined,options));
   if(!api(charge)||charge.object!=='charge'||charge.id!==result.charge_id||charge.livemode!==(p.environment==='live')||typeof charge.customer!=='string'||!/^cus_[A-Za-z0-9_]{1,240}$/.test(charge.customer)||typeof charge.payment_intent!=='string'||!/^pi_[A-Za-z0-9_]{1,240}$/.test(charge.payment_intent)||result.payment_intent_id&&result.payment_intent_id!==charge.payment_intent)throw Error('notice_identity_mismatch');
   result.customer_id=charge.customer;result.payment_intent_id=charge.payment_intent;
  }
  if(p.object_kind==='invoice'){
   const invoice=raw as Stripe.Invoice,subscription=await get(()=>sdk.subscriptions.retrieve(result.subscription_id!,undefined,options));
   if(!api(subscription)||subscription.object!=='subscription'||subscription.id!==result.subscription_id||subscription.customer!==result.customer_id||subscription.livemode!==(p.environment==='live'))throw Error('notice_identity_mismatch');
   // Paid evidence requires the complete single actual payment and same original
   // customer/currency/amount. Partial/out-of-band or missing inventory is unknown.
   // Failed invoice notices retain the canonical subscription status. This
   // does not mark the invoice paid, manufacture a period or release a card.
   if(invoice.status!=='paid'){
    if(!['active','past_due','unpaid','canceled','paused','incomplete','incomplete_expired','trialing'].includes(subscription.status))throw Error('notice_identity_mismatch');
    result.subscription_state=subscription.status;
   }
   const payments=invoice.payments;
   if(invoice.status!=='paid'||invoice.amount_remaining!==0||!invoice.status_transitions.paid_at||!payments||payments.has_more||payments.data.length!==1||payments.data[0].status!=='paid'||payments.data[0].invoice!==invoice.id||payments.data[0].amount_paid!==invoice.amount_paid||payments.data[0].payment.type!=='payment_intent'||typeof payments.data[0].payment.payment_intent!=='string'||result.period_end!*1000<=Date.now())return result;
   const items=subscription.items;
   if(!items||items.has_more||items.data.length!==1||items.data[0].quantity!==1||items.data[0].price.id!==result.price_id)return result;
   const price=await get(()=>sdk.prices.retrieve(result.price_id!,undefined,options)),product=await get(()=>sdk.products.retrieve(result.product_id!,undefined,options));
   if(!api(price)||!api(product)||price.object!=='price'||price.id!==result.price_id||price.product!==result.product_id||price.livemode!==(p.environment==='live')||price.type!=='recurring'||!Number.isSafeInteger(price.unit_amount)||price.unit_amount!<=0||price.unit_amount!==invoice.amount_paid||price.currency!==result.currency||!price.recurring||!['month','year'].includes(price.recurring.interval)||price.recurring.interval_count!==1||!['inclusive','exclusive'].includes(price.tax_behavior??'')||product.object!=='product'||product.id!==result.product_id||'deleted' in product||product.livemode!==(p.environment==='live'))return result;
   const intent=await get(()=>sdk.paymentIntents.retrieve(payments.data[0].payment.payment_intent as string,undefined,options));
   if(!api(intent)||intent.object!=='payment_intent'||intent.id!==payments.data[0].payment.payment_intent||intent.customer!==result.customer_id||intent.livemode!==(p.environment==='live')||intent.status!=='succeeded'||intent.currency!==result.currency||intent.amount_received!==invoice.amount_paid)throw Error('notice_identity_mismatch');
   result.payment_intent_id=intent.id;result.payment_status='succeeded';result.subscription_state=subscription.status;result.unit_amount=price.unit_amount;result.interval=price.recurring.interval;result.interval_count=price.recurring.interval_count;result.quantity=1;result.tax_behavior=price.tax_behavior;
  }
  if(p.original_permit){
   const observation=await originalRead(p.original_permit);
   // The initial signed-object GET and same original journal GET must agree;
   // an unknown/foreign late result cannot be promoted or replace a method.
   if(!(['verified','pending','requires_action'].includes(observation.outcome)||observation.outcome==='declined'&&observation.payment_state==='requires_payment_method'&&observation.safe_error_code==='provider_declined')||observation.object_id!==p.original_permit.object_id||observation.customer_id!==result.customer_id||p.object_kind!=='setup_intent'&&(result.amount!==Number(p.original_permit.parameters.amount_minor)||result.currency!==p.original_permit.parameters.currency)||p.object_kind==='charge'&&observation.charge_id!==p.object_id)throw Error('notice_identity_mismatch');
   result.original_observation=observation;result.original_generation=p.original_permit.lease_generation;result.original_revision=p.original_permit.operation_revision;
  }
  // SQL still must match exact original bindings and current job/lease/source
  // before deriving any owner or inserting paid/nonpaid reconciliation evidence.
  parseNoticePermit(p);return result;
 }catch{return unknownNotice(p);}
}
