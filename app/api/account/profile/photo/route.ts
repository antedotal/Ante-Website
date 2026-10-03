// Expose only owner-derived private photo upload and deletion.
import { NextRequest, NextResponse } from 'next/server'
import { handleAccountProfilePhoto } from '../../../../../lib/server/account-profile-photo'
import { cancelProfilePhotoBody } from '../../../../../lib/server/profile-photo-stream'
import { privateProfilePhotoResponse } from '../../../../../lib/server/profile-photo-response'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PUT(request: NextRequest) { return handleAccountProfilePhoto(request, 'upload') }
export async function DELETE(request: NextRequest) { return handleAccountProfilePhoto(request, 'delete') }

// Explicit handlers stop Next from converting HEAD or OPTIONS into an authenticated read.
function methodNotAllowed(request: NextRequest) {
  cancelProfilePhotoBody(request)
  return privateProfilePhotoResponse(new NextResponse(null, { status: 405, headers: { Allow: 'PUT, DELETE' } }))
}
export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const POST = methodNotAllowed
export const PATCH = methodNotAllowed
