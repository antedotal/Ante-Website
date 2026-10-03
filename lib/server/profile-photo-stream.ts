// Keep untrusted upload bodies below the fixed cap before constructing one contiguous buffer.
import { ProfilePhotoError } from './profile-photo-error'

export const MAX_PROFILE_PHOTO_BYTES = 2_097_152
const READ_DEADLINE_MS = 10_000

// Early header/signal denials have no reader yet; cancel an unlocked body without waiting on its producer.
export function cancelProfilePhotoBody(request: Request): void {
  if (!request.body || request.body.locked) return
  try { void request.body.cancel().catch(() => {}) } catch { /* Body cancellation itself may throw. */ }
}

// Check cheap upload eligibility without acquiring a reader or pulling producer bytes.
export function assertProfilePhotoBodyReadable(request: Request): void {
  if (!request.body || request.body.locked || request.signal.aborted) {
    cancelProfilePhotoBody(request)
    throw new ProfilePhotoError('invalid_input', 400)
  }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    cancelProfilePhotoBody(request)
    throw new ProfilePhotoError('invalid_input', 400)
  }
  if (declared !== null && Number(declared) > MAX_PROFILE_PHOTO_BYTES) {
    cancelProfilePhotoBody(request)
    throw new ProfilePhotoError('too_large', 413)
  }
}

export async function readProfilePhotoBody(request: Request): Promise<Uint8Array> {
  // Recheck at reader acquisition because the request may change after admission.
  assertProfilePhotoBodyReadable(request)
  const declared = request.headers.get('content-length')
  const reader = request.body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let completed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProfilePhotoError('timed_out', 408)), READ_DEADLINE_MS)
    abortHandler = () => reject(new ProfilePhotoError('invalid_input', 400))
    request.signal.addEventListener('abort', abortHandler, { once: true })
    if (request.signal.aborted) abortHandler()
  })
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline])
      if (result.done) {
        completed = true
        break
      }
      // A single malicious chunk can cross the limit; reject it before copying any of its bytes.
      if (result.value.byteLength > MAX_PROFILE_PHOTO_BYTES - size) throw new ProfilePhotoError('too_large', 413)
      size += result.value.byteLength
      chunks.push(result.value.slice())
    }
    if (size === 0 || declared !== null && Number(declared) !== size) throw new ProfilePhotoError('invalid_input', 400)
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch (error) {
    if (error instanceof ProfilePhotoError) throw error
    throw new ProfilePhotoError('invalid_input', 400)
  } finally {
    if (timer) clearTimeout(timer)
    if (abortHandler) request.signal.removeEventListener('abort', abortHandler)
    // Do not wait on cancellation: an attacker-controlled stream can leave cancellation pending.
    if (!completed) void reader.cancel().catch(() => {})
    try { reader.releaseLock() } catch { /* A pending read releases after its cancellation settles. */ }
  }
}
