// Short-hold DTOs retain original business/provider identity; owner inputs never determine money, backing, intent IDs or effects.
import {exact,internalId,providerId} from './web-payment-provider-contract.mjs';
const revision=v=>Number.isInteger(v)&&v>=1&&v<=2147483647;
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const time=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const holdObjectId=v=>typeof v==='string'&&/^pi_[A-Za-z0-9_]{1,240}$/.test(v);
export const HOLD_CONFIGURATION_KEYS='configuration_id revision provider_configuration_id task_configuration_id approval_id approval_hash terms_hash country currency cutoff_seconds processing_buffer_seconds authorization_enabled release_policy expired_policy effective_at expires_at task_created_at original_due_at quote_hash authorization_operation_id authorization_subaction_id continuation_adapter_version'.split(' ');
// An approved cutoff is sampled at original task birth, never made eligible merely by waiting until a long task is near its deadline.
export function validHoldConfiguration(value){
 if(!exact(value,HOLD_CONFIGURATION_KEYS)||!value||value.country!=='AU'||value.currency!=='aud'||value.authorization_enabled!==true||value.release_policy!=='definitive_success_original_intent'||value.expired_policy!=='unsecured_no_reauthorize'||![null,'short_hold_return_v1'].includes(value.continuation_adapter_version)||!revision(value.revision)||!Number.isInteger(value.cutoff_seconds)||value.cutoff_seconds<1||value.cutoff_seconds>259200||!Number.isInteger(value.processing_buffer_seconds)||value.processing_buffer_seconds<1||value.processing_buffer_seconds>86400)return false;
 if(!['configuration_id','provider_configuration_id','task_configuration_id','approval_id','authorization_operation_id','authorization_subaction_id'].every(k=>internalId(value[k]))||!['approval_hash','terms_hash','quote_hash'].every(k=>digest(value[k]))||!['effective_at','expires_at','task_created_at','original_due_at'].every(k=>time(value[k])))return false;
 return Date.parse(value.expires_at)>Date.parse(value.effective_at)&&Date.parse(value.original_due_at)>Date.parse(value.task_created_at)&&Date.parse(value.original_due_at)-Date.parse(value.task_created_at)<=value.cutoff_seconds*1000;
}
// The shared permit parser calls this before credential construction, binding the fixed original manual-authorization parameters and metadata.
export function validateHoldPermit(p){
 const h=p.hold_configuration,creating=p.kind==='authorization.create';
 if(!validHoldConfiguration(h)||p.purpose!=='task.short_hold'||p.object_kind!=='payment_intent'||h.provider_configuration_id!==p.configuration_id||p.parent_action!==(creating?'task.admit':'task.release')||creating&&(p.operation_id!==h.authorization_operation_id||p.subaction_id!==h.authorization_subaction_id)||!exact(p.parameters,creating?['customer','method_id','amount_minor','currency','capture_method','quote_hash','metadata']:['customer','method_id','amount_minor','currency','payment_intent_id','quote_hash','metadata']))throw new TypeError('invalid_permit');
 const v=p.parameters;
 if(!providerId(v.customer)||!String(v.customer).startsWith('cus_')||!providerId(v.method_id)||!String(v.method_id).startsWith('pm_')||typeof v.amount_minor!=='string'||!/^[1-9][0-9]{0,15}$/.test(v.amount_minor)||BigInt(v.amount_minor)>9007199254740991n||v.currency!=='aud'||v.quote_hash!==h.quote_hash||creating&&v.capture_method!=='manual'||!creating&&(!holdObjectId(v.payment_intent_id)||p.object_id!==v.payment_intent_id)||p.plan==='retrieve'&&!holdObjectId(p.object_id)||!exact(v.metadata,['ante_operation','ante_commitment'])||v.metadata.ante_operation!==h.authorization_operation_id||v.metadata.ante_commitment!==p.subject_id)throw new TypeError('invalid_permit');
 return p;
}
export function parseShortHoldRequest(action,value){
 if(!['read','recover','continue'].includes(action)||!exact(value,['commitment_id','commitment_revision'])||!internalId(value.commitment_id)||!revision(value.commitment_revision))throw new TypeError('invalid_input');return structuredClone(value);
}
