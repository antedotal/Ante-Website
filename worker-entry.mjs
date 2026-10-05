// Wrangler compiles these static WASM imports and passes them through the existing OpenNext Worker context.
import handler from './.open-next/worker.js'
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm'
import jpegWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'

const worker = {
  // Keep the generated OpenNext routing and bindings; only add immutable decoder modules.
  fetch(request, env, ctx) {
    return handler.fetch(request, { ...env, PROFILE_PNG_WASM: pngWasm, PROFILE_JPEG_WASM: jpegWasm }, ctx)
  },
}

export default worker
