import 'server-only'
// The codec boundary uses only precompiled modules supplied by the same Wrangler/OpenNext Worker.
import { getCloudflareContext } from '@opennextjs/cloudflare'
import decodePng, { init as initPng } from '@jsquash/png/decode'
import decodeJpeg, { init as initJpeg } from '@jsquash/jpeg/decode'
import { ProfilePhotoError } from './profile-photo-error'
import type { ImageDimensions } from './profile-photo-png'

type CodecEnv = { PROFILE_PNG_WASM?: WebAssembly.Module; PROFILE_JPEG_WASM?: WebAssembly.Module }
// The pinned package implements this two-argument initializer, although its published declaration omits that overload.
const initializeJpeg = initJpeg as unknown as (wasm: WebAssembly.Module, options: { print: () => void; printErr: () => void }) => Promise<void>
let jpegInitialization: Promise<void> | undefined
let jpegEmittedOutput = false
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
      jpegInitialization ??= initializeJpeg(wasmModule, {
        // The decoder tolerates some incomplete scans and reports them only through these instance-local callbacks.
        print: () => { jpegEmittedOutput = true },
        printErr: () => { jpegEmittedOutput = true },
      })
      await jpegInitialization
    }
    jpegEmittedOutput = false
    const image = format === 'image/png' ? await decodePng(source) : await decodeJpeg(source, { preserveOrientation: false })
    if (jpegEmittedOutput || image.width !== dimensions.width || image.height !== dimensions.height || image.data.length !== dimensions.width * dimensions.height * 4) {
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
