// Return original validated bytes only after fresh per-request authorization.
import { NextRequest, NextResponse } from 'next/server'
import { handleProfilePhotoRead } from '../../../../../lib/server/account-profile-photo'
import { cancelProfilePhotoBody } from '../../../../../lib/server/profile-photo-stream'
import { privateProfilePhotoResponse } from '../../../../../lib/server/profile-photo-response'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ ownerId: string }> }
export async function GET(request: NextRequest, context: Context) {
  return handleProfilePhotoRead(request, context.params)
}

// Explicit 405s prevent framework HEAD and OPTIONS auto behavior from reaching Auth.
function methodNotAllowed(request: NextRequest) {
  cancelProfilePhotoBody(request)
  return privateProfilePhotoResponse(new NextResponse(null, { status: 405, headers: { Allow: 'GET' } }))
}
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
