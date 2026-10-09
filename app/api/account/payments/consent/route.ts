// Read approved policy, record affirmative acceptance and retain revocation intent through fixed dormant actions.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountPayments } from '../../../../../lib/server/account-payments'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(request: NextRequest) { return handleAccountPayments(request, 'consent.read') }
export async function POST(request: NextRequest) { return handleAccountPayments(request, 'consent.accept') }
export async function DELETE(request: NextRequest) { return handleAccountPayments(request, 'consent.revoke') }
// Avoid framework-generated HEAD/OPTIONS invoking a read or exposing a dependency before a fixed action.
function methodNotAllowed() { return new NextResponse(null, { status: 405, headers: { Allow: 'GET, POST, DELETE', 'Cache-Control': 'private, no-store' } }) }
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
