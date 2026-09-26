// Apply admission, fresh Auth and fixed-key Storage operations to private profile photos.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { trustedAccountOrigin } from './account-request'
import { withVerifiedCookies } from './account-session'
import { admitAccountVisitor, admitProfilePhotoUser } from './callback-admission'
import { ProfilePhotoError, withProfilePhotoProcessing } from './profile-photo'
import { cancelProfilePhotoBody, MAX_PROFILE_PHOTO_BYTES } from './profile-photo-stream'
import { deleteProfilePhoto, downloadProfilePhoto, photoOwnerProfile, profilePhotoKey, putProfilePhoto } from './profile-photo-store'
import { verifyProfilePhotoSession, type VerifiedPhotoSession } from './profile-photo-session'

type FailureStatus = 400 | 401 | 403 | 404 | 408 | 413 | 415 | 422 | 429 | 503

// Return only fixed private errors; no provider response or decoder text crosses this boundary.
function failure(status: FailureStatus, photoMissing = false) {
  const messages: Record<FailureStatus, string> = {
    400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin',
    404: photoMissing ? 'Photo not found' : 'Profile not found', 408: 'Photo upload timed out',
    413: 'Request too large', 415: 'Unsupported content type', 422: 'Invalid image',
    429: 'Please try again later', 503: 'Photo temporarily unavailable',
  }
  const response = NextResponse.json({ error: messages[status] }, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (status === 429 || status === 503) response.headers.set('Retry-After', '60')
  return response
}

function success() {
  const response = NextResponse.json({ ok: true })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

// Keep provisional SSR refresh cookies on every outcome after successful token verification.
function verified(response: NextResponse, session: VerifiedPhotoSession) {
  return withVerifiedCookies(response, session.provisional)
}

// Reject an upload without waiting for a hostile producer's cancellation promise.
function rejectWrite(request: NextRequest, status: FailureStatus) {
  cancelProfilePhotoBody(request)
  return failure(status)
}

// The operator gate remains unset unless explicitly enabled after hosted acceptance.
function enabled() { return process.env.ANTE_PROFILE_PHOTOS_MODE === 'private-v1' }

export async function handleAccountProfilePhoto(request: NextRequest, action: 'upload' | 'delete'): Promise<NextResponse> {
  if (request.signal.aborted) return rejectWrite(request, 400)
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return rejectWrite(request, 503) }
  if (!trustedAccountOrigin(request, siteOrigin, true)) return rejectWrite(request, 403)
  if (request.nextUrl.search || action === 'delete' && request.body) return rejectWrite(request, 400)
  // Cheap upload headers are checked before admission; actual streamed bytes remain validator-owned.
  if (action === 'upload') {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') return rejectWrite(request, 415)
    const declared = request.headers.get('content-length')
    if (declared !== null) {
      if (!/^(0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared))) return rejectWrite(request, 400)
      if (Number(declared) > MAX_PROFILE_PHOTO_BYTES) return rejectWrite(request, 413)
    }
  }
  if (!enabled()) return rejectWrite(request, 503)

  // Shared visitor admission precedes SSR construction and every body read.
  const visitor = await admitAccountVisitor(request)
  if (visitor) { cancelProfilePhotoBody(request); return visitor }
  const identity = await verifyProfilePhotoSession(request)
  if (identity.kind === 'failed') return rejectWrite(request, identity.status)
  const session = identity.session
  const userAdmission = await admitProfilePhotoUser(session.ownerId, action)
  if (userAdmission) { cancelProfilePhotoBody(request); return verified(userAdmission, session) }

  // Privileged mutations are forbidden when the caller's own profile does not exist.
  const profile = await photoOwnerProfile(session.ownerId, session.token, request.signal)
  if (profile.kind !== 'exists') {
    cancelProfilePhotoBody(request)
    return verified(failure(profile.kind === 'missing' ? 404 : 503), session)
  }
  if (action === 'delete') {
    const result = await deleteProfilePhoto(session.ownerId, request.signal)
    return verified(result.kind === 'ok' ? success() : failure(503), session)
  }

  try {
    // Keep validated bytes and Storage's upload copy inside the same admitted scope through acknowledgement.
    return await withProfilePhotoProcessing(async validate => {
      const image = await validate(request)
      const result = await putProfilePhoto(session.ownerId, image, request.signal)
      return verified(result.kind === 'ok' ? success() : failure(503), session)
    })
  }
  catch (error) {
    cancelProfilePhotoBody(request)
    if (error instanceof ProfilePhotoError) return verified(failure(error.status), session)
    return verified(failure(503), session)
  }
}

export async function handleProfilePhotoRead(request: NextRequest, targetId: string): Promise<NextResponse> {
  if (request.signal.aborted) return failure(400)
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503) }
  if (!trustedAccountOrigin(request, siteOrigin, false)) return failure(403)
  if (request.nextUrl.search || !profilePhotoKey(targetId)) return failure(400)
  if (!enabled()) return failure(503)

  const visitor = await admitAccountVisitor(request)
  if (visitor) return visitor
  const identity = await verifyProfilePhotoSession(request)
  if (identity.kind === 'failed') return failure(identity.status)
  const session = identity.session
  const userAdmission = await admitProfilePhotoUser(session.ownerId, 'read')
  if (userAdmission) return verified(userAdmission, session)

  try {
    // Admit before Storage download; returned response bytes belong to the caller after construction.
    return await withProfilePhotoProcessing(async validate => {
      // Ignore client validators and ranges; every read downloads through the checked caller token.
      const result = await downloadProfilePhoto(targetId, session.token, request.signal)
      if (result.kind !== 'found') return verified(failure(result.kind === 'not_found' ? 404 : 503, true), session)
      try {
        const image = await validate(new Request(request.url, {
          method: 'PUT', headers: { 'content-type': result.contentType }, body: result.bytes.slice() as BodyInit,
        }))
        const response = new NextResponse(image.bytes.slice() as BodyInit, { status: 200, headers: {
          'Content-Type': image.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } })
        return verified(response, session)
      } catch { return verified(failure(503), session) }
    })
  } catch { return verified(failure(503), session) }
}
