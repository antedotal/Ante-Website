// Request a provider-managed email change for the currently verified account.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountEmailChange } from '../../../../../lib/server/account-email-change'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) { return handleAccountEmailChange(request, 'request') }

// Override Next's automatic HEAD and OPTIONS handlers before Auth or admission.
function methodNotAllowed() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } }) }
export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
