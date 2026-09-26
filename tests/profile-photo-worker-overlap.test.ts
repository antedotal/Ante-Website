import { describe, expect, it } from 'vitest'
import { runOverlapRound } from '../scripts/profile-photo-worker-overlap.mjs'

const nonce = 'run-nonce'
const isolateId = 'shared-isolate'
const holderUrl = 'http://local/holder'
const contenderUrl = 'http://local/contender'

type Reply = { status: number; result: Record<string, unknown> }
function controlledFetch(overrides: { busy?: Reply; wrongIsolate?: boolean; neverAcquires?: boolean } = {}) {
  const events: string[] = []
  let acquired = false
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const fetchJson = async (url: string, init: { method?: string; body?: string } = {}): Promise<Reply> => {
    const action = init.body ? JSON.parse(init.body).action : 'status'
    events.push(`${url.endsWith('holder') ? 'holder' : 'contender'}:${action}`)
    if (url === holderUrl && action === 'hold') {
      acquired = !overrides.neverAcquires
      await held
      return { status: 200, result: { nonce, isolateId, code: 'released' } }
    }
    if (url === holderUrl && action === 'status') return { status: 200, result: { nonce, isolateId, acquired } }
    if (url === holderUrl && action === 'release') { release(); return { status: 200, result: { nonce, isolateId, released: true } } }
    if (url === contenderUrl && action === 'raw') return overrides.busy ?? { status: 503, result: { nonce, isolateId: overrides.wrongIsolate ? 'other-isolate' : isolateId, code: 'decoder_unavailable', pulls: 0, cancels: 1 } }
    if (url === contenderUrl && action === 'scope') return { status: 503, result: { nonce, isolateId, code: 'decoder_unavailable', entered: false } }
    throw new Error(`unexpected ${url} ${action}`)
  }
  return { fetchJson, events }
}

const options = (fetchJson: ReturnType<typeof controlledFetch>['fetchJson']) => ({ fetchJson, nonce, holderUrl, contenderUrl, round: 'normal' as const, recovery: async () => ({ width: 2000, height: 2000, status: 200 }), signal: AbortSignal.timeout(2000) })

describe('local Worker overlap protocol', () => {
  it('waits for actual holder acquisition before both contenders and recovers after release', async () => {
    const { fetchJson, events } = controlledFetch()
    await expect(runOverlapRound(options(fetchJson))).resolves.toMatchObject({ isolateId, pulls: 0, cancels: 1 })
    expect(events.indexOf('holder:status')).toBeLessThan(events.indexOf('contender:raw'))
    expect(events.indexOf('contender:scope')).toBeLessThan(events.indexOf('holder:release'))
  })
  it('rejects wrong busy code and releases the holder', async () => {
    const { fetchJson, events } = controlledFetch({ busy: { status: 503, result: { nonce, isolateId, code: 'wrong_code', pulls: 0, cancels: 1 } } })
    await expect(runOverlapRound(options(fetchJson))).rejects.toThrow(/decoder_unavailable/)
    expect(events).toContain('holder:release')
  })
  it('rejects a different contender isolate and releases the holder', async () => {
    const { fetchJson, events } = controlledFetch({ wrongIsolate: true })
    await expect(runOverlapRound(options(fetchJson))).rejects.toThrow(/isolate/)
    expect(events).toContain('holder:release')
  })
  it('rejects a busy contender that reads any body bytes', async () => {
    const { fetchJson, events } = controlledFetch({ busy: { status: 503, result: { nonce, isolateId, code: 'decoder_unavailable', pulls: 1, cancels: 1 } } })
    await expect(runOverlapRound(options(fetchJson))).rejects.toThrow(/pull/)
    expect(events).toContain('holder:release')
  })
  it('bounds a stuck holder and still sends release', async () => {
    const { fetchJson, events } = controlledFetch({ neverAcquires: true })
    await expect(runOverlapRound({ ...options(fetchJson), readinessTimeoutMs: 50 })).rejects.toThrow(/acquire/)
    expect(events).toContain('holder:release')
  })
})
