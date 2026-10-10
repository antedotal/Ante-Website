// A transient action has exactly the historical seven fields or those fields
// plus the verified original-card confirmation pair. Both account surfaces use
// this parser so purpose/identity/secret/expiry checks cannot drift independently.
export type OriginalActionPurpose='task.short_hold.continue'|'task.long_collection.continue'
type OriginalActionBase={purpose:OriginalActionPurpose;commitment_id:string;commitment_revision:number;provider_intent_id:string;client_secret:string;expires_at:string;return_route_key:'account_payments'}
export type OriginalCardActionTicket=OriginalActionBase&({action_mode?:never;method_id?:never}|{action_mode:'confirm_original_card';method_id:string})
const fields=['purpose','commitment_id','commitment_revision','provider_intent_id','client_secret','expires_at','return_route_key']
export function parseOriginalCardAction(value:unknown,purpose:OriginalActionPurpose,commitment:string,revision:number,now=Date.now()):OriginalCardActionTicket {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Authentication unavailable')
 const v=value as Record<string,unknown>,confirmation=v.action_mode==='confirm_original_card',expected=confirmation?[...fields,'action_mode','method_id']:fields,keys=Object.keys(v)
 if(keys.length!==expected.length||!keys.every(k=>expected.includes(k))||v.purpose!==purpose||v.commitment_id!==commitment||typeof commitment!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(commitment)||v.commitment_revision!==revision||!Number.isSafeInteger(revision)||revision<1||typeof v.provider_intent_id!=='string'||!/^pi_[A-Za-z0-9_]{1,240}$/.test(v.provider_intent_id)||typeof v.client_secret!=='string'||!v.client_secret.startsWith(v.provider_intent_id+'_secret_')||!/^[A-Za-z0-9_-]{1,512}$/.test(v.client_secret)||v.client_secret.length<=v.provider_intent_id.length+8||typeof v.expires_at!=='string'||!Number.isFinite(Date.parse(v.expires_at))||Date.parse(v.expires_at)<=now||v.return_route_key!=='account_payments'||confirmation&&(typeof v.method_id!=='string'||!/^pm_[A-Za-z0-9_]{1,240}$/.test(v.method_id)))throw new Error('Authentication unavailable')
 return {...v} as OriginalCardActionTicket
}
