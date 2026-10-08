// Owner routes ACK fixed server-owned intentions before mutations, then execute
// only their stored originals. Browser inputs cannot choose operation/provider
// IDs, amounts, commercial configuration or the original return capsule lineage.
// Admission echoes a displayed quote identity only to compare with its original;
// it cannot select another quote or supply financial snapshot values.
import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { trustedAccountOrigin } from './account-request'
import { admitAccountVisitor } from './callback-admission'
import { verifyProfilePhotoSession } from './profile-photo-session'
import { withVerifiedCookies } from './account-session'
import { boundedPaymentBody, paymentId } from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import { canonicalRequest, exact } from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import { parseFinancialTaskRequest } from '../payments/bridge-v3/scripts/backend/web-payment-task-admission-contract.mjs'
import { financialContext, financialReceipt, type FinancialAction, type Quote, type TaskProgress, type Subscription } from '../payments/financial-ui-model'
import { singlePaymentCookie } from './payment-cookies'
import { configuredFinancialWebsite, type FinancialWebsiteBindings } from './financial-bridge'
import { encodeFinancialFamily, decodeFinancialFamily, financialBrowserDigest, financialCookieNames, financialReturnNames, installFinancialFamily, installFinancialReturn, newFinancialIntent, type FinancialIntent, type FinancialPurpose } from './financial-cookies'
import { FinancialRateError } from './financial-transport'
import { continueFinancialReturn, issueFinancialReturn } from './financial-return'
import { privatePaymentResponse, paymentFailure, paymentMethodDenied } from './account-card-payments'
const readPaths=new Set(['context','intent','original','current','settings','hold','review'])
const writePaths=new Set(['prepare','execute','return/issue','return/continue','defaults','subscriptions'])
const draftKeys=['title','details','due_date','difficulty_preset','list_id','verifier_ids','funding_mode']
const admitSelectionKeys=['quote_id','quote_hash','task_revision','affirmative']
// Semantic retry comparison omits server-selected fields. A changed current
// policy/default cannot rewrite the already ACKed original quote or purchase.
function semantics(intent:FinancialIntent){if(intent.action==='task.quote')return Object.fromEntries(draftKeys.map(k=>[k,intent.input[k]]));if(intent.action==='task.admit')return Object.fromEntries(admitSelectionKeys.map(k=>[k,intent.input[k]]));if(intent.action==='premium.checkout')return {plan_key:intent.input.plan_key};return {subscription_id:intent.input.subscription_id}}
function validateSemantics(action:FinancialAction,input:Record<string,unknown>){
 if(action==='task.quote'){if(!exact(input,draftKeys)||!['short_authorization','long_unsecured'].includes(String(input.funding_mode)))throw new Error('invalid_input');const {funding_mode,...draft}=input;void funding_mode;parseFinancialTaskRequest('quote',{...draft,operation_id:'00000000-0000-0000-0000-000000000001',task_id:'00000000-0000-0000-0000-000000000001',configuration_id:'00000000-0000-0000-0000-000000000001',configuration_revision:1,card_id:'00000000-0000-0000-0000-000000000001',card_revision:1,consent_id:'00000000-0000-0000-0000-000000000001',consent_revision:1,settings_hash:'0'.repeat(64),eligibility_revision:1});if(new TextEncoder().encode(String(input.title)).length>256||typeof input.details==='string'&&new TextEncoder().encode(input.details).length>1200)throw new Error('invalid_input')}
 else if(action==='task.admit'){
  // Reuse the original admission grammar for the echoed selection; eligibility
  // is a validation placeholder here and is later derived from the owner receipt.
  if(!exact(input,admitSelectionKeys))throw new Error('invalid_input');parseFinancialTaskRequest('admit',{...input,operation_id:'00000000-0000-0000-0000-000000000001',eligibility_revision:1})
 }
 else if(action==='premium.checkout'){if(!exact(input,['plan_key'])||!['monthly','annual'].includes(String(input.plan_key)))throw new Error('invalid_input')}
 else if(!exact(input,['subscription_id'])||!paymentId(input.subscription_id))throw new Error('invalid_input')
}
function exposed(intent:FinancialIntent|null){return intent?{request_id:intent.requestId,operation_id:intent.operationId,action:intent.action}:null}
function checkedReceipt(action:Parameters<typeof financialReceipt>[0],value:unknown,operation?:string){const receipt=financialReceipt(action,value);if(receipt.error_code==='rate_limited')throw new FinancialRateError(receipt.retry_after_seconds!);if(operation&&receipt.operation_id!==operation)throw new Error('operation_pending');return receipt}
// Context selections retain the original read quota and Retry-After even when
// they are read as part of prepare; rate exhaustion never allocates a family.
function checkedContext(value:unknown){if(exact(value,['policies','task','premium','error_code','retry_after_seconds'])&&(value as Record<string,unknown>).error_code==='rate_limited'){const retry=Number((value as Record<string,unknown>).retry_after_seconds);if(!Number.isInteger(retry)||retry<1||retry>60)throw new Error('activation_closed');throw new FinancialRateError(retry)}return financialContext(value)}
export function createAccountFinancialHandler(resolve:()=>FinancialWebsiteBindings|null=configuredFinancialWebsite){return async(request:NextRequest,purpose:FinancialPurpose,path:string)=>{
 const bindings=resolve();if(!bindings?.enabled)return paymentFailure();const reading=request.method==='GET';if(reading?!readPaths.has(path):request.method!=='POST'||!writePaths.has(path))return paymentMethodDenied(readPaths.has(path)?'GET':'POST')
 let origin:string;try{origin=accountConfig().siteOrigin}catch{return paymentFailure()}
 if(!trustedAccountOrigin(request,origin,!reading))return paymentFailure(403,'invalid_origin');if(request.nextUrl.search)return paymentFailure(400,'invalid_input')
 let input:Record<string,unknown>={};const jobs:Promise<void>[]=[];const observe=(p:Promise<void>)=>jobs.push(p)
 try{if(!reading)input=await boundedPaymentBody(request,observe);if(!reading&&(path==='prepare'?!(exact(input,['request_id','action','input'])&&paymentId(input.request_id)&&typeof input.action==='string'&&input.action.startsWith(purpose==='task'?'task.':'premium.')&&['task.quote','task.admit','premium.checkout','premium.cancel'].includes(input.action)&&input.input&&typeof input.input==='object'&&!Array.isArray(input.input)):path==='execute'?!(exact(input,['request_id','expected_operation_id'])&&paymentId(input.request_id)&&paymentId(input.expected_operation_id)):path==='subscriptions'?!(purpose==='premium'&&exact(input,['cursor'])&&(input.cursor===null||typeof input.cursor==='string'&&/^[0-9a-f]{32}$/.test(input.cursor))):path==='defaults'?!(purpose==='task'&&exact(input,['easy_cents','medium_cents','hard_cents'])&&Object.values(input).every(v=>Number.isInteger(v)&&Number(v)>=100&&Number(v)<=5000)):Object.keys(input).length!==0))throw new Error();if(path==='prepare')validateSemantics(input.action as FinancialAction,input.input as Record<string,unknown>)}catch{await Promise.all(jobs);return paymentFailure(400,'invalid_input')}
 const admission=await admitAccountVisitor(request);if(admission)return privatePaymentResponse(admission);const identity=await verifyProfilePhotoSession(request);if(identity.kind==='failed')return paymentFailure(identity.status,identity.status===401?'not_authenticated':'activation_closed');const {session}=identity
 if(request.headers.get('X-Ante-Payment-Owner')!==session.ownerId)return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional)
 let response:NextResponse
 try{
  let family=decodeFinancialFamily(singlePaymentCookie(request,financialCookieNames[purpose]),bindings.cookieKeys[purpose],purpose,session.ownerId)
  const owner=await bindings.services.owner(new Request(origin+'/v1/financial/'+purpose,{headers:{authorization:'Bearer '+session.token},signal:request.signal}),observe);if(owner.ownerId!==session.ownerId)throw new Error('browser_lineage_required')
  const original=async(intent:FinancialIntent)=>checkedReceipt(intent.action,intent.action.startsWith('task.')?await owner.task('recover',{operation_id:intent.operationId}):await owner.premium('subscription.recover',{operation_id:intent.operationId}),intent.operationId)
  const terminal=async(intent:FinancialIntent)=>{const r=await original(intent);if(r.status==='denied')return true;if(intent.action==='task.quote')return r.status==='completed';if(intent.action==='task.admit'){const task=checkedReceipt('task.read',await owner.task('read',{task_id:family!.primary.input.task_id}));return task.result?.state==='active'}if(intent.action==='premium.cancel')return r.status==='completed';const sub=r.result as Subscription|null;if(!sub)return false;const current=checkedReceipt('premium.read',await owner.premium('subscription.read',{subscription_id:sub.subscription_id}));return ['active','cancel_scheduled','canceled'].includes(String(current.result?.state))}
  if(path==='defaults'){const value=await owner.settingsWrite(input);if(exact(value,['ok','error','retry_after_seconds'])&&(value as Record<string,unknown>).error==='rate_limited'){const retry=Number((value as Record<string,unknown>).retry_after_seconds);if(!Number.isInteger(retry)||retry<1||retry>60)throw new Error('activation_closed');throw new FinancialRateError(retry)}if(!exact(value,['ok','presets'])||(value as Record<string,unknown>).ok!==true)throw new Error('activation_closed');const presets=(value as Record<string,unknown>).presets;if(!exact(presets,['currency','easy_cents','medium_cents','hard_cents','updated_at']))throw new Error('activation_closed');const p=presets as Record<string,unknown>;if(p.currency!=='AUD'||!['easy_cents','medium_cents','hard_cents'].every(k=>Number.isInteger(p[k])&&Number(p[k])>=100&&Number(p[k])<=5000)||typeof p.updated_at!=='string'||!Number.isFinite(Date.parse(p.updated_at)))throw new Error('activation_closed');response=NextResponse.json(value)}
  else if(path==='intent')response=NextResponse.json({primary:exposed(family?.primary??null),secondary:exposed(family?.secondary??null)})
  else if(path==='context')response=NextResponse.json(checkedContext(await owner.context()))
  else if(path==='prepare'){
   const action=input.action as FinancialAction,fields=input.input as Record<string,unknown>,secondary=action==='task.admit'||action==='premium.cancel'&&family?.primary.action==='premium.checkout',prior=secondary?family?.secondary:family?.primary
   if(prior&&prior.requestId===input.request_id){if(prior.action!==action||canonicalRequest(semantics(prior))!==canonicalRequest(fields))throw new Error('payload_conflict');response=NextResponse.json(exposed(prior));installFinancialFamily(response,family!,bindings.cookieKeys[purpose],purpose)}
   else{
    if(prior&&!await terminal(prior)||!secondary&&family?.secondary&&!await terminal(family.secondary))throw new Error('operation_pending')
    let stored:Record<string,unknown>
    if(action==='task.quote'){
     if(!exact(fields,draftKeys))throw new Error('invalid_input');const context=checkedContext(await owner.context()),selection=context.task.selections.find(s=>s.funding_mode===fields.funding_mode);if(!context.task.available||!selection||!context.task.lists.some(l=>l.list_id===fields.list_id)||!Array.isArray(fields.verifier_ids)||fields.verifier_ids.some(id=>!context.task.verifiers.some(f=>f.verifier_id===id)))throw new Error('configuration_missing')
     const taskId=randomUUID(),{funding_mode,...draft}=fields;stored={...parseFinancialTaskRequest('quote',{...draft,...selection.selection,task_id:taskId,operation_id:'00000000-0000-0000-0000-000000000001'}),funding_mode};delete stored.operation_id
     if(typeof stored.details==='string'&&new TextEncoder().encode(stored.details).length>1200||new TextEncoder().encode(String(stored.title)).length>256)throw new Error('invalid_input')
    }else if(action==='task.admit'){
     if(family?.primary.action!=='task.quote')throw new Error('invalid_input');const receipt=await original(family.primary),quote=receipt.result as Quote|null;if(receipt.status!=='completed'||!quote||!exact(quote,['quote_id','quote_hash','task_id','task_revision','amount_minor','currency','expires_at','eligibility_revision','snapshot_hash'])||quote.task_id!==family.primary.input.task_id)throw new Error('operation_pending');
     // A second tab can replace the shared quote cookie without a local render.
     // Reject its different original before allocating an admission; the echoed
     // identity proves which quote was affirmed, never its money or eligibility.
     if(fields.quote_id!==quote.quote_id||fields.quote_hash!==quote.quote_hash||fields.task_revision!==quote.task_revision)throw new Error('payload_conflict');stored={quote_id:quote.quote_id,quote_hash:quote.quote_hash,task_revision:quote.task_revision,eligibility_revision:quote.eligibility_revision,affirmative:true}
    }else if(action==='premium.checkout'){
     if(!exact(fields,['plan_key']))throw new Error('invalid_input');const context=checkedContext(await owner.context()),plan=context.premium.plans.find(p=>p.plan_key===fields.plan_key);if(!context.premium.available||!plan)throw new Error('configuration_missing');stored={...plan.selection,plan_key:plan.plan_key}
    }else{
     if(!exact(fields,['subscription_id'])||!paymentId(fields.subscription_id))throw new Error('invalid_input');const sub=checkedReceipt('premium.read',await owner.premium('subscription.read',{subscription_id:fields.subscription_id})).result as Subscription|null,entitlement=checkedReceipt('premium.entitlement',await owner.premium('entitlement.read',{})).result;if(!sub||!entitlement)throw new Error('operation_pending');stored={subscription_id:sub.subscription_id,subscription_revision:sub.revision,entitlement_revision:entitlement.revision,action:'cancel_at_period_end'}
    }
    const prepared=newFinancialIntent(session.ownerId,String(input.request_id),action,stored);if(secondary){if(!family)throw new Error('browser_lineage_required');prepared.expiresAt=family.primary.expiresAt;family={...family,secondary:prepared}}else {family={primary:prepared,secondary:null};if(action==='task.quote'){
     // Before ACK, reserve the maximum fixed admit child shape in the same
     // bounded cookie. Original details cannot strand the later confirmation.
     const child={...prepared,action:'task.admit' as const,input:{quote_id:prepared.operationId,quote_hash:'0'.repeat(64),task_revision:2147483647,eligibility_revision:2147483647,affirmative:true}};encodeFinancialFamily({primary:prepared,secondary:child},bindings.cookieKeys[purpose],purpose)
    }}response=NextResponse.json(exposed(prepared));installFinancialFamily(response,family,bindings.cookieKeys[purpose],purpose)
   }
  }else if(path==='execute'){
   const intent=[family?.primary,family?.secondary].find(i=>i&&i.requestId===input.request_id&&i.operationId===input.expected_operation_id);if(!intent)throw new Error('browser_lineage_required');const {funding_mode,...fields}=intent.input;void funding_mode;const value=intent.action.startsWith('task.')?await owner.task(intent.action==='task.quote'?'quote':'admit',{...fields,operation_id:intent.operationId}):await owner.premium(intent.action==='premium.checkout'?'subscription.checkout':'subscription.manage',{...fields,operation_id:intent.operationId});response=NextResponse.json(checkedReceipt(intent.action,value,intent.operationId))
  }else if(path==='current'&&purpose==='premium')response=NextResponse.json({subscriptions:checkedReceipt('premium.list',await owner.premium('subscription.list',{limit:50,cursor:null})),entitlement:checkedReceipt('premium.entitlement',await owner.premium('entitlement.read',{}))})
  else if(path==='subscriptions'){if(purpose!=='premium')throw new Error('invalid_input');response=NextResponse.json(checkedReceipt('premium.list',await owner.premium('subscription.list',{limit:50,cursor:input.cursor})))}
  else if(path==='review'){if(purpose!=='task'||family?.primary.action!=='task.quote')throw new Error('browser_lineage_required');response=NextResponse.json({task_id:family.primary.input.task_id,...semantics(family.primary)})}
  else if(path==='settings'){if(purpose!=='task')throw new Error('invalid_input');response=NextResponse.json(checkedReceipt('task.settings',await owner.task('settings',{})))}
  else{
   if(!family)throw new Error('browser_lineage_required');const intent=family.secondary??family.primary
   if(path==='original')response=NextResponse.json({primary:await original(family.primary),secondary:family.secondary?await original(family.secondary):null})
   else if(purpose==='task'){
    const current=checkedReceipt('task.read',await owner.task('read',{task_id:family.primary.input.task_id})),task=current.result as TaskProgress|null
    if(path==='current')response=NextResponse.json(current)
    else{if(!task?.commitment_id||!task.commitment_revision||family.secondary?.action!=='task.admit')throw new Error('operation_pending');if(path==='hold')response=NextResponse.json(await owner.hold('read',{commitment_id:task.commitment_id,commitment_revision:task.commitment_revision}));else response=await returned('hold',family.secondary,{commitment_id:task.commitment_id,commitment_revision:task.commitment_revision})}
   }else{
    {if(family.primary.action!=='premium.checkout'||path==='hold')throw new Error('browser_lineage_required');const receipt=await original(family.primary),originalSub=receipt.result as Subscription|null;if(!originalSub)throw new Error('operation_pending');const sub=checkedReceipt('premium.read',await owner.premium('subscription.read',{subscription_id:originalSub.subscription_id})).result as Subscription|null;if(!sub)throw new Error('operation_pending');response=await returned('premium',family.primary,{subscription_id:sub.subscription_id,subscription_revision:sub.revision})}
   }
   void intent
  }
  // The browser frame is installed only after protected issue ACK and final
  // one-use continuation. Trusted lineage always comes from the original cookie.
  async function returned(returnPurpose:'hold'|'premium',intent:FinancialIntent,fields:Record<string,unknown>){const sink=NextResponse.json({}),lineage={ownerId:session.ownerId,operationId:intent.operationId,browserDigest:financialBrowserDigest(intent,purpose),returnAdmissionId:intent.admissionId,capsule:singlePaymentCookie(request,financialReturnNames[returnPurpose])??undefined,install:(token:string,expiry:string)=>installFinancialReturn(sink,returnPurpose,token,expiry)},value=path==='return/issue'?await issueFinancialReturn(bindings!,owner,returnPurpose,fields,lineage,observe):await continueFinancialReturn(bindings!,owner,returnPurpose,lineage,observe),out=NextResponse.json(value);for(const cookie of sink.headers.getSetCookie())out.headers.append('Set-Cookie',cookie);return out}
 }catch(error){const code=error instanceof Error&&['invalid_input','payload_conflict','operation_pending','browser_lineage_required','configuration_missing','not_authenticated'].includes(error.message)?error.message:'activation_closed';response=paymentFailure(error instanceof FinancialRateError?429:code==='invalid_input'?400:code==='not_authenticated'?401:['payload_conflict','operation_pending','browser_lineage_required'].includes(code)?409:503,error instanceof FinancialRateError?'rate_limited':code);if(error instanceof FinancialRateError)response.headers.set('Retry-After',String(error.retry))}finally{await Promise.all(jobs)}
 if(response.status!==401)response=withVerifiedCookies(response,session.provisional);return privatePaymentResponse(response)
}}
export const handleAccountFinancial=createAccountFinancialHandler()
