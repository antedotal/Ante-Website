// Fixed owner-only long collection HTTP controller. Browser selects only an
// existing commitment; SQL derives the original collection/finality lineage.
// Every path is bounded and private, with no financial-effect dispatch surface.
import 'server-only'
import {NextRequest,NextResponse} from 'next/server'
import {accountConfig} from '../supabase/config'
import {trustedAccountOrigin} from './account-request'
import {admitAccountVisitor} from './callback-admission'
import {verifyProfilePhotoSession} from './profile-photo-session'
import {withVerifiedCookies} from './account-session'
import {boundedPaymentBody,paymentId} from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import {exact} from '../payments/collection-v4/scripts/backend/web-payment-provider-contract.mjs'
import {configuredFinancialWebsite,type FinancialWebsiteBindings} from './financial-bridge'
import {paymentCookieKey} from './payment-cookies'
import {FinancialRateError} from './financial-transport'
import {continueFinancialReturn,issueFinancialReturn} from './financial-return'
import {collectionBrowserDigest,newCollectionAdmission} from './collection-cookies'
import {collectionScope,selectedCollectionAdmission,selectedCollectionCapsule,installSelectedCollectionAdmission,installSelectedCollectionCapsule} from './collection-selection'
import {privatePaymentResponse,paymentFailure,paymentMethodDenied} from './account-card-payments'
export function configuredLongCollectionWebsite(){const bindings=configuredFinancialWebsite(),key=paymentCookieKey(process.env.ANTE_WEB_LONG_COLLECTION_READ_KEY);return bindings?.enabled&&key&&process.env.ANTE_WEB_LONG_COLLECTION_HTTP_ACCEPTANCE==='reviewed-long-collection-http-v1'&&['ANTE_WEB_LONG_COLLECTION_RETURN_KEYS','ANTE_WEB_LONG_COLLECTION_SECRET_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_SECRET_BEARER','ANTE_WEB_LONG_COLLECTION_BIND_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_BIND_BEARER'].every(n=>!!process.env[n])?{bindings,key}:null}
export type LongCollectionBindings={bindings:FinancialWebsiteBindings;key:Buffer}
// Ordinary progress is exact fixed JSON. Provider secrets/capabilities cannot
// travel through this projection, even if an unexpected SQL response arrives.
function progress(value:unknown){if(exact(value,['error_code','retry_after_seconds'])&&(value as Record<string,unknown>).error_code==='rate_limited'){const retry=Number((value as Record<string,unknown>).retry_after_seconds);if(!Number.isInteger(retry)||retry<1||retry>60)throw new Error('activation_closed');throw new FinancialRateError(retry)}if(!exact(value,['error_code','result'])||(value as Record<string,unknown>).error_code!==null)throw new Error('operation_pending');const result=(value as {result:Record<string,unknown>}).result;if(!exact(result,['collection_contract_version','commitment_id','commitment_revision','task','collection_state','original_intent_known','continuation_available','collection_operation_id'])||result.collection_contract_version!==1||!paymentId(result.commitment_id)||!Number.isInteger(result.commitment_revision)||!['settled','expired_unsecured','requires_action','failed','unknown','pending'].includes(String(result.collection_state))||typeof result.original_intent_known!=='boolean'||typeof result.continuation_available!=='boolean'||result.collection_operation_id!==null&&!paymentId(result.collection_operation_id))throw new Error('activation_closed');return result}
export function createLongCollectionHandler(resolve:()=>LongCollectionBindings|null=configuredLongCollectionWebsite){return async(request:NextRequest,path:string)=>{
 // Decoded catch-all parameters are logical only. Raw path/query must remain
 // the exact canonical route before config, Auth, owner or provider services.
 if(request.nextUrl.pathname!=='/api/account/collections/'+path||new URL(request.url).pathname!=='/api/account/collections/'+path||request.nextUrl.search)return paymentFailure(400,'invalid_input');
 const selected=resolve();if(!selected)return paymentFailure();let scope:ReturnType<typeof collectionScope>;try{scope=collectionScope(path);if(scope)path=scope.action}catch{return paymentFailure(400,'invalid_input')}if(!['prepare','progress','return/issue','return/continue'].includes(path))return paymentFailure(400,'invalid_input');if(request.method!=='POST')return paymentMethodDenied('POST');let origin:string;try{origin=accountConfig().siteOrigin}catch{return paymentFailure()}if(!trustedAccountOrigin(request,origin,true))return paymentFailure(403,'invalid_origin');if(request.nextUrl.search)return paymentFailure(400,'invalid_input')
 const jobs:Promise<void>[]=[],observe=(p:Promise<void>)=>jobs.push(p);let response:NextResponse
 try{
  const input=await boundedPaymentBody(request,observe);if(path==='prepare'?!(exact(input,['commitment_id','commitment_revision'])&&paymentId(input.commitment_id)&&Number.isInteger(input.commitment_revision)&&Number(input.commitment_revision)>0&&Number(input.commitment_revision)<=2147483647):Object.keys(input).length!==0)return paymentFailure(400,'invalid_input')
  if(scope&&path==='prepare'&&(input.commitment_id!==scope.commitmentId||input.commitment_revision!==scope.revision))throw new Error('browser_lineage_required')
  const admission=await admitAccountVisitor(request);if(admission)return privatePaymentResponse(admission);const identity=await verifyProfilePhotoSession(request);if(identity.kind==='failed')return paymentFailure(identity.status,identity.status===401?'not_authenticated':'activation_closed');const {session}=identity
  if(request.headers.get('X-Ante-Payment-Owner')!==session.ownerId)return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional)
  let current=selectedCollectionAdmission(request,selected.key,session.ownerId,scope)
  if(path==='prepare'){
   // A live read root cannot be overwritten. Replays retain its original nonce,
   // admission and expiry; changing selection waits for its bounded retirement.
   if(current&&(current.commitmentId!==input.commitment_id||current.commitmentRevision!==input.commitment_revision))throw new Error('browser_lineage_required')
   current??=newCollectionAdmission(session.ownerId,String(input.commitment_id),Number(input.commitment_revision))
  }
  if(!current)throw new Error('browser_lineage_required');
  const owner=await selected.bindings.services.owner(new Request(origin+'/v1/collection',{headers:{authorization:'Bearer '+session.token},signal:request.signal}),observe);if(owner.ownerId!==session.ownerId)throw new Error('browser_lineage_required')
  const fields={commitment_id:current.commitmentId,commitment_revision:current.commitmentRevision},view=progress(await owner.collection(fields));if(view.commitment_id!==fields.commitment_id||view.commitment_revision!==fields.commitment_revision)throw new Error('browser_lineage_required')
  if(path==='prepare'||path==='progress'){await owner.fresh();response=NextResponse.json({collection_state:view.collection_state,continuation_available:view.continuation_available,original_intent_known:view.original_intent_known});if(path==='prepare')installSelectedCollectionAdmission(response,current,selected.key,scope)}
  else{
   if(!paymentId(view.collection_operation_id)||view.continuation_available!==true)throw new Error('operation_pending');const sink=NextResponse.json({}),lineage={ownerId:session.ownerId,operationId:String(view.collection_operation_id),browserDigest:collectionBrowserDigest(current),returnAdmissionId:current.returnAdmissionId,capsule:selectedCollectionCapsule(request,selected.key,session.ownerId,scope)??undefined,install:(token:string,expiry:string)=>installSelectedCollectionCapsule(sink,token,expiry,scope)}
   const value=path==='return/issue'?await issueFinancialReturn(selected.bindings,owner,'collection',fields,lineage,observe):await continueFinancialReturn(selected.bindings,owner,'collection',lineage,observe);await owner.fresh();if(path==='return/continue'&&(!value||!('expires_at'in value)||!Number.isFinite(Date.parse(String(value.expires_at)))||Date.now()>=Date.parse(String(value.expires_at))))throw new Error('operation_pending');response=NextResponse.json(value);for(const cookie of sink.headers.getSetCookie())response.headers.append('Set-Cookie',cookie)
  }
  return withVerifiedCookies(privatePaymentResponse(response),session.provisional)
 }catch(error){const code=error instanceof Error&&['invalid_input','browser_lineage_required','operation_pending','not_authenticated'].includes(error.message)?error.message:'activation_closed',out=paymentFailure(error instanceof FinancialRateError?429:code==='invalid_input'?400:code==='not_authenticated'?401:['browser_lineage_required','operation_pending'].includes(code)?409:503,error instanceof FinancialRateError?'rate_limited':code);if(error instanceof FinancialRateError)out.headers.set('Retry-After',String(error.retry));return out}finally{await Promise.all(jobs)}
}}
export const handleLongCollection=createLongCollectionHandler()
