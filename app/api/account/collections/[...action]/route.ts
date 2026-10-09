// Params identify the logical route only; the controller rejects any raw URL
// that differs before Auth/owner/provider admission, including encoded slashes.
import type {NextRequest} from 'next/server'
import {handleLongCollection} from '../../../../../lib/server/account-long-collection'
import {paymentMethodDenied} from '../../../../../lib/server/account-card-payments'
type Context={params:Promise<{action:string[]}>}
export async function POST(request:NextRequest,context:Context){return handleLongCollection(request,(await context.params).action.join('/'))}
export function GET(){return paymentMethodDenied('POST')}
export const HEAD=GET
export const PUT=GET
export const PATCH=GET
export const DELETE=GET
export const OPTIONS=GET
