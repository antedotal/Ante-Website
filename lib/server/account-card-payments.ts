// Private website routes capture one verified owner bearer and delegate only
// fixed B1 ports. A separate prepare ACK installs the server-owned operation
// journal before SQL/provider effects, so execute retries retain original IDs.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { trustedAccountOrigin } from './account-request'
import { admitAccountVisitor } from './callback-admission'
import { verifyProfilePhotoSession } from './profile-photo-session'
import { withVerifiedCookies } from './account-session'
import { privateProfilePhotoResponse } from './profile-photo-response'
import { configuredPaymentWebsite, type PaymentWebsiteBindings } from './payment-bridge'
import { boundedPaymentBody, readPaymentInput, paymentId } from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import { PAYMENT_INTENT_COOKIE, PAYMENT_RETURN_COOKIE, singlePaymentCookie, decodePaymentIntent, preparePaymentIntent, installPaymentIntent, paymentBrowserDigest, installPaymentReturn, type PaymentIntent } from './payment-cookies'
const writes={ 'customer.ensure':'customer/ensure','consent.accept':'consent/accept','consent.revoke':'consent/revoke','card.setup.begin':'setup/begin','card.default.set':'card/default','card.remove':'card/remove' } as const
const reads=new Set(['context','cards','consent','consents/history','operations','operation'])
export function privatePaymentResponse(response: NextResponse) {privateProfilePhotoResponse(response);response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Content-Type-Options','nosniff');return response}
export function paymentFailure(status=503,error='activation_closed'){return privatePaymentResponse(NextResponse.json({error_code:error},{status}))}
export function paymentMethodDenied(allow: string){const response=privatePaymentResponse(new NextResponse(null,{status:405}));response.headers.set('Allow',allow);return response}
// External doubles may supply typed approved ports to isolated tests; production
// uses only the source-gated fixed local package and unset trusted bindings.
export function createAccountCardPaymentHandler(resolve:()=>PaymentWebsiteBindings|null=configuredPaymentWebsite) {
 return async(request:NextRequest,path:string)=>{
  const bindings=resolve();if(!bindings?.enabled)return paymentFailure()
  const read=request.method==='GET';if(read?!reads.has(path)&&path!=='intent':request.method!=='POST'||!['prepare','execute','setup/continuation','setup/return','setup/return/consume'].includes(path))return paymentMethodDenied(reads.has(path)||path==='intent'?'GET':'POST')
  let origin:string;try{origin=accountConfig().siteOrigin}catch{return paymentFailure()}
  if(!trustedAccountOrigin(request,origin,!read))return paymentFailure(403,'invalid_origin')
  if(!read && request.nextUrl.search || path==='intent' && request.nextUrl.search)return paymentFailure(400,'invalid_input')
  // Intake is completed before admission/Auth. The frozen duplicate scanner is
  // reused instead of JSON.parse accepting ambiguous or forged operation fields.
  let input:Record<string,unknown>={};
  try{if(!read){const jobs:Promise<void>[]=[];try{input=await boundedPaymentBody(request,p=>jobs.push(p))}finally{await Promise.all(jobs)}}else if(path!=='intent')await readPaymentInput(new Request(origin+'/v1/payments/'+path+request.nextUrl.search),()=>{})}catch{return paymentFailure(400,'invalid_input')}
  if(!read){
   if(path==='execute' && (Object.keys(input).sort().join(',')!=='expected_operation_id,request_id'||!paymentId(input.request_id)||!paymentId(input.expected_operation_id)))return paymentFailure(400,'invalid_input')
   if(!['prepare','execute'].includes(path)&&Object.keys(input).length!==0)return paymentFailure(400,'invalid_input')
  }
  const admission=await admitAccountVisitor(request);if(admission)return privatePaymentResponse(admission)
  const identity=await verifyProfilePhotoSession(request);if(identity.kind==='failed')return paymentFailure(identity.status,identity.status===401?'not_authenticated':'activation_closed')
  const {session}=identity;
  // The page binds reads and recovery to its verified owner. A changed browser
  // session cannot supply another owner's history to that mounted page.
  const expectedOwner=request.headers.get('X-Ante-Payment-Owner');
  if(expectedOwner!==null&&(!paymentId(expectedOwner)||expectedOwner!==session.ownerId))return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional)
  let intent:PaymentIntent|null;
  try{intent=decodePaymentIntent(singlePaymentCookie(request,PAYMENT_INTENT_COOKIE),bindings.cookieKey,session.ownerId)}catch{return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional)}
  const run=(target:string,body?:Record<string,unknown>,lineage?:Parameters<PaymentWebsiteBindings['handler']>[1])=>bindings.handler(new Request(origin+'/v1/payments/'+target,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+session.token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:request.signal}),lineage)
  let response:NextResponse
  try {
   // Restore only ordinary correlation IDs/action, never the cookie payload or
   // nonce. Explicit execute recovery still reads all input from this cookie and
   // delegates the exact original operation to B1's authoritative journal.
   if(path==='intent')response=NextResponse.json({request_id:intent?.requestId??null,operation_id:intent?.operationId??null,action:intent?.action??null,...(intent?.revocation?{revocation:{request_id:intent.revocation.requestId,operation_id:intent.revocation.operationId,action:intent.revocation.action}}:{})})
   else if(path==='prepare') {
    if(Object.keys(input).sort().join(',')!=='action,input,request_id'||!paymentId(input.request_id)||typeof input.action!=='string'||!Object.hasOwn(writes,input.action)||!input.input||typeof input.input!=='object'||Array.isArray(input.input)||'operation_id' in input.input||'return_route_key' in input.input)throw new Error('invalid_input')
    const action=input.action as keyof typeof writes,fields=input.input as Record<string,unknown>;
    await readPaymentInput(new Request(origin+'/v1/payments/'+writes[action],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...fields,operation_id:'00000000-0000-0000-0000-000000000001',...(action==='card.setup.begin'?{return_route_key:'account_payments'}:{})})}),()=>{})
    // Existing unfinished journals must be resolved before another intention can
    // replace their return lineage. SQL operation history remains the authority.
    const terminal=async(original:PaymentIntent)=>{const old=await run('operation?operation_id='+original.operationId),oldBody=await old.json();return old.ok&&['completed','denied'].includes(oldBody?.result?.summary?.status)};
    let prepared:PaymentIntent;
    // Revocation has one bounded owner-only slot inside the existing encrypted
    // cookie. It uses B1's same operation journal while preserving the entire
    // primary setup/return lineage, even when that provider outcome is unknown.
    if(action==='consent.revoke'&&intent&&intent.action!=='consent.revoke'){
     if(intent.revocation&&intent.revocation.requestId!==input.request_id&&!(await terminal(intent.revocation)))return withVerifiedCookies(paymentFailure(409,'operation_pending'),session.provisional)
     prepared=preparePaymentIntent(intent.revocation??null,session.ownerId,input.request_id,action,fields);prepared.expiresAt=intent.expiresAt;intent={...intent,revocation:prepared}
    }else{
     if(intent&&intent.requestId!==input.request_id&&(!(await terminal(intent))||intent.revocation&&!(await terminal(intent.revocation))))return withVerifiedCookies(paymentFailure(409,'operation_pending'),session.provisional)
     prepared=preparePaymentIntent(intent,session.ownerId,input.request_id,action,fields);intent=prepared
    }
    response=NextResponse.json({operation_id:prepared.operationId,action:prepared.action});installPaymentIntent(response,intent,bindings.cookieKey)
   }else if(read){const result=await run(path+request.nextUrl.search);response=new NextResponse(result.body,{status:result.status,headers:result.headers})}
   else {
    if(!intent)throw new Error('browser_lineage_required');
    // Correlation fields cannot select SQL IDs: they must exactly match the
    // previously ACKed server cookie, fencing a concurrent prepare response.
    const revocation=intent.revocation,execution=path==='execute'&&revocation&&revocation.requestId===input.request_id&&revocation.operationId===input.expected_operation_id?revocation:intent;
    if(path==='execute'){if(Object.keys(input).sort().join(',')!=='expected_operation_id,request_id')throw new Error('invalid_input');if(input.request_id!==execution.requestId||input.expected_operation_id!==execution.operationId)throw new Error('Intent conflict')}else if(Object.keys(input).length!==0)throw new Error('invalid_input')
    const sink=NextResponse.json({});let result:Response
    if(path==='execute'){const action=execution.action as keyof typeof writes;result=await run(writes[action],{...execution.input,operation_id:execution.operationId,...(action==='card.setup.begin'?{return_route_key:'account_payments'}:{})})}
    else {
     if(intent.action!=='card.setup.begin')throw new Error('browser_lineage_required')
     const lineage={browserDigest:paymentBrowserDigest(intent),returnAdmissionId:intent.admissionId,capsule:singlePaymentCookie(request,PAYMENT_RETURN_COOKIE)??undefined,installCapsule:async(token:string,expiry:string)=>installPaymentReturn(sink,token,expiry)}
     if(path==='setup/return/consume')result=await run(path,{},lineage)
     else {
      const detail=await run('operation?operation_id='+intent.operationId),body=await detail.json(),summary=body?.result?.summary;
      if(!detail.ok||summary?.action!=='card.setup.begin'||summary.operation_id!==intent.operationId||!paymentId(summary.resource_id))throw new Error('operation_pending')
      const fields={operation_id:intent.operationId,operation_revision:summary.operation_revision,setup_id:summary.resource_id,setup_revision:summary.resource_revision};
      result=await run(path,{...fields,...(path==='setup/return'?{return_route_key:'account_payments'}:{})},lineage)
     }
    }
    response=new NextResponse(result.body,{status:result.status,headers:result.headers});for(const cookie of sink.headers.getSetCookie())response.headers.append('Set-Cookie',cookie)
   }
  }catch(error){const code=error instanceof Error&&['invalid_input','browser_lineage_required','Intent conflict','operation_pending'].includes(error.message)?error.message:'activation_closed';response=paymentFailure(code==='invalid_input'?400:code==='Intent conflict'||code==='operation_pending'?409:503,code==='Intent conflict'?'payload_conflict':code)}
  return privatePaymentResponse(response.status===401?response:withVerifiedCookies(response,session.provisional))
 }
}
export const handleAccountCardPayments=createAccountCardPaymentHandler()
