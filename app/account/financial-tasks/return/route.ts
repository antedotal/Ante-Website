// Application defense repeats the pure first-hop sanitizer; browser return
// never chooses an operation or changes task/payment/entitlement state.
import {paymentReturnIngressResponse} from '../../../../lib/payments/payment-return-ingress'
export function GET(request:Request){return paymentReturnIngressResponse(request)??new Response(null,{status:403,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}
export function HEAD(){return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}
export const POST=HEAD
export const PUT=HEAD
export const PATCH=HEAD
export const DELETE=HEAD
export const OPTIONS=HEAD
