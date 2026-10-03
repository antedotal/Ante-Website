// Derive one run's admission digests inside the isolated acceptance Worker without provider I/O.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

const path = '/__ante_acceptance/profile-read-digests-v1'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const tokenHex = /^[0-9a-f]{64}$/
const crossZoneSentinel = '2a06:98c0:3600::103'
const maxBodyBytes = 1024
const bodyDeadlineMs = 2000

// Mirror the production photo response's private browser and CDN cache policy.
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
  'Content-Type': 'application/json',
}

function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), { status, headers: privateHeaders })
}

function notFound() {
  return jsonResponse({ error: 'Not found' }, 404)
}

// Match callback-admission's canonicalization, including mapped IPv6 and its cross-zone sentinel.
function canonicalIp(value) {
  if (!value || value !== value.trim() || value.includes('%')) return null
  const family = isIP(value)
  if (family === 4) return value
  if (family !== 6) return null
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
    if (canonical === crossZoneSentinel) return null
    const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical)
    if (!mapped) return canonical
    const high = Number.parseInt(mapped[1], 16)
    const low = Number.parseInt(mapped[2], 16)
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`
  } catch {
    return null
  }
}

// Consume at most one bounded JSON body; a stalled stream cannot hold this operator route open.
async function readBoundedBody(request) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const startedAt = performance.now()
  const chunks = []
  let length = 0
  let emptyChunks = 0
  let complete = false
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('body deadline')), bodyDeadlineMs)
  })
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), deadline])
      // A synchronous producer can settle after two seconds before the queued timer callback runs.
      if (performance.now() - startedAt >= bodyDeadlineMs) return null
      if (part.done) { complete = true; break }
      if (!(part.value instanceof Uint8Array) || length + part.value.byteLength > maxBodyBytes) return null
      if (part.value.byteLength === 0) {
        if (++emptyChunks > 32) return null
        continue
      }
      emptyChunks = 0
      length += part.value.byteLength
      chunks.push(part.value.slice())
    }
    if (request.signal.aborted || length === 0 || performance.now() - startedAt >= bodyDeadlineMs) return null
    return Buffer.concat(chunks, length).toString('utf8')
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (!complete) void reader.cancel().catch(() => {})
    try { reader.releaseLock() } catch { /* A stalled producer may still own the pending read. */ }
  }
}

// Require the exact pinned HTTPS origin and a fixed-format credential before parsing fixture input.
function authenticatedRequest(request, env) {
  if (!env || !uuid.test(env.ANTE_ACCEPTANCE_RUN_ID) || !tokenHex.test(env.ANTE_ACCEPTANCE_OPERATOR_TOKEN) ||
      env.ANTE_AUTH_INGRESS !== 'cloudflare' ||
      typeof env.ANTE_AUTH_LIMIT_HMAC_SECRET !== 'string' ||
      Buffer.byteLength(env.ANTE_AUTH_LIMIT_HMAC_SECRET, 'utf8') < 32) return false
  let url
  try {
    url = new URL(env.ANTE_ACCEPTANCE_ORIGIN)
    if (url.protocol !== 'https:' || url.origin !== env.ANTE_ACCEPTANCE_ORIGIN) return false
  } catch {
    return false
  }
  const requestOrigin = request.headers.get('origin')
  if (request.method !== 'POST' || request.url !== `${url.origin}${path}` ||
      request.headers.has('cf-worker') ||
      requestOrigin !== null && requestOrigin !== url.origin ||
      request.headers.get('content-type') !== 'application/json') return false
  const supplied = request.headers.get('authorization')
  if (!supplied?.startsWith('Bearer ') || !tokenHex.test(supplied.slice(7))) return false
  const expectedBytes = Buffer.from(env.ANTE_ACCEPTANCE_OPERATOR_TOKEN, 'hex')
  const suppliedBytes = Buffer.from(supplied.slice(7), 'hex')
  return timingSafeEqual(expectedBytes, suppliedBytes)
}

// This route accepts only one exact three-identity request and emits four private HMAC digests.
export async function prepareDigests(request, env) {
  try {
    if (!authenticatedRequest(request, env)) return notFound()
    const declaredLength = request.headers.get('content-length')
    if (declaredLength !== null && (!/^(0|[1-9][0-9]*)$/.test(declaredLength) || Number(declaredLength) > maxBodyBytes)) return notFound()
    const ip = canonicalIp(request.headers.get('cf-connecting-ip'))
    if (!ip) return notFound()
    const raw = await readBoundedBody(request)
    if (raw === null) return notFound()
    // This fixed ASCII grammar has no reason to escape a key or UUID; forbidding escapes prevents decoded key aliases.
    // Also reject literal duplicates and declared lengths that disagree with the consumed body.
    if (raw.includes('\\') || (raw.match(/"run_id"\s*:/g) ?? []).length !== 1 ||
        (raw.match(/"fixture_ids"\s*:/g) ?? []).length !== 1 ||
        declaredLength !== null && Number(declaredLength) !== Buffer.byteLength(raw, 'utf8')) return notFound()
    let value
    try { value = JSON.parse(raw) } catch { return notFound() }
    if (!value || Array.isArray(value) || typeof value !== 'object' ||
        Object.keys(value).length !== 2 || !Object.hasOwn(value, 'run_id') || !Object.hasOwn(value, 'fixture_ids') ||
        value.run_id !== env.ANTE_ACCEPTANCE_RUN_ID || !Array.isArray(value.fixture_ids) ||
        value.fixture_ids.length !== 3 || !value.fixture_ids.every(id => typeof id === 'string' && uuid.test(id)) ||
        new Set(value.fixture_ids).size !== 3) return notFound()
    const digest = message => createHmac('sha256', env.ANTE_AUTH_LIMIT_HMAC_SECRET).update(message).digest('hex')
    return jsonResponse({
      version: 1, run_id: value.run_id,
      visitor_digest: digest(`website-account:v1:${ip}`),
      user_digests: value.fixture_ids.map(id => digest(`website-photo-read:v1:${id}`)),
    }, 200)
  } catch {
    // Malformed platform input and body failures share the same secret-free denial.
    return notFound()
  }
}

export const preparationPath = path
