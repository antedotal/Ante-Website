// Additive fixed owner transport reuses B1's captured bearer/fresh identity gate.
// Dedicated hold/Premium capabilities cannot call an owner or provider job port;
// all actual operation and quota authority stays in the predecessor SQL engines.
import 'server-only'
import { createPaymentSupabase, type PaymentSupabaseConfig, type PaymentLifetime } from '../payments/bridge-v1/supabase/functions/_shared/webPaymentOwnerSupabase'
import { parseFinancialTaskRequest } from '../payments/bridge-v3/scripts/backend/web-payment-task-admission-contract.mjs'
import { parseSubscriptionRequest } from '../payments/bridge-v3/scripts/backend/web-payment-subscription-contract.mjs'
import { exact } from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import {parseCommitmentRequest} from '../payments/owner-review-v1/commitment-server.mjs'
import { boundedProviderRequest } from './bounded-provider-request'
export type ReturnPurpose='hold'|'premium'|'collection'
export type FinancialSupabaseConfig=PaymentSupabaseConfig & {holdSecretCredential?:string;holdSecretBearer?:string;holdBindCredential?:string;holdBindBearer?:string;premiumSecretCredential?:string;premiumSecretBearer?:string;premiumBindCredential?:string;premiumBindBearer?:string;collectionSecretCredential?:string;collectionSecretBearer?:string;collectionBindCredential?:string;collectionBindBearer?:string}
const taskRpcs={quote:'http_quote_my_financial_task_v1',admit:'http_admit_my_financial_task_v1',read:'http_read_my_financial_task_v1',recover:'http_recover_my_financial_task_operation_v1',settings:'http_read_my_financial_task_settings_v1'} as const
const premiumRpcs={'subscription.checkout':'http_checkout_my_premium_subscription_v1','subscription.manage':'http_manage_my_premium_subscription_v1','subscription.read':'http_read_my_premium_subscription_v1','subscription.list':'http_list_my_premium_subscriptions_v1','subscription.recover':'http_recover_my_premium_operation_v1','entitlement.read':'http_read_my_premium_entitlement_v1'} as const
const familyRpcs={collection:{create:'http_prepare_my_long_collection_read_admission_v1',read:'http_read_my_long_collection_read_admission_v1',consume:'http_consume_my_long_collection_return_v1',secret:'http_read_long_collection_return_capability_v1',bind:'http_bind_long_collection_return_v1'},hold:{create:'http_prepare_my_short_hold_read_admission_v1',read:'http_read_my_short_hold_read_admission_v1',consume:'http_consume_my_short_hold_return_v1',secret:'http_read_short_hold_return_capability_v1',bind:'http_bind_short_hold_return_v1'},premium:{create:'http_prepare_my_premium_read_admission_v1',read:'http_read_my_premium_read_admission_v1',consume:'http_consume_my_premium_return_v1',secret:'http_read_premium_return_capability_v1',bind:'http_bind_premium_return_v1'}} as const
// Original SQL read quotas apply to both fresh-child preparation and capsule
// recovery. A fixed error type preserves the route's bounded Retry-After.
export class FinancialRateError extends Error {constructor(readonly retry:number){super('rate_limited')}}
function checkedRead(value:unknown){if(exact(value,['error_code','retry_after_seconds'])&&(value as Record<string,unknown>).error_code==='rate_limited'){const retry=Number((value as Record<string,unknown>).retry_after_seconds);if(!Number.isInteger(retry)||retry<1||retry>60)throw new Error('activation_closed');throw new FinancialRateError(retry)}return value}
const credential=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(v)
const bearer=(v:unknown):v is string=>typeof v==='string'&&v.length<=8199&&/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)
const digest=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
// No string-RPC transport escapes this closure. URLs, payload size, redirects,
// response streaming and deadlines are fixed before credentials leave the host.
export function createFinancialSupabase(config:FinancialSupabaseConfig) {
 const frozen=Object.freeze({...config}),base=createPaymentSupabase(frozen),ready=()=>frozen.enabled===true&&frozen.transportAccepted===true&&base.ready()
 const call=async(name:string,args:Record<string,unknown>,authorization:string,header:string,secret:string,observe:PaymentLifetime,signal?:AbortSignal)=>{
  if(!ready()||!bearer(authorization)||!credential(secret))throw new Error('activation_closed')
  const body=JSON.stringify(args);if(new TextEncoder().encode(body).length>8192)throw new Error('invalid_input')
  const work=boundedProviderRequest(new URL('/rest/v1/rpc/'+name,frozen.projectUrl).href,{method:'POST',headers:{apikey:frozen.publicKey,authorization,'content-type':'application/json',[header]:secret},body},65536,{signal,timeoutMs:frozen.requestTimeoutMs??10000,allowPostgrestSingletonRange:true});observe(work.then(()=>{},()=>{}));const result=await work
  if(!result||result.response.status!==200||!/^application\/json(?:;.*)?$/i.test(result.response.headers.get('content-type')??''))throw new Error('transport_unknown')
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.bytes)) as unknown}catch{throw new Error('transport_unknown')}
 }
 return Object.freeze({ready,
  async owner(request:Request,observe:PaymentLifetime){if(!ready())throw new Error('activation_closed');const authorization=request.headers.get('authorization');if(!bearer(authorization))throw new Error('not_authenticated');const captured=new Request(request.url,{headers:{authorization},signal:request.signal}),owner=await base.owner(captured,observe),run=(name:string,args:Record<string,unknown>)=>call(name,args,authorization,'x-ante-payment-owner-gateway',frozen.gatewayCredential!,observe,request.signal)
   return Object.freeze({ownerId:owner.ownerId,fresh:owner.fresh,
    // Fixed review ports delegate only to the original commitment ledger.
    review:async(action:'read'|'history'|'appeal'|'dispute'|'recover'|'list'|'assets',input:Record<string,unknown>)=>{const ports={list:'http_list_my_review_commitments_v1',assets:'http_list_my_review_evidence_v1',read:'http_read_my_task_commitment_v1',history:'http_list_my_task_commitment_history_v1',appeal:'http_submit_my_task_appeal_v1',dispute:'http_submit_my_payment_dispute_v1',recover:'http_recover_my_commitment_operation_v1'} as const;if(action==='read'?!exact(input,['commitment_id']):action==='history'||action==='assets'?!exact(input,['commitment_id','after']):action==='list'?!exact(input,['after']):false)throw new Error('invalid_input');const id=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);if(['read','history','assets'].includes(action)&&!id(input.commitment_id)||['list','history','assets'].includes(action)&&input.after!==null&&!id(input.after))throw new Error('invalid_input');return run(ports[action],action==='read'?{p_commitment:input.commitment_id}:action==='history'||action==='assets'?{p_commitment:input.commitment_id,p_after:input.after,p_limit:25}:action==='list'?{p_after:input.after,p_limit:25}:{p_request:parseCommitmentRequest(action,input)})},
    // Fixed ordinary notices read exposes no provider facts or effect authority.
    notices:async(after:string|null)=>{if(after!==null&&(typeof after!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(after)))throw new Error('invalid_input');return checkedRead(await run('http_list_my_ordinary_payment_notices_v1',{p_after:after,p_limit:25}))},
    context:()=>run('http_read_my_financial_browser_context_v1',{}),
    settingsWrite:async(input:Record<string,unknown>)=>{if(!exact(input,['easy_cents','medium_cents','hard_cents'])||!Object.values(input).every(v=>Number.isInteger(v)&&Number(v)>=100&&Number(v)<=5000))throw new Error('invalid_input');return run('http_set_my_financial_task_settings_v1',{p_request:input})},
    task:async(action:keyof typeof taskRpcs,input:Record<string,unknown>)=>run(taskRpcs[action],{p_request:parseFinancialTaskRequest(action,input)}),
    premium:async(action:keyof typeof premiumRpcs,input:Record<string,unknown>)=>run(premiumRpcs[action],{p_request:parseSubscriptionRequest(action,input)}),
    // Long progress is a fixed owner-only read; SQL derives its original collection identity.
    collection:async(input:{commitment_id:string;commitment_revision:number})=>run('http_read_my_long_task_collection_v1',{p_request:input}),
    hold:async(action:'read'|'recover',input:{commitment_id:string;commitment_revision:number})=>run('http_read_short_task_hold_v1',{p_action:action,p_request:input}),
    create:async(purpose:ReturnPurpose,input:Record<string,unknown>)=>checkedRead(await run(familyRpcs[purpose].create,{p_request:input})),
    read:async(purpose:ReturnPurpose,input:Record<string,unknown>)=>{await owner.fresh();return checkedRead(await run(familyRpcs[purpose].read,{p_request:input}))},
    consume:async(purpose:ReturnPurpose,input:Record<string,unknown>)=>{await owner.fresh();return run(familyRpcs[purpose].consume,{p_request:input})},
   })
  },
  // Each capability has a separate dedicated bearer/header. No owner, mutation,
  // provider dispatch, final consumption or cross-purpose selector is available.
  premiumDispatchApproval(observe:PaymentLifetime){return Object.freeze({approve(input:Record<string,unknown>){if(!exact(input,['subaction_id','lease_generation','operation_revision','configuration_id','configuration_revision']))throw new Error('invalid_input');return call('http_approve_premium_return_dispatch_v1',{p_request:input},frozen.dispatchBearer!,'x-ante-payment-dispatch',frozen.dispatchCredential!,observe)}})},
  secret(purpose:ReturnPurpose,observe:PaymentLifetime){const auth=purpose==='collection'?frozen.collectionSecretBearer:purpose==='hold'?frozen.holdSecretBearer:frozen.premiumSecretBearer,key=purpose==='collection'?frozen.collectionSecretCredential:purpose==='hold'?frozen.holdSecretCredential:frozen.premiumSecretCredential;return Object.freeze({read(capabilityDigest:string){if(!digest(capabilityDigest))throw new Error('invalid_input');return call(familyRpcs[purpose].secret,{p_request:{capability_digest:capabilityDigest}},auth!,`x-ante-payment-${purpose}-secret-read`,key!,observe)}})},
  bind(purpose:ReturnPurpose,observe:PaymentLifetime){const auth=purpose==='collection'?frozen.collectionBindBearer:purpose==='hold'?frozen.holdBindBearer:frozen.premiumBindBearer,key=purpose==='collection'?frozen.collectionBindCredential:purpose==='hold'?frozen.holdBindCredential:frozen.premiumBindCredential;return Object.freeze({bind(input:Record<string,unknown>){if(!exact(input,['family_id','token_digest','metadata_hash'])||!digest(input.token_digest)||!digest(input.metadata_hash))throw new Error('invalid_input');return call(familyRpcs[purpose].bind,{p_request:input},auth!,`x-ante-payment-${purpose}-capsule-bind`,key!,observe)}})},
 })
}
export type FinancialOwner=Awaited<ReturnType<ReturnType<typeof createFinancialSupabase>['owner']>>
