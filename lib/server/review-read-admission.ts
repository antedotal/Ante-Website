// A read-only admission is independent of task funding and report operations.
// Reuse the accepted AEAD codec, with exact action/input checks and a dedicated
// cookie name. Current owner SQL is checked before every admitted projection.
import 'server-only'
import {decodePaymentIntent,encodePaymentIntent,newPaymentIntent,singlePaymentCookie,type PaymentIntent} from './payment-cookies'
import {exact,internalId} from '../payments/browser-dto-v1/primitives.mjs'
import type {NextRequest,NextResponse} from 'next/server'
export const reviewReadCookie='__Host-ante-payment-review-read'
export function newReviewReadAdmission(owner:string,commitment:string,revision:number){return newPaymentIntent(owner,crypto.randomUUID(),'review.read',{commitment_id:commitment,commitment_revision:revision})}
export function decodeReviewReadAdmission(request:NextRequest,key:Buffer,owner:string):PaymentIntent|null{let v:PaymentIntent|null;try{v=decodePaymentIntent(singlePaymentCookie(request,reviewReadCookie),key,owner)}catch{throw Error('browser_lineage_required')}if(v&&(!exact(v,['owner','requestId','operationId','action','input','admissionId','browserNonce','expiresAt'])||v.action!=='review.read'||![v.owner,v.requestId,v.operationId,v.admissionId,v.input.commitment_id].every(internalId)||!exact(v.input,['commitment_id','commitment_revision'])||!Number.isInteger(v.input.commitment_revision)||Number(v.input.commitment_revision)<1||Number(v.input.commitment_revision)>2147483647))throw Error('browser_lineage_required');return v}
export function installReviewReadAdmission(response:NextResponse,v:PaymentIntent,key:Buffer){response.cookies.set(reviewReadCookie,encodePaymentIntent(v,key),{httpOnly:true,secure:true,sameSite:'strict',path:'/',expires:new Date(v.expiresAt)})}
