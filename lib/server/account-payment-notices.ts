// Separate fixed read route uses captured actual bearer, verified account
// cookies, bounded body/transport and the original owner SQL read quota.
import 'server-only'
import {NextRequest,NextResponse} from 'next/server'
import {accountConfig} from '../supabase/config'
import {trustedAccountOrigin} from './account-request'
import {admitAccountVisitor} from './callback-admission'
import {verifyProfilePhotoSession} from './profile-photo-session'
import {withVerifiedCookies} from './account-session'
import {boundedPaymentBody,paymentId} from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import {exact} from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import {configuredFinancialWebsite,type FinancialWebsiteBindings} from './financial-bridge'
import {ownerNotices} from '../payments/owner-notices-model'
import {paymentFailure,paymentMethodDenied,privatePaymentResponse} from './account-card-payments'
import {FinancialRateError} from './financial-transport'
export function configuredPaymentNotices():FinancialWebsiteBindings|null{return process.env.ANTE_WEB_PAYMENT_NOTICES_HTTP_ACCEPTANCE==='reviewed-ordinary-notices-v1'?configuredFinancialWebsite():null}
export function createPaymentNoticesHandler(resolve:()=>FinancialWebsiteBindings|null=configuredPaymentNotices){return async(request:NextRequest)=>{const binding=resolve();if(!binding?.enabled)return paymentFailure();if(request.method!=='POST')return paymentMethodDenied('POST');let origin:string;try{origin=accountConfig().siteOrigin}catch{return paymentFailure()};if(!trustedAccountOrigin(request,origin,true)||request.nextUrl.search)return paymentFailure(403,'invalid_origin');const jobs:Promise<void>[]=[];const observe=(p:Promise<void>)=>jobs.push(p);let after:string|null;try{const input=await boundedPaymentBody(request,observe);if(!exact(input,['after'])||input.after!==null&&!paymentId(input.after))throw Error();after=input.after as string|null}catch{await Promise.all(jobs);return paymentFailure(400,'invalid_input')}const denied=await admitAccountVisitor(request);if(denied)return privatePaymentResponse(denied);const identity=await verifyProfilePhotoSession(request);if(identity.kind==='failed')return paymentFailure(identity.status,identity.status===401?'not_authenticated':'activation_closed');const {session}=identity;if(request.headers.get('X-Ante-Payment-Owner')!==session.ownerId)return withVerifiedCookies(paymentFailure(409,'browser_lineage_required'),session.provisional);let response:NextResponse;try{const owner=await binding.services.owner(new Request(origin+'/v1/payment-notices',{headers:{authorization:'Bearer '+session.token},signal:request.signal}),observe);if(owner.ownerId!==session.ownerId)throw Error('browser_lineage_required');response=NextResponse.json(ownerNotices(await owner.notices(after),after))}catch(e){response=paymentFailure(e instanceof FinancialRateError?429:503,e instanceof FinancialRateError?'rate_limited':'activation_closed');if(e instanceof FinancialRateError)response.headers.set('Retry-After',String(e.retry))}finally{await Promise.all(jobs)}return privatePaymentResponse(withVerifiedCookies(response,session.provisional))}}
export const handlePaymentNotices=createPaymentNoticesHandler()
