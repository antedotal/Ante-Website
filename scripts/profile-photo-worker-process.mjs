// Keep temporary Worker preview lifecycle separate so ownership and refusal can be tested without a build.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// A successful bind is immediately closed; the later nonce check covers the remaining bind race.
export async function assertPortAvailable(port) {
  const server = createServer()
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  } catch (error) {
    throw new Error(`Selected port ${port} is occupied or unavailable`, { cause: error })
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve))
  }
}

// Readiness requires a response from this run's temporary route, not merely any reachable HTTP page.
export async function waitForProbeNonce(url, nonce, { timeoutMs = 30_000, signal } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !signal?.aborted) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))) })
      if (response.ok && (await response.json()).nonce === nonce) return
    } catch { /* Preview may still be starting or a listener may be unrelated. */ }
    await delay(Math.min(100, Math.max(1, deadline - Date.now())))
  }
  throw new Error('Local Worker preview did not answer with this run nonce')
}

// A detached process group includes pnpm, Wrangler and its descendants; only that owned group is signalled.
async function stopOwnedProcess(child) {
  const pid = child.pid
  if (!pid) throw new Error('Owned preview process has no PID')
  const groupExists = () => {
    try { process.kill(-pid, 0); return true }
    catch (error) { if (error.code === 'ESRCH') return false; throw error }
  }
  const signalGroup = signal => {
    try { process.kill(-pid, signal) }
    catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  if (groupExists()) signalGroup('SIGTERM')
  const softDeadline = Date.now() + 3_000
  while (groupExists() && Date.now() < softDeadline) await delay(50)
  if (groupExists()) signalGroup('SIGKILL')
  const hardDeadline = Date.now() + 3_000
  while (groupExists() && Date.now() < hardDeadline) await delay(50)
  if (groupExists()) throw new Error(`Owned process group ${pid} remained alive after cleanup`)
}

// Always await group shutdown before the caller removes the route or performs a clean rebuild.
export async function withOwnedProcess(command, args, options, work) {
  const child = spawn(command, args, { ...options, detached: true })
  try { return await work(child) }
  finally { await stopOwnedProcess(child) }
}

// One request path covers ordinary and streamed probes so both observe interruption and deadline signals.
export async function fetchProbeResult(url, body, mime, signal, streamed = false) {
  const init = { method: 'POST', headers: { 'content-type': mime }, body, signal }
  if (streamed) init.duplex = 'half'
  const response = await fetch(url, init)
  return { status: response.status, result: await response.json() }
}

// Cleanup runs after any attempted diagnostic build, even if that build emitted artifacts then failed.
export async function withTemporaryProbe({ createRoute, build, probe, removeRoute, discardArtifacts, getAbortReason = () => undefined }) {
  let buildAttempted = false
  let value
  const errors = []
  try {
    await createRoute()
    buildAttempted = true
    await build(false)
    value = await probe()
  } catch (error) { errors.push(error) }

  let removed = false
  try { await removeRoute(); removed = true }
  catch (error) { errors.push(error) }
  if (buildAttempted) {
    if (removed) {
      try { await build(true) }
      catch (error) {
        errors.push(error)
        try { await discardArtifacts() }
        catch (discardError) { errors.push(discardError) }
      }
    } else {
      try { await discardArtifacts() }
      catch (discardError) { errors.push(discardError) }
    }
  }
  const aborted = getAbortReason?.()
  if (aborted && !errors.includes(aborted)) errors.push(aborted)
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, errors.map(error => error?.message ?? String(error)).join('; '))
  return value
}
