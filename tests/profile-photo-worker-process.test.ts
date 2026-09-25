// Verify the local probe owns its listener and refuses unrelated servers.
import { afterEach, describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import { assertPortAvailable, waitForProbeNonce, withOwnedProcess } from '../scripts/profile-photo-worker-process.mjs'

const servers: Server[] = []
const sockets = new Set<import('node:net').Socket>()
afterEach(async () => {
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function busyServer(reply?: string) {
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.end(reply ?? '') })
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
})
