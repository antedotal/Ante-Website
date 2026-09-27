// Apply admission and fresh Auth to private current-generation profile photo reads.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { trustedAccountOrigin } from './account-request'
import { withVerifiedCookies } from './account-session'
import { admitAccountVisitor, admitProfilePhotoUser } from './callback-admission'
import { withProfilePhotoProcessing } from './profile-photo'
import { cancelProfilePhotoBody, MAX_PROFILE_PHOTO_BYTES } from './profile-photo-stream'
import { downloadProfilePhoto, profilePhotoKey } from './profile-photo-store'
import { verifyProfilePhotoSession, type VerifiedPhotoSession } from './profile-photo-session'

type FailureStatus = 400 | 401 | 403 | 404 | 413 | 415 | 429 | 503

// Return only fixed private errors; no provider response or decoder text crosses this boundary.
function failure(status: FailureStatus, photoMissing = false) {
  const messages: Record<FailureStatus, string> = {
    400: 'Invalid request', 401: 'Authentication required', 403: 'Invalid origin',
    404: photoMissing ? 'Photo not found' : 'Profile not found',
    413: 'Request too large', 415: 'Unsupported content type',
    429: 'Please try again later', 503: 'Photo temporarily unavailable',
  }
  const response = NextResponse.json({ error: messages[status] }, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  if (status === 429 || status === 503) response.headers.set('Retry-After', '60')
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

// This separate read gate cannot activate the retired fixed-key write protocol.
function readEnabled() { return process.env.ANTE_PROFILE_PHOTOS_MODE === 'generation-read-v1' }

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
  // Validation precedes the closed response so malformed requests keep stable errors.
  return rejectWrite(request, 503)
}

export async function handleProfilePhotoRead(request: NextRequest, targetId: string): Promise<NextResponse> {
  if (request.signal.aborted) return failure(400)
  let siteOrigin: string
  try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503) }
  if (!trustedAccountOrigin(request, siteOrigin, false)) return failure(403)
  if (request.nextUrl.search || !profilePhotoKey(targetId)) return failure(400)
  if (!readEnabled()) return failure(503)

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
