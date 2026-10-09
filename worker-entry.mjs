// Wrangler compiles these static WASM imports and passes them through the existing OpenNext Worker context.
import handler from './.open-next/worker.js'
import { productionOriginResponse } from './lib/production-origin.ts'
import { paymentReturnIngressResponse } from './lib/payments/payment-return-ingress.ts'
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm'
import jpegWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'

const worker = {
  // Canonicalize recognized production requests before account middleware, then retain OpenNext bindings and decoders.
  fetch(request, env, ctx) {
    // Remove the fixed payment return query before any canonical redirect or application processing.
    const paymentReturn = paymentReturnIngressResponse(request)
    if (paymentReturn) return paymentReturn
    const redirect = productionOriginResponse(request)
    if (redirect) return redirect
    return handler.fetch(request, { ...env, PROFILE_PNG_WASM: pngWasm, PROFILE_JPEG_WASM: jpegWasm }, ctx)
  },
}

export default worker
