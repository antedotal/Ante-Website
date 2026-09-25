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
