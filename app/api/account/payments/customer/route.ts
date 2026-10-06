// Expose only local customer reservation through the dormant fixed owner adapter.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountPayments } from '../../../../../lib/server/account-payments'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) { return handleAccountPayments(request, 'customer.ensure') }
// Explicitly deny automatic and unsupported methods before admission or dependency construction.
function methodNotAllowed() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } }) }
export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
