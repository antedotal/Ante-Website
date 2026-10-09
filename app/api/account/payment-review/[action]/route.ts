// Only fixed review actions reach the owner handler; no generic RPC is exposed.
import type {NextRequest} from 'next/server'
import {handlePaymentReview} from '../../../../../lib/server/account-payment-review'
import {paymentMethodDenied} from '../../../../../lib/server/account-card-payments'
async function handle(request:NextRequest,{params}:{params:Promise<{action:string}>}){return handlePaymentReview(request,(await params).action)}
export const GET=handle
export const POST=handle
export function HEAD(){return paymentMethodDenied('GET, POST')}
export const PUT=HEAD
export const PATCH=HEAD
export const DELETE=HEAD
export const OPTIONS=HEAD
