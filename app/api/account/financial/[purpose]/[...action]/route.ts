// A finite purpose union reaches the fixed owner handler. No route segment
// selects an RPC/provider action; unsupported methods and purposes deny privately.
import {type NextRequest} from 'next/server'
import {handleAccountFinancial} from '../../../../../../lib/server/account-financial'
import {paymentFailure,paymentMethodDenied} from '../../../../../../lib/server/account-card-payments'
type Context={params:Promise<{purpose:string;action:string[]}>}
async function handle(request:NextRequest,context:Context){const {purpose,action}=await context.params;if(purpose!=='task'&&purpose!=='premium')return paymentFailure(400,'invalid_input');return handleAccountFinancial(request,purpose,action.join('/'))}
export const GET=handle
export const POST=handle
export function HEAD(){return paymentMethodDenied('GET, POST')}
export const PUT=HEAD
export const PATCH=HEAD
export const DELETE=HEAD
export const OPTIONS=HEAD
