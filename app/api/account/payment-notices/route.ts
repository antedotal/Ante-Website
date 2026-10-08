// Fixed read handler owns all admission, identity, quota and safe DTO checks.
import {handlePaymentNotices} from '../../../../lib/server/account-payment-notices'
import type {NextRequest} from 'next/server'
export const dynamic='force-dynamic'
export const POST=(request:NextRequest)=>handlePaymentNotices(request)
