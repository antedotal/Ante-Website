// Source-owned notice decoding and safe original-object extraction are read-only.
// Hints/status never select an owner or create billing authority. Protected SQL
// must correlate these facts with original canonical customer/object ancestry.
import {parsePermitJoint,paymentRequestHash,observationJoint,type Configuration,type Permit,type Observation} from './webPaymentProviderContractJoint.ts';
import type Stripe from 'stripe';
import {NOTICE_SOURCE_HASH} from './webPaymentJointNoticeIdentity.ts';
import {noticeEvents} from './webPaymentNoticeEvents.ts';
import {exact,internalId,providerId} from '../../../scripts/backend/web-payment-provider-contract.mjs';
export type NoticeKind='payment_intent'|'setup_intent'|'checkout.session'|'invoice'|'subscription'|'charge'|'dispute'|'refund';
const prefixes=Object.freeze({payment_intent:'pi_',setup_intent:'seti_', 'checkout.session':'cs_',invoice:'in_',subscription:'sub_',charge:'ch_',dispute:'dp_',refund:'re_'});
export type NoticePermit={
 original_permit:Permit|null;
 kind:'webhook.retrieve';plan:'retrieve';retrieval_job_id:string;event_receipt_id:string;event_id:string;event_type:string;
 object_kind:NoticeKind;object_id:string;provider_account:string;environment:'test'|'live';api_version:'2026-09-30.endive';
 configuration:Configuration;configuration_hash:string;source_hash:string;operational_approval:{approval_id:string;approval_hash:string;effective_at:string;expires_at:string};
 lease_generation:number;lease_expires_at:string;operation_revision:number;
};
export type CanonicalNotice={original_generation:number|null;original_revision:number|null;original_observation:Observation|null;notice_version:1;retrieval_job_id:string;event_receipt_id:string;lease_generation:number;operation_revision:number;
 outcome:'verified'|'unknown';object_kind:NoticeKind;object_id:string;provider_account:string;environment:'test'|'live';api_version:string;
 customer_id:string|null;subscription_id:string|null;payment_intent_id:string|null;charge_id:string|null;invoice_id:string|null;
 currency:string|null;amount:number|null;state:string|null;period_start:number|null;period_end:number|null;price_id:string|null;product_id:string|null;
 request_id:string|null;payment_status:string|null;subscription_state:string|null;unit_amount:number|null;interval:string|null;interval_count:number|null;quantity:number|null;tax_behavior:string|null;
};
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),revision=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<=2147483647;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
// The complete original row is retained for immutable provenance, while only
// the distinct operational approval permits this bounded read after withdrawal.
// No arbitrary property or alternate SDK/provisioning identity reaches credentials.
function configuration(value:unknown):value is Configuration{
 const keys='configuration_id revision task7_configuration_id approval_id approval_hash provider_account environment sandbox_id credential_reference provisioning_hash api_version sdk_version adapter_version policy_id policy_version policy_hash method_configuration dispatch_enabled fixture_only default_policy removal_policy allow_default_removal allow_last_card_removal retention_seconds lease_seconds continuation_seconds effective_at expires_at'.split(' ');
 if(!exact(value,keys))return false;const c=value as Configuration;
 return ['configuration_id','task7_configuration_id','approval_id','policy_id'].every(k=>internalId(c[k as keyof Configuration]))&&['approval_hash','provisioning_hash','policy_hash'].every(k=>digest(c[k as keyof Configuration]))&&revision(c.revision)&&['provider_account','sandbox_id','credential_reference','method_configuration','policy_version'].every(k=>providerId(c[k as keyof Configuration]))&&c.adapter_version==='provider-v1'&&typeof c.dispatch_enabled==='boolean'&&typeof c.fixture_only==='boolean'&&[null,'invoice','internal'].includes(c.default_policy)&&[null,'block_dependencies'].includes(c.removal_policy)&&[null,true,false].includes(c.allow_default_removal)&&[null,true,false].includes(c.allow_last_card_removal)&&Number.isInteger(c.retention_seconds)&&c.retention_seconds>0&&c.retention_seconds<86400&&Number.isInteger(c.lease_seconds)&&c.lease_seconds>0&&c.lease_seconds<=300&&Number.isInteger(c.continuation_seconds)&&c.continuation_seconds>0&&c.continuation_seconds<=300&&date(c.effective_at)&&date(c.expires_at)&&Date.parse(c.effective_at)<Date.parse(c.expires_at);
}
export function parseNoticePermit(value:unknown,now=Date.now()):NoticePermit{
 const keys='original_permit kind plan retrieval_job_id event_receipt_id event_id event_type object_kind object_id provider_account environment api_version configuration configuration_hash source_hash operational_approval lease_generation lease_expires_at operation_revision'.split(' ');
 if(!exact(value,keys))throw Error('invalid_notice_permit');const p=value as NoticePermit,c=p.configuration,a=p.operational_approval;
 if(p.kind!=='webhook.retrieve'||p.plan!=='retrieve'||!internalId(p.retrieval_job_id)||!internalId(p.event_receipt_id)||!/^evt_[A-Za-z0-9_]{1,240}$/.test(p.event_id)||!Object.hasOwn(noticeEvents,p.event_type)||noticeEvents[p.event_type]?.[0]!==p.object_kind||!Object.hasOwn(prefixes,p.object_kind)||!new RegExp('^'+prefixes[p.object_kind]+'[A-Za-z0-9_]{1,240}$').test(p.object_id)||!/^acct_[A-Za-z0-9_]{1,240}$/.test(p.provider_account)||!['test','live'].includes(p.environment)||p.api_version!=='2026-09-30.endive'||p.source_hash!==NOTICE_SOURCE_HASH||!digest(p.configuration_hash)||!revision(p.lease_generation)||!revision(p.operation_revision)||!date(p.lease_expires_at)||Date.parse(p.lease_expires_at)<=now||Date.parse(p.lease_expires_at)>now+30000||!exact(a,['approval_id','approval_hash','effective_at','expires_at'])||!internalId(a.approval_id)||!digest(a.approval_hash)||!date(a.effective_at)||!date(a.expires_at)||Date.parse(a.effective_at)>now||Date.parse(a.expires_at)<=now||Date.parse(p.lease_expires_at)>Date.parse(a.expires_at)||!configuration(c)||c.provider_account!==p.provider_account||c.environment!==p.environment||c.api_version!==p.api_version||c.sdk_version!=='23.0.0'||!internalId(c.configuration_id)||!digest(c.provisioning_hash)||!c.credential_reference)throw Error('invalid_notice_permit');
 if(p.original_permit!==null)validateOriginalRead(p,p.original_permit,now);
 return structuredClone(p);
}
const objectId=(value:unknown,prefix:string):string|null=>typeof value==='string'&&new RegExp('^'+prefix+'[A-Za-z0-9_]{1,240}$').test(value)?value:null;
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=9999999999999;
// Unknown acknowledgment intentionally carries no canonical customer/evidence.
export function unknownNotice(p:NoticePermit):CanonicalNotice{return {original_generation:null,original_revision:null,original_observation:null,notice_version:1,retrieval_job_id:p.retrieval_job_id,event_receipt_id:p.event_receipt_id,lease_generation:p.lease_generation,operation_revision:p.operation_revision,outcome:'unknown',object_kind:p.object_kind,object_id:p.object_id,provider_account:p.provider_account,environment:p.environment,api_version:p.api_version,customer_id:null,subscription_id:null,payment_intent_id:null,charge_id:null,invoice_id:null,currency:null,amount:null,state:null,period_start:null,period_end:null,price_id:null,product_id:null,request_id:null,payment_status:null,subscription_state:null,unit_amount:null,interval:null,interval_count:null,quantity:null,tax_behavior:null};}
export function verifyCanonicalNotice(p:NoticePermit,value:unknown):CanonicalNotice{
 parseNoticePermit(p);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('notice_identity_mismatch');const r=value as Record<string,unknown>,last=r.lastResponse as {apiVersion?:string;requestId?:string}|undefined;
 if(r.deleted||r.object!==p.object_kind||r.id!==p.object_id||r.livemode!==(p.environment==='live')||last?.apiVersion!==p.api_version)throw Error('notice_identity_mismatch');
 const result=unknownNotice(p);result.outcome='verified';result.request_id=providerId(last?.requestId)?last!.requestId!:null;
 if(r.customer!=null){result.customer_id=objectId(r.customer,'cus_');if(!result.customer_id)throw Error('notice_identity_mismatch');}
 if(r.currency!=null){if(typeof r.currency!=='string'||!/^[a-z]{3}$/.test(r.currency))throw Error('notice_identity_mismatch');result.currency=r.currency;}
 if(r.amount!=null){if(!integer(r.amount))throw Error('notice_identity_mismatch');result.amount=r.amount;}
 if(r.status!=null){if(typeof r.status!=='string'||r.status.length>64)throw Error('notice_identity_mismatch');result.state=r.status;}
 if(p.object_kind==='checkout.session'){if(r.mode!=='subscription')throw Error('notice_identity_mismatch');result.subscription_id=r.subscription===null?null:objectId(r.subscription,'sub_');if(r.subscription!==null&&!result.subscription_id)throw Error('notice_identity_mismatch');}
 if(p.object_kind==='subscription'){
  // Current provider status is a nonpaid fact only. The protected original
  // subscription/customer/account binding still decides ownership in SQL.
  if(!result.customer_id||!['active','past_due','unpaid','canceled','paused','incomplete','incomplete_expired','trialing'].includes(String(r.status))||typeof r.cancel_at_period_end!=='boolean')throw Error('notice_identity_mismatch');
  result.subscription_id=p.object_id;result.subscription_state=String(r.status);
  result.state=r.cancel_at_period_end?'cancel_scheduled':String(r.status);
 }
 if(p.object_kind==='charge'){result.charge_id=p.object_id;result.payment_intent_id=objectId(r.payment_intent,'pi_');}
 if(p.object_kind==='refund'||p.object_kind==='dispute'){result.charge_id=objectId(r.charge,'ch_');result.payment_intent_id=r.payment_intent==null?null:objectId(r.payment_intent,'pi_');if(!result.charge_id)throw Error('notice_identity_mismatch');}
 if(p.object_kind==='payment_intent')result.payment_intent_id=p.object_id;
 if(p.object_kind==='invoice'){
  result.invoice_id=p.object_id;
  const parent=r.parent as {type?:string;subscription_details?:{subscription?:unknown}}|null,lines=r.lines as {has_more?:boolean;data?:Record<string,unknown>[]}|undefined;
  result.subscription_id=parent?.type==='subscription_details'?objectId(parent.subscription_details?.subscription,'sub_'):null;
  if(!result.customer_id||!result.subscription_id||!lines||lines.has_more!==false||!Array.isArray(lines.data)||lines.data.length!==1)throw Error('notice_identity_mismatch');
  const line=lines.data[0],pricing=line.pricing as {type?:string;price_details?:{price?:unknown;product?:unknown}}|null,period=line.period as {start?:unknown;end?:unknown}|undefined;
  result.price_id=pricing?.type==='price_details'?objectId(pricing.price_details?.price,'price_'):null;result.product_id=objectId(pricing?.price_details?.product,'prod_');
  const lineParent=line.parent as {type?:string;subscription_item_details?:{subscription?:unknown;proration?:unknown}}|null;
  if(!result.price_id||!result.product_id||line.quantity!==1||lineParent?.type!=='subscription_item_details'||lineParent.subscription_item_details?.subscription!==result.subscription_id||lineParent.subscription_item_details?.proration!==false||!period||!integer(period.start)||!integer(period.end)||period.end<=period.start||!integer(r.amount_paid))throw Error('notice_identity_mismatch');
  result.period_start=period.start;result.period_end=period.end;result.amount=r.amount_paid;
 }
 return result;
}
// Decode only redacted fixed facts and the exact original job tuple. Delayed
// acknowledgments may be recorded as historical facts by SQL; this decoder does
// not renew a lease or turn a locally valid response into reconciliation rights.
export function parseCanonicalNotice(p:NoticePermit,value:unknown):CanonicalNotice{
 const base=unknownNotice(p),keys=Object.keys(base);
 if(!exact(value,keys))throw Error('invalid_notice_observation');const o=value as CanonicalNotice;
 for(const key of ['notice_version','retrieval_job_id','event_receipt_id','lease_generation','operation_revision','object_kind','object_id','provider_account','environment','api_version'] as const)if(o[key]!==base[key])throw Error('invalid_notice_observation');
 if(!['verified','unknown'].includes(o.outcome))throw Error('invalid_notice_observation');
 const refs={customer_id:'cus_',subscription_id:'sub_',payment_intent_id:'pi_',charge_id:'ch_',invoice_id:'in_',price_id:'price_',product_id:'prod_'};
 for(const[key,prefix]of Object.entries(refs)){const v=o[key as keyof CanonicalNotice];if(v!==null&&!objectId(v,prefix))throw Error('invalid_notice_observation');}
 for(const key of ['amount','period_start','period_end','unit_amount','interval_count','quantity'] as const)if(o[key]!==null&&!integer(o[key]))throw Error('invalid_notice_observation');
 for(const key of ['state','payment_status','subscription_state','interval','tax_behavior'] as const)if(o[key]!==null&&(typeof o[key]!=='string'||!/^[a-z_]{1,64}$/.test(o[key]!)))throw Error('invalid_notice_observation');
 if(o.currency!==null&&!/^[a-z]{3}$/.test(o.currency)||o.request_id!==null&&!providerId(o.request_id))throw Error('invalid_notice_observation');
 if(o.original_observation===null&&(o.original_generation!==null||o.original_revision!==null))throw Error('invalid_notice_observation');if(o.original_observation!==null){if(!p.original_permit||o.original_generation!==p.original_permit.lease_generation||o.original_revision!==p.original_permit.operation_revision)throw Error('invalid_notice_observation');const original=p.original_permit,shape=observationJoint(original,'unknown');if(!exact(o.original_observation,Object.keys(shape)))throw Error('invalid_notice_observation');for(const key of ['kind','provider_account','sandbox_id','configuration_id','configuration_hash','operation_id','subject_id','parameter_hash'] as const)if(o.original_observation[key]!==shape[key])throw Error('invalid_notice_observation');if(o.original_observation.object_id!==original.object_id||o.original_observation.customer_id!==o.customer_id)throw Error('invalid_notice_observation');}
 if(o.outcome==='unknown'&&keys.some(key=>base[key as keyof CanonicalNotice]===null&&o[key as keyof CanonicalNotice]!==null))throw Error('invalid_notice_observation');
 return structuredClone(o);
}

// Fixed read stage guard runs before credentials and around every original GET.
// No method/stage/URL capability is accepted from event hints or an SDK caller.
export type OwnedOriginalSdk=Stripe;
export function validateOriginalRead(notice:NoticePermit,value:unknown,now=Date.now()):Permit{
 const p=parsePermitJoint(value);if(p.plan!=='retrieve'||!['setup.retrieve','authorization.create','collection.create'].includes(p.kind)||!p.object_id||p.configuration_hash!==paymentRequestHash(notice.configuration)||p.configuration_id!==notice.configuration.configuration_id||p.configuration.provider_account!==notice.provider_account||p.configuration.environment!==notice.environment||p.configuration.api_version!==notice.api_version||now>=Date.parse(p.lease_expires_at)||now>=Date.parse(notice.lease_expires_at)||now<Date.parse(p.configuration.effective_at)||now>=Date.parse(p.configuration.expires_at))throw Error('invalid_original_notice_read');
 if(notice.object_kind==='setup_intent'){if(p.kind!=='setup.retrieve'||p.object_id!==notice.object_id||p.parameters.setup_id!==notice.object_id)throw Error('invalid_original_notice_read');}else if(!['payment_intent','charge'].includes(notice.object_kind)||!['authorization.create','collection.create'].includes(p.kind)||notice.object_kind==='payment_intent'&&p.object_id!==notice.object_id)throw Error('invalid_original_notice_read');
 return p;
}
