// These DTOs validate the fixed authority boundary; SQL independently owns money, task birth, backing and caps.
import {exact,internalId,paymentRequestHash} from './web-payment-provider-contract.mjs';
export {paymentRequestHash};
const uuid=v=>internalId(v)&&v===v.toLowerCase();
const revision=v=>Number.isInteger(v)&&v>=1&&v<=2147483647;
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const time=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const FINANCIAL_TASK_ERRORS=Object.freeze(['invalid_input','not_found','configuration_missing','policy_changed','revision_conflict','payload_conflict','rate_limited','card_unavailable','settings_missing','eligibility_unavailable','cap_reached','backing_pending','funding_unavailable','task_id_used','quote_expired','deadline_expired','started_inputs_frozen']);
// Money comes from the owner settings snapshot and selected approved country/configuration, never quote request fields.
export function parseFinancialTaskRequest(action,value){
 const keys=action==='quote'?['operation_id','task_id','title','details','due_date','difficulty_preset','list_id','verifier_ids','configuration_id','configuration_revision','card_id','card_revision','consent_id','consent_revision','settings_hash','eligibility_revision']:action==='admit'?['operation_id','quote_id','quote_hash','task_revision','eligibility_revision','affirmative']:action==='recover'?['operation_id']:action==='read'?['task_id']:action==='settings'?[]:null;
 if(!keys||!exact(value,keys))throw new TypeError('invalid_input');
 for(const k of keys){if(k.endsWith('_id')&&k!=='list_id'&&!uuid(value[k])||k.endsWith('_revision')&&!revision(value[k])||k.endsWith('_hash')&&!digest(value[k]))throw new TypeError('invalid_input');}
 if(action==='quote'&&(typeof value.title!=='string'||value.title.trim().length<1||new TextEncoder().encode(value.title).length>512||value.details!==null&&(typeof value.details!=='string'||new TextEncoder().encode(value.details).length>4096)||!time(value.due_date)||!['easy','medium','hard'].includes(value.difficulty_preset)||typeof value.list_id!=='string'||value.list_id.length<1||value.list_id.length>128||!Array.isArray(value.verifier_ids)||value.verifier_ids.length<1||value.verifier_ids.length>5||!value.verifier_ids.every(uuid)||new Set(value.verifier_ids).size!==value.verifier_ids.length)||action==='admit'&&value.affirmative!==true)throw new TypeError('invalid_input');
 return structuredClone(value);
}
// Progress is a separately read resource. An immutable quote/admission receipt never turns into a later start receipt.
export function parseFinancialTaskReceipt(value){
 if(!exact(value,['financial_task_contract_version','operation_id','operation_revision','resource_revision','status','result','error_code','retry_after_seconds'])||value.financial_task_contract_version!==1||!['completed','pending','denied','conflict','unknown'].includes(value.status)||value.operation_id!==null&&!uuid(value.operation_id)||value.operation_revision!==null&&!revision(value.operation_revision)||(value.operation_id===null)!==(value.operation_revision===null)||value.resource_revision!==null&&!revision(value.resource_revision)||value.error_code!==null&&!FINANCIAL_TASK_ERRORS.includes(value.error_code)||value.retry_after_seconds!==null&&(!Number.isInteger(value.retry_after_seconds)||value.retry_after_seconds<1||value.retry_after_seconds>60)||(value.error_code==='rate_limited')!==(value.retry_after_seconds!==null)||value.result===null&&(!['denied','conflict','unknown'].includes(value.status)||value.resource_revision!==null))throw new TypeError('invalid_receipt');
 if(value.result!==null){
  const r=value.result,money=v=>typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v)&&BigInt(v)<=9007199254740991n;
  if(exact(r,['quote_id','quote_hash','task_id','task_revision','amount_minor','currency','expires_at','eligibility_revision','snapshot_hash'])){
   if(!uuid(r.quote_id)||!digest(r.quote_hash)||!uuid(r.task_id)||!revision(r.task_revision)||!money(r.amount_minor)||r.currency!=='AUD'||!time(r.expires_at)||!revision(r.eligibility_revision)||!digest(r.snapshot_hash)||value.resource_revision!==r.task_revision)throw new TypeError('invalid_receipt');
  }else if(exact(r,['task_id','task_revision','state','commitment_id','commitment_revision','amount_minor','currency','quote_id','quote_hash','funding_state','started_at'])){
   if(!uuid(r.task_id)||!revision(r.task_revision)||!['draft','payment_pending','active'].includes(r.state)||r.commitment_id!==null&&!uuid(r.commitment_id)||r.commitment_revision!==null&&!revision(r.commitment_revision)||(r.commitment_id===null)!==(r.commitment_revision===null)||!money(r.amount_minor)||r.currency!=='AUD'||!uuid(r.quote_id)||!digest(r.quote_hash)||r.funding_state!==null&&!['authorized','active_unsecured'].includes(r.funding_state)||r.started_at!==null&&!time(r.started_at)||value.resource_revision!==r.task_revision||r.state==='active'&&(r.funding_state===null||r.started_at===null||r.commitment_id===null)||r.state!=='active'&&(r.funding_state!==null||r.started_at!==null)||r.state==='draft'&&r.commitment_id!==null||r.state==='payment_pending'&&r.commitment_id===null)throw new TypeError('invalid_receipt');
  }else if(exact(r,['settings','settings_hash'])){
   if(!digest(r.settings_hash)||!exact(r.settings,['easy_cents','medium_cents','hard_cents','updated_at'])||!['easy_cents','medium_cents','hard_cents'].every(k=>Number.isInteger(r.settings[k])&&r.settings[k]>=100&&r.settings[k]<=5000)||typeof r.settings.updated_at!=='string'||!Number.isFinite(Date.parse(r.settings.updated_at))||value.resource_revision!==null)throw new TypeError('invalid_receipt');
  }else throw new TypeError('invalid_receipt');
 }
 return structuredClone(value);
}
