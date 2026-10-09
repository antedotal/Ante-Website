// Explicit methods prevent framework HEAD/OPTIONS from invoking private work.
import { NextRequest } from 'next/server'
import { handleAccountCardPayments, paymentMethodDenied } from '../../../../../../lib/server/account-card-payments'
export const dynamic='force-dynamic'
type Context={params:Promise<{action:string[]}>}
export async function GET(request:NextRequest,context:Context){return handleAccountCardPayments(request,(await context.params).action.join('/'))}
export async function POST(request:NextRequest,context:Context){return handleAccountCardPayments(request,(await context.params).action.join('/'))}
export function HEAD(){return paymentMethodDenied('GET, POST')}
export function OPTIONS(){return paymentMethodDenied('GET, POST')}
export function PUT(){return paymentMethodDenied('GET, POST')}
export function PATCH(){return paymentMethodDenied('GET, POST')}
export function DELETE(){return paymentMethodDenied('GET, POST')}
