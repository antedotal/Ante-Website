import 'server-only'
// This server-only entrypoint validates a bounded still image and returns its original bytes for later owner-authorized storage.
import { ProfilePhotoError } from './profile-photo-error'
import { readProfilePhotoBody } from './profile-photo-stream'
import { inspectPng } from './profile-photo-png'
import { inspectJpeg } from './profile-photo-jpeg'
import { fullyDecodeProfilePhoto } from './profile-photo-codecs'

export { ProfilePhotoError } from './profile-photo-error'
export type ValidatedProfilePhoto = { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png'; width: number; height: number }

export async function validateProfilePhoto(request: Request): Promise<ValidatedProfilePhoto> {
  const rawType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (rawType !== 'image/jpeg' && rawType !== 'image/png') throw new ProfilePhotoError('unsupported_format', 415)
  const bytes = await readProfilePhotoBody(request)
  const looksPng = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  const looksJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
  if (rawType === 'image/png' && !looksPng || rawType === 'image/jpeg' && !looksJpeg) throw new ProfilePhotoError('invalid_image', 422)
  const dimensions = rawType === 'image/png' ? await inspectPng(bytes) : inspectJpeg(bytes)
  await fullyDecodeProfilePhoto(bytes, rawType, dimensions)
  return { bytes, contentType: rawType, ...dimensions }
}
