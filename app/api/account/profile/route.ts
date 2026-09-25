// Expose owner-derived canonical profile-name reads and writes through the guarded account boundary.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountProfile } from '../../../../lib/server/account-profile'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleAccountProfile(request, 'read')
}

export async function PATCH(request: NextRequest) {
  return handleAccountProfile(request, 'write')
}

// Override automatic HEAD and OPTIONS so unsupported methods never reach admission or Auth.
function methodNotAllowed() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: 'GET, PATCH', 'Cache-Control': 'private, no-store' },
  })
}

export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const DELETE = methodNotAllowed
