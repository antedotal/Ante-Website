// Verify a code from either inbox while binding completion to the same signed-in account.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountEmailChange } from '../../../../../lib/server/account-email-change'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) { return handleAccountEmailChange(request, 'confirm') }

// Override Next's automatic HEAD and OPTIONS handlers before Auth or admission.
function methodNotAllowed() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } }) }
export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
