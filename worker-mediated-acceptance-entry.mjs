// Include the operator-only preparation route only in the separate acceptance build.
import ordinary from './worker-entry.mjs'
import { prepareDigests, preparationPath } from './scripts/acceptance/mediated-preparation-worker.mjs'

// Preserve the ordinary OpenNext Worker class exports and binding contract.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './worker-entry.mjs'

const acceptanceWorker = {
  // Route every non-preparation request through the unchanged ordinary entry.
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === preparationPath) return prepareDigests(request, env)
    return ordinary.fetch(request, env, ctx)
  },
}

export default acceptanceWorker
