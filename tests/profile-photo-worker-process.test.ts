// Verify the local probe owns its listener and refuses unrelated servers.
import { afterEach, describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertPortAvailable, fetchProbeResult, waitForProbeNonce, withOwnedProcess, withTemporaryProbe } from '../scripts/profile-photo-worker-process.mjs'

const servers: Server[] = []
const sockets = new Set<import('node:net').Socket>()
afterEach(async () => {
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function busyServer(reply?: string) {
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); socket.end(reply ?? '') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return (server.address() as { port: number }).port
}

describe('temporary Worker process ownership', () => {
  it('refuses a selected port already held by another listener', async () => {
    const port = await busyServer()
    await expect(assertPortAvailable(port)).rejects.toThrow(/occupied/)
  })

  it('does not accept a reachable unrelated server as its own probe', async () => {
    const port = await busyServer('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 19\r\n\r\n{"nonce":"unrelated"}')
    await expect(waitForProbeNonce(`http://127.0.0.1:${port}`, 'our-nonce', { timeoutMs: 150 })).rejects.toThrow(/nonce/)
  })

  it('terminates and awaits its process group when a probe fails', async () => {
    let pid = 0
    await expect(withOwnedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { env: { PATH: process.env.PATH ?? '' }, stdio: 'ignore' }, async (child: ChildProcess) => {
      pid = child.pid!
      throw new Error('probe assertion failed')
    })).rejects.toThrow('probe assertion failed')
    expect(() => process.kill(-pid, 0)).toThrow()
  })

  it('cleans a diagnostic artifact after the first build emits it and fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ante-photo-probe-test-'))
    const route = join(dir, 'route.ts')
    const artifact = join(dir, 'worker.js')
    let builds = 0
    try {
      await expect(withTemporaryProbe({
        createRoute: () => writeFileSync(route, 'temporary probe'),
        build: () => {
          builds++
          if (existsSync(route)) { writeFileSync(artifact, 'compiled probe'); throw new Error('initial build failed') }
          rmSync(artifact, { force: true })
        },
        probe: () => { throw new Error('probe must not run') },
        removeRoute: () => rmSync(route, { force: true }),
        discardArtifacts: () => rmSync(artifact, { force: true }),
      })).rejects.toThrow('initial build failed')
      expect(builds).toBe(2)
      expect(existsSync(route)).toBe(false)
      expect(existsSync(artifact)).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('discards generated artifacts if even the clean rebuild fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ante-photo-probe-test-'))
    const route = join(dir, 'route.ts')
    const artifact = join(dir, 'worker.js')
    let builds = 0
    try {
      await expect(withTemporaryProbe({
        createRoute: () => writeFileSync(route, 'temporary probe'),
        build: () => { builds++; writeFileSync(artifact, 'possibly contaminated'); throw new Error('build failed') },
        probe: () => { throw new Error('probe must not run') },
        removeRoute: () => rmSync(route, { force: true }),
        discardArtifacts: () => rmSync(artifact, { force: true }),
      })).rejects.toThrow('build failed')
      expect(builds).toBe(2)
      expect(existsSync(route)).toBe(false)
      expect(existsSync(artifact)).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('returns a failed status when interrupted during the final clean build', async () => {
    const controller = new AbortController()
    let builds = 0
    let cleanFinished = false
    await expect(withTemporaryProbe({
      createRoute: () => {},
      build: () => { if (++builds === 2) { controller.abort(new Error('synthetic SIGTERM')); cleanFinished = true } },
      probe: () => 'ok',
      removeRoute: () => {},
      discardArtifacts: () => {},
      getAbortReason: () => controller.signal.aborted ? controller.signal.reason : undefined,
    })).rejects.toThrow('synthetic SIGTERM')
    expect(builds).toBe(2)
    expect(cleanFinished).toBe(true)
  })

  it('aborts a stalled chunked quick-probe response', async () => {
    const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    const port = (server.address() as { port: number }).port
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('synthetic interrupt')), 100)
    try {
      const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024)); controller.close() } })
      await expect(fetchProbeResult(`http://127.0.0.1:${port}`, body, 'image/png', controller.signal, true)).rejects.toThrow('synthetic interrupt')
    } finally { clearTimeout(timer) }
  })
})
