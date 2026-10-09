// Review routes reuse verified owner admission, bounded intake and AEAD intent
// storage and independent read admission. A report freezes the original outcome; it cannot decide or collect.
import 'server-only'
import {NextRequest,NextResponse} from 'next/server'
import {accountConfig} from '../supabase/config'
import {trustedAccountOrigin} from './account-request'
import {admitAccountVisitor} from './callback-admission'
import {verifyProfilePhotoSession} from './profile-photo-session'
import {withVerifiedCookies} from './account-session'
import {boundedPaymentBody,paymentId} from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import {exact,canonicalRequest} from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import {configuredFinancialWebsite,type FinancialWebsiteBindings} from './financial-bridge'
import {ownerReview,ownerHistory,reviewCommitments,reviewEvidence} from '../payments/owner-review-model'
import {parseCommitmentReceipt,parseCommitmentRequest} from '../payments/owner-review-v1/commitment-server.mjs'
import {decodeReviewReadAdmission,installReviewReadAdmission,newReviewReadAdmission} from './review-read-admission'
import {decodePaymentIntent,encodePaymentIntent,newPaymentIntent,paymentCookieKey,singlePaymentCookie,type PaymentIntent} from './payment-cookies'
import {paymentFailure,paymentMethodDenied,privatePaymentResponse} from './account-card-payments'
import {FinancialRateError} from './financial-transport'
const cookieName='__Host-ante-payment-review'
type Binding={financial:FinancialWebsiteBindings;key:Buffer}
// Source/config acceptance stays separate from existing funding readiness. No
// environment value is written or inferred by this implementation.
export function configuredPaymentReview():Binding|null{if(process.env.ANTE_WEB_PAYMENT_REVIEW_HTTP_ACCEPTANCE!=='reviewed-owner-review-v2')return null;const financial=configuredFinancialWebsite(),key=paymentCookieKey(process.env.ANTE_WEB_PAYMENT_REVIEW_INTENT_KEY);return financial?.enabled&&key?{financial,key}:null}
function receipt(value:unknown,operation?:string){const v=parseCommitmentReceipt(value);if(v.error_code==='rate_limited')throw new FinancialRateError(v.retry_after_seconds);if(operation&&v.operation_id!==operation)throw Error('operation_pending');return v}
function original(intent:PaymentIntent|null){return intent?{request_id:intent.requestId,operation_id:intent.operationId,action:intent.action}:null}
// A separate key/name uses the accepted codec unchanged. Exact validation adds
// this finite review purpose and excludes consent/provider action children.
function decode(request:NextRequest,key:Buffer,owner:string){const intent=decodePaymentIntent(singlePaymentCookie(request,cookieName),key,owner);if(intent){if(!exact(intent,['owner','requestId','operationId','action','input','admissionId','browserNonce','expiresAt'])||!paymentId(intent.requestId)||!paymentId(intent.operationId)||!paymentId(intent.admissionId)||!['appeal','dispute'].includes(intent.action))throw Error('browser_lineage_required');parseCommitmentRequest(intent.action,{...intent.input,operation_id:intent.operationId})}return intent}
function install(response:NextResponse,intent:PaymentIntent,key:Buffer){const token=encodePaymentIntent(intent,key);if(token.length>4096)throw Error('invalid_input');response.cookies.set(cookieName,token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',expires:new Date(intent.expiresAt)})}
export function createPaymentReviewHandler(resolve:()=>Binding|null=configuredPaymentReview){return async(request:NextRequest,path:string)=>{
 const binding=resolve();if(!binding)return paymentFailure();const reading=['progress','intent'].includes(path),paged=['history','commitments','evidence'].includes(path);if(!['progress','intent','history','prepare','execute','recover','commitments','select','evidence'].includes(path))return paymentFailure(400,'invalid_input');if(request.method!==(reading?'GET':'POST'))return paymentMethodDenied(reading?'GET':'POST')
 let origin:string;try{origin=accountConfig().siteOrigin}catch{return paymentFailure()};if(!trustedAccountOrigin(request,origin,!reading)||request.nextUrl.search)return paymentFailure(403,'invalid_origin')
 const jobs:Promise<void>[]=[];const observe=(p:Promise<void>)=>jobs.push(p);let input:Record<string,unknown>={}
 try{if(!reading)input=await boundedPaymentBody(request,observe);if(paged){if(!exact(input,['after'])||input.after!==null&&!paymentId(input.after))throw Error()}else if(path==='select'){if(!exact(input,['commitment_id'])||!paymentId(input.commitment_id))throw Error()}else if(path==='prepare'){if(!exact(input,['request_id','action','reason','asset_ids'])||!paymentId(input.request_id)||!['appeal','dispute'].includes(String(input.action))||typeof input.reason!=='string'||!Array.isArray(input.asset_ids))throw Error();parseCommitmentRequest(String(input.action),{operation_id:input.request_id,commitment_id:input.request_id,commitment_revision:1,outcome_id:input.request_id,outcome_revision:1,outcome_hash:'0'.repeat(64),reason:input.reason,asset_ids:input.asset_ids});if(new TextEncoder().encode(input.reason).length>1200)throw Error()}else if(path==='execute'){if(!exact(input,['request_id','operation_id'])||!paymentId(input.request_id)||!paymentId(input.operation_id))throw Error()}else if(!reading&&Object.keys(input).length)throw Error()}catch{await Promise.all(jobs);return paymentFailure(400,'invalid_input')}
 const denied=await admitAccountVisitor(request);if(denied)return privatePaymentResponse(denied);const identity=await verifyProfilePhotoSession(request);if(identity.kind==='failed')return paymentFailure(identity.status,identity.status===401?'not_authenticated':'activation_closed');const {session}=identity
 if(request.headers.get('X-Ante-Payment-Owner')!==session.ownerId)return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional)
 let response:NextResponse
 try{
 const owner=await binding.financial.services.owner(new Request(origin+'/v1/payment-review',{headers:{authorization:'Bearer '+session.token},signal:request.signal}),observe);if(owner.ownerId!==session.ownerId)throw Error('browser_lineage_required');const prior=['intent','prepare','execute','recover'].includes(path)?decode(request,binding.key,session.ownerId):null
 if(path==='intent')response=NextResponse.json(original(prior))
 else if(path==='prepare'&&prior&&prior.requestId===input.request_id){if(prior.action!==input.action||canonicalRequest({reason:prior.input.reason,asset_ids:prior.input.asset_ids})!==canonicalRequest({reason:input.reason,asset_ids:input.asset_ids}))throw Error('payload_conflict');response=NextResponse.json(original(prior));install(response,prior,binding.key)}
 else if(path==='recover'||path==='execute'){
  if(!prior||path==='execute'&&(prior.requestId!==input.request_id||prior.operationId!==input.operation_id))throw Error('browser_lineage_required')
  const v=path==='recover'?await owner.review('recover',{operation_id:prior.operationId}):await owner.review(prior.action as 'appeal'|'dispute',{...prior.input,operation_id:prior.operationId});response=NextResponse.json(receipt(v,prior.operationId))
 }else{
  if(path==='commitments'){const value=await owner.review('list',{after:input.after});if(exact(value,['review_projection_version','items','next_cursor']))response=NextResponse.json(reviewCommitments(value,input.after as string|null));else{receipt(value);throw Error('operation_pending')}}
  else if(path==='select'){const selected=receipt(await owner.review('read',{commitment_id:input.commitment_id}));if(!selected.result)throw Error('operation_pending');const view=ownerReview(selected.result,String(input.commitment_id)),admission=newReviewReadAdmission(session.ownerId,view.commitment_id,view.revision);response=NextResponse.json(view);installReviewReadAdmission(response,admission,binding.key)}
  else{
  const admission=decodeReviewReadAdmission(request,binding.key,session.ownerId);if(!admission)throw Error('browser_lineage_required');const commitmentId=String(admission.input.commitment_id)
  if(path==='evidence'){const value=await owner.review('assets',{commitment_id:commitmentId,after:input.after});if(exact(value,['review_projection_version','commitment_id','items','next_cursor']))response=NextResponse.json(reviewEvidence(value,commitmentId,input.after as string|null));else{receipt(value);throw Error('operation_pending')}}
  else if(path==='history'){const value=await owner.review('history',{commitment_id:commitmentId,after:input.after});if(exact(value,['commitment_contract_version','authority_kind','items']))response=NextResponse.json({items:ownerHistory(value,input.after as string|null)});else {receipt(value);throw Error('operation_pending')}}
  else{
   const current=receipt(await owner.review('read',{commitment_id:commitmentId}));if(!current.result)throw Error('operation_pending');const view=ownerReview(current.result,commitmentId);if(view.revision!==admission.input.commitment_revision)throw Error('operation_pending')
   if(path==='progress')response=NextResponse.json(view)
   else{
    // New reports require current original outcome/revision. A separately ACKed
    // report is handled above and retains its original frozen ancestry on retry.
    if(prior){const recovered=receipt(await owner.review('recover',{operation_id:prior.operationId}),prior.operationId);if(!['completed','denied'].includes(recovered.status))throw Error('operation_pending')}
    if(!view.outcome||input.action==='appeal'&&view.finality||view.cases.some(c=>c.kind===(input.action==='appeal'?'appeal':'issuer_dispute')))throw Error('operation_pending')
    const frozen={commitment_id:view.commitment_id,commitment_revision:view.revision,outcome_id:view.outcome.outcome_id,outcome_revision:view.outcome.outcome_revision,outcome_hash:view.outcome.outcome_hash,reason:input.reason,asset_ids:input.asset_ids},intent=newPaymentIntent(session.ownerId,String(input.request_id),String(input.action),frozen)
    response=NextResponse.json(original(intent));install(response,intent,binding.key)
   }
  }
 }
 }
 }catch(error){const code=error instanceof Error&&['invalid_input','payload_conflict','operation_pending','browser_lineage_required'].includes(error.message)?error.message:'activation_closed';response=paymentFailure(error instanceof FinancialRateError?429:code==='invalid_input'?400:code==='activation_closed'?503:409,error instanceof FinancialRateError?'rate_limited':code);if(error instanceof FinancialRateError)response.headers.set('Retry-After',String(error.retry))}finally{await Promise.all(jobs)}
 return privatePaymentResponse(withVerifiedCookies(response,session.provisional))
}}
export const handlePaymentReview=createPaymentReviewHandler()
