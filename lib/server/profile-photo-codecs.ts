// The codec boundary uses only precompiled modules supplied by the same Wrangler/OpenNext Worker.
import { getCloudflareContext } from '@opennextjs/cloudflare'
import decodePng, { init as initPng } from '@jsquash/png/decode'
import decodeJpeg, { init as initJpeg } from '@jsquash/jpeg/decode'
import { ProfilePhotoError } from './profile-photo-error'
import type { ImageDimensions } from './profile-photo-png'

type CodecEnv = { PROFILE_PNG_WASM?: WebAssembly.Module; PROFILE_JPEG_WASM?: WebAssembly.Module }
let jpegInitialization: Promise<void> | undefined
let decoderBusy = false

export async function fullyDecodeProfilePhoto(bytes: Uint8Array, format: 'image/png' | 'image/jpeg', dimensions: ImageDimensions): Promise<void> {
  // Reject concurrent decodes rather than retaining an unbounded queue of upload buffers.
  if (decoderBusy) throw new ProfilePhotoError('decoder_unavailable', 503)
  decoderBusy = true
  try {
    let env: CodecEnv
    try { env = getCloudflareContext().env as CodecEnv }
    catch { throw new ProfilePhotoError('decoder_unavailable', 503) }
    const wasmModule = format === 'image/png' ? env.PROFILE_PNG_WASM : env.PROFILE_JPEG_WASM
    if (!(wasmModule instanceof WebAssembly.Module)) throw new ProfilePhotoError('decoder_unavailable', 503)
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    if (format === 'image/png') {
      await initPng(wasmModule)
    } else {
      jpegInitialization ??= initJpeg(wasmModule)
      await jpegInitialization
    }
    const image = format === 'image/png' ? await decodePng(source) : await decodeJpeg(source, { preserveOrientation: false })
    if (image.width !== dimensions.width || image.height !== dimensions.height || image.data.length !== dimensions.width * dimensions.height * 4) {
      throw new ProfilePhotoError('invalid_image', 422)
    }
  } catch (error) {
    if (error instanceof ProfilePhotoError) throw error
    // Decoder messages can include details from untrusted compressed data; never propagate them.
    throw new ProfilePhotoError('invalid_image', 422)
  } finally {
    decoderBusy = false
  }
}
