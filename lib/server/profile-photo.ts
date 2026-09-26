import 'server-only'
// This server-only entrypoint validates a bounded still image and returns its original bytes for later owner-authorized storage.
import { ProfilePhotoError } from './profile-photo-error'
import { assertProfilePhotoBodyReadable, cancelProfilePhotoBody, readProfilePhotoBody } from './profile-photo-stream'
import { inspectPng } from './profile-photo-png'
import { inspectJpeg } from './profile-photo-jpeg'
import { fullyDecodeProfilePhoto } from './profile-photo-codecs'

export { ProfilePhotoError } from './profile-photo-error'
export type ValidatedProfilePhoto = { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png'; width: number; height: number }
type PhotoValidator = (request: Request) => Promise<ValidatedProfilePhoto>
let processingPhoto = false

// Reject unsupported MIME before any body work, preserving the public validator's cheap denial order.
function photoType(request: Request): 'image/jpeg' | 'image/png' {
  const rawType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (rawType !== 'image/jpeg' && rawType !== 'image/png') {
    cancelProfilePhotoBody(request)
    throw new ProfilePhotoError('unsupported_format', 415)
  }
  return rawType
}

// The unguarded pipeline stays private so all public entrypoints share the same image-processing slot.
async function validateInsideScope(request: Request): Promise<ValidatedProfilePhoto> {
  const rawType = photoType(request)
  const bytes = await readProfilePhotoBody(request)
  const looksPng = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  const looksJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
  if (rawType === 'image/png' && !looksPng || rawType === 'image/jpeg' && !looksJpeg) throw new ProfilePhotoError('invalid_image', 422)
  const dimensions = rawType === 'image/png' ? await inspectPng(bytes) : inspectJpeg(bytes)
  await fullyDecodeProfilePhoto(bytes, rawType, dimensions)
  return { bytes, contentType: rawType, ...dimensions }
}

// Acquire synchronously; a callback owns its one validation and any awaited Storage work until it settles.
export async function withProfilePhotoProcessing<T>(work: (validate: PhotoValidator) => Promise<T>): Promise<T> {
  if (processingPhoto) throw new ProfilePhotoError('decoder_unavailable', 503)
  processingPhoto = true
  let active = true
  let used = false
  let validation: Promise<ValidatedProfilePhoto> | undefined
  const validate: PhotoValidator = request => {
    if (!active || used) return Promise.reject(new ProfilePhotoError('decoder_unavailable', 503))
    used = true
    validation = validateInsideScope(request)
    // An early-returning callback must not create an unhandled rejection while the scope drains it.
    void validation.catch(() => {})
    return validation
  }
  try {
    let result: T | undefined
    let callbackError: unknown
    let callbackFailed = false
    try { result = await work(validate) } catch (error) { callbackError = error; callbackFailed = true }
    active = false
    if (validation) {
      try { await validation } catch (error) { if (!callbackFailed) throw error }
    }
    if (callbackFailed) throw callbackError
    return result as T
  } finally {
    active = false
    processingPhoto = false
  }
}

// Raw callers retain the returned bytes; the slot ends when this promise settles.
export async function validateProfilePhoto(request: Request): Promise<ValidatedProfilePhoto> {
  photoType(request)
  assertProfilePhotoBodyReadable(request)
  try { return await withProfilePhotoProcessing(validate => validate(request)) }
  catch (error) {
    if (error instanceof ProfilePhotoError && error.code === 'decoder_unavailable') cancelProfilePhotoBody(request)
    throw error
  }
}
