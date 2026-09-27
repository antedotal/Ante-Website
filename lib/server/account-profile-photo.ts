// Apply admission and fresh Auth to private current-generation profile photo reads.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { accountConfig } from '../supabase/config'
import { trustedAccountOrigin } from './account-request'
import { withVerifiedCookies } from './account-session'
import { admitAccountVisitor, admitProfilePhotoUser } from './callback-admission'
import { withProfilePhotoProcessing } from './profile-photo'
import { cancelProfilePhotoBody, MAX_PROFILE_PHOTO_BYTES } from './profile-photo-stream'
import { confirmCurrentProfilePhoto, profilePhotoKey, readSelectedProfilePhoto, resolveCurrentProfilePhoto } from './profile-photo-store'
import { reverifyProfilePhotoSession, verifyProfilePhotoSession, type VerifiedPhotoSession } from './profile-photo-session'
import { privateProfilePhotoResponse } from './profile-photo-response'

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
  if (status === 429 || status === 503) response.headers.set('Retry-After', '60')
  return privateProfilePhotoResponse(response)
}

// Keep provisional SSR refresh cookies on every outcome after successful token verification.
function verified(response: NextResponse, session: VerifiedPhotoSession) {
  return privateProfilePhotoResponse(withVerifiedCookies(response, session.provisional))
}

// Reject an upload without waiting for a hostile producer's cancellation promise.
function rejectWrite(request: NextRequest, status: FailureStatus) {
  cancelProfilePhotoBody(request)
  return failure(status)
}

// This separate read gate cannot activate the retired fixed-key write protocol.
function readEnabled() { return process.env.ANTE_PROFILE_PHOTOS_MODE === 'mediated-read-v1' }

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

export async function handleProfilePhotoRead(request: NextRequest, params: Promise<{ ownerId: string }>): Promise<NextResponse> {
  if (request.signal.aborted) return failure(400)
  // Start one deadline before awaiting route params; an abort-ignoring params promise cannot stall the route.
  const controller = new AbortController()
  const deadlineAt = performance.now() + 30_000
  let wake!: () => void
  const interruption = new Promise<null>(resolve => { wake = () => resolve(null) })
  const abort = () => { if (!controller.signal.aborted) { controller.abort(); wake() } }
  request.signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 30_000)
  const interrupted = () => {
    if (performance.now() >= deadlineAt) abort()
    return controller.signal.aborted
  }
  let verifiedSession: VerifiedPhotoSession | undefined
  try {
    if (request.signal.aborted) return failure(503)
    const routeParams = await Promise.race([params, interruption])
    if (interrupted() || !routeParams) return failure(503)
    const targetId = routeParams.ownerId
    let siteOrigin: string
    try { siteOrigin = accountConfig().siteOrigin } catch { return failure(503) }
    if (!trustedAccountOrigin(request, siteOrigin, false)) return failure(403)
    if (request.nextUrl.search || !profilePhotoKey(targetId)) return failure(400)
    if (!readEnabled()) return failure(503)

    if (interrupted()) return failure(503)
    const visitor = await admitAccountVisitor(request, controller.signal)
    if (interrupted()) return failure(503)
    if (visitor) return privateProfilePhotoResponse(visitor)
    const identity = await verifyProfilePhotoSession(request, controller.signal)
    if (interrupted()) return failure(503)
    if (identity.kind === 'failed') return failure(identity.status)
    const session = identity.session
    verifiedSession = session
    const fail = (status: FailureStatus, missing = false) => verified(failure(status, missing), session)
    const userAdmission = await admitProfilePhotoUser(session.ownerId, 'read', controller.signal)
    if (interrupted()) return fail(503)
    if (userAdmission) return verified(userAdmission, session)

    // The slot owns the full byte pipeline and both final checks; decode cannot release it early.
    try {
      return await withProfilePhotoProcessing(async validate => {
        if (interrupted()) return fail(503)
        const selection = await resolveCurrentProfilePhoto(targetId, session.token, controller.signal)
        if (interrupted()) return fail(503)
        if (selection.kind !== 'current') return fail(selection.kind === 'not_found' ? 404 : 503, true)
        const result = await readSelectedProfilePhoto(selection.selection, controller.signal)
        if (interrupted()) return fail(503)
        if (result.kind !== 'found') return fail(result.kind === 'not_found' ? 404 : 503, true)
        let image: Awaited<ReturnType<typeof validate>>
        try {
          image = await validate(new Request(request.url, {
            method: 'PUT', headers: { 'content-type': result.contentType },
            body: result.bytes.slice() as BodyInit, signal: controller.signal,
          }))
        } catch { return fail(503) }
        if (interrupted()) return fail(503)
        if (image.contentType !== result.manifest.mime || image.width !== result.manifest.width || image.height !== result.manifest.height) return fail(503)
        const finalAuth = await reverifyProfilePhotoSession(session, controller.signal)
        if (interrupted()) return fail(503)
        if (finalAuth.kind === 'failed') return fail(finalAuth.status)
        const confirmed = await confirmCurrentProfilePhoto(selection.selection, session.token, controller.signal)
        if (interrupted()) return fail(503)
        if (confirmed.kind !== 'current') return fail(confirmed.kind === 'not_found' ? 404 : 503, true)
        // Return the exact hash-verified bytes after the last caller-authority snapshot.
        const response = new NextResponse(result.bytes.slice() as BodyInit, { status: 200, headers: {
          'Content-Type': result.contentType, 'X-Content-Type-Options': 'nosniff',
        } })
        if (interrupted()) return fail(503)
        return verified(response, session)
      })
    } catch { return fail(503) }
  } catch { return verifiedSession ? verified(failure(503), verifiedSession) : failure(503) }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); controller.abort() }
}
