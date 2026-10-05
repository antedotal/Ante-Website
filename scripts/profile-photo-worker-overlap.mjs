// One bounded, authenticated diagnostic protocol for two distinct temporary Worker routes.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function assertReply(reply, nonce, isolateId, label) {
  if (reply.result?.nonce !== nonce) throw new Error(`${label}: wrong run nonce`)
  if (typeof reply.result?.isolateId !== 'string' || !reply.result.isolateId) throw new Error(`${label}: missing isolate identity`)
  if (isolateId && reply.result.isolateId !== isolateId) throw new Error(`${label}: different isolate identity`)
  return reply.result.isolateId
}

export async function runOverlapRound({ fetchJson, nonce, holderUrl, contenderUrl, round, recovery, signal, readinessTimeoutMs = 5_000 }) {
  let holderSettled = false
  const hold = fetchJson(holderUrl, { method: 'POST', body: JSON.stringify({ action: 'hold', nonce, fail: round === 'failure' }), signal })
  void hold.finally(() => { holderSettled = true }).catch(() => {})
  let isolateId
  let busy
  let failure
  let release
  let terminal
  try {
    const until = Date.now() + readinessTimeoutMs
    while (Date.now() < until) {
      if (signal?.aborted) throw signal.reason
      if (holderSettled) throw new Error('Holder ended before acquisition')
      const state = await fetchJson(holderUrl, { method: 'POST', body: JSON.stringify({ action: 'status', nonce }), signal })
      if (state.status !== 200) throw new Error(`Holder status returned ${state.status}`)
      isolateId = assertReply(state, nonce, isolateId, 'holder status')
      if (state.result.acquired === true) break
      await delay(Math.min(25, Math.max(1, until - Date.now())))
    }
    if (!isolateId || Date.now() >= until) throw new Error('Holder did not acquire the processing scope within deadline')
    busy = await fetchJson(contenderUrl, { method: 'POST', body: JSON.stringify({ action: 'raw', nonce }), signal })
    assertReply(busy, nonce, isolateId, 'raw contender')
    if (busy.status !== 503 || busy.result.code !== 'decoder_unavailable') throw new Error('Raw contender must return 503 decoder_unavailable')
    if (busy.result.pulls !== 0 || busy.result.cancels !== 1) throw new Error('Busy raw contender must have zero pulls and one cancellation')
    const scoped = await fetchJson(contenderUrl, { method: 'POST', body: JSON.stringify({ action: 'scope', nonce }), signal })
    assertReply(scoped, nonce, isolateId, 'scoped contender')
    if (scoped.status !== 503 || scoped.result.code !== 'decoder_unavailable' || scoped.result.entered !== false) throw new Error('Scoped contender entered while holder owned scope')
  } catch (error) { failure = error }
  try {
    release = await fetchJson(holderUrl, { method: 'POST', body: JSON.stringify({ action: 'release', nonce }), signal })
    assertReply(release, nonce, isolateId, 'holder release')
    if (release.status !== 200 || release.result.released !== true) throw new Error('Holder release was not acknowledged')
    terminal = await hold
    assertReply(terminal, nonce, isolateId, 'holder terminal')
    if (!failure && (round === 'failure' ? terminal.status !== 500 || terminal.result.code !== 'holder_failed' : terminal.status !== 200 || terminal.result.code !== 'released')) throw new Error('Holder returned wrong terminal outcome')
  } catch (error) { failure ??= error }
  if (failure) throw failure
  const recovered = await recovery()
  if (recovered.status !== 200 || recovered.width !== 2000 || recovered.height !== 2000) throw new Error('Capacity did not recover for maximum-area image')
  return { round, isolateId, pulls: busy.result.pulls, cancels: busy.result.cancels, holderStatus: terminal.status, recovery: recovered }
}

export function makeOverlapSources({ nonce, pngBase64 }) {
  const state = `// Temporary local diagnostic state. Removed before the clean build.
export const runNonce = ${JSON.stringify(nonce)}
export const isolateId = crypto.randomUUID()
export let current: { acquired: boolean; release: (() => void) | null } | null = null
export function setCurrent(value: typeof current) { current = value }
`
  const holder = `import { withProfilePhotoProcessing, ProfilePhotoError } from '@/lib/server/profile-photo'
import { runNonce, isolateId, current, setCurrent } from '@/lib/server/local-profile-photo-diagnostic'
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { action?: string; nonce?: string; fail?: boolean }
  if (input.nonce !== runNonce) return Response.json({ code: 'unauthorized' }, { status: 403 })
  if (input.action === 'status') return Response.json({ nonce: runNonce, isolateId, acquired: current?.acquired === true })
  if (input.action === 'release') { const released = current?.acquired === true; current?.release?.(); return Response.json({ nonce: runNonce, isolateId, released }) }
  if (input.action !== 'hold' || current) return Response.json({ nonce: runNonce, isolateId, code: 'bad_control' }, { status: 409 })
  const barrier = { acquired: false, release: null as (() => void) | null }
  setCurrent(barrier)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await withProfilePhotoProcessing(async () => {
      await new Promise<void>((resolve, reject) => {
        let done = false
        barrier.release = () => { if (done) return; done = true; resolve() }
        timer = setTimeout(() => { if (done) return; done = true; reject(new Error('bounded_barrier_timeout')) }, 5_000)
        barrier.acquired = true
      })
      if (input.fail === true) throw new Error('synthetic_holder_failure_sensitive_text')
    })
    return Response.json({ nonce: runNonce, isolateId, code: 'released' })
  } catch (error) {
    if (error instanceof ProfilePhotoError) return Response.json({ nonce: runNonce, isolateId, code: error.code }, { status: error.status })
    return Response.json({ nonce: runNonce, isolateId, code: 'holder_failed' }, { status: 500 })
  } finally { if (timer) clearTimeout(timer); barrier.release?.(); setCurrent(null) }
}`
  const contender = `import { validateProfilePhoto, withProfilePhotoProcessing, ProfilePhotoError } from '@/lib/server/profile-photo'
import { runNonce, isolateId } from '@/lib/server/local-profile-photo-diagnostic'
const png = Uint8Array.from(atob(${JSON.stringify(pngBase64)}), value => value.charCodeAt(0))
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { action?: string; nonce?: string }
  if (input.nonce !== runNonce) return Response.json({ code: 'unauthorized' }, { status: 403 })
  if (input.action === 'raw') {
    let pulls = 0, cancels = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(png); controller.close() },
      cancel() { cancels++ },
    }, { highWaterMark: 0 })
    const imageRequest = new Request(request.url, { method: 'POST', headers: { 'content-type': 'image/png' }, body: stream, duplex: 'half' } as RequestInit)
    try {
      const image = await validateProfilePhoto(imageRequest)
      return Response.json({ nonce: runNonce, isolateId, width: image.width, height: image.height, pulls, cancels })
    } catch (error) {
      if (error instanceof ProfilePhotoError) return Response.json({ nonce: runNonce, isolateId, code: error.code, pulls, cancels }, { status: error.status })
      return Response.json({ nonce: runNonce, isolateId, code: 'unexpected', pulls, cancels }, { status: 500 })
    }
  }
  if (input.action === 'scope') {
    let entered = false
    try {
      await withProfilePhotoProcessing(async () => { entered = true })
      return Response.json({ nonce: runNonce, isolateId, entered })
    } catch (error) {
      if (error instanceof ProfilePhotoError) return Response.json({ nonce: runNonce, isolateId, code: error.code, entered }, { status: error.status })
      return Response.json({ nonce: runNonce, isolateId, code: 'unexpected', entered }, { status: 500 })
    }
  }
  return Response.json({ nonce: runNonce, isolateId, code: 'bad_control' }, { status: 400 })
}`
  return { state, holder, contender }
}
