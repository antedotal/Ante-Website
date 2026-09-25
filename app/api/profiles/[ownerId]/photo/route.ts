// Return original validated bytes only after fresh per-request authorization.
import { NextRequest, NextResponse } from 'next/server'
import { handleProfilePhotoRead } from '../../../../../lib/server/account-profile-photo'
import { cancelProfilePhotoBody } from '../../../../../lib/server/profile-photo-stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ ownerId: string }> }
export async function GET(request: NextRequest, context: Context) {
  const { ownerId } = await context.params
  return handleProfilePhotoRead(request, ownerId)
}

// Explicit 405s prevent framework HEAD and OPTIONS auto behavior from reaching Auth.
function methodNotAllowed(request: NextRequest) {
  cancelProfilePhotoBody(request)
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'private, no-store' } })
}
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
