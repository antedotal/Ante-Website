// A raw, request-scoped transport for photo session Auth. The shared Auth
// sanitizer remains responsible for SDK-facing error classification.
import 'server-only'

const successLimit = 65_536
const errorLimit = 2_048
const operationMs = 10_000
const errorBodyMs = 1_000

const unavailable = () => new Error('Profile photo Auth unavailable')
const cancel = (body: ReadableStream<Uint8Array> | null) => {
  try { void body?.cancel().catch(() => {}) } catch { /* Best effort; never await a hostile cancel. */ }
}
const emptyError = (status: number) => new Response(status === 304 ? null : '', {
  status, statusText: 'Authentication request failed', headers: { 'content-type': 'application/json' },
})

export function createProfilePhotoAuthFetch(projectUrl: string, ownerSignal: AbortSignal): typeof fetch {
  let configured: URL
  try { configured = new URL(projectUrl) } catch { throw unavailable() }
  if (configured.protocol !== 'https:' || configured.username || configured.password) throw unavailable()
  const origin = configured.origin

  return async (input, init) => {
    let target: URL
    try { target = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input) }
    catch { throw unavailable() }
    if (target.protocol !== 'https:' || target.origin !== origin || target.username || target.password ||
      (target.pathname !== '/auth/v1' && !target.pathname.startsWith('/auth/v1/'))) throw unavailable()

    const controller = new AbortController()
    const signals = [ownerSignal, input instanceof Request ? input.signal : undefined, init?.signal].filter((signal): signal is AbortSignal => !!signal)
    let stopped = false
    let deadlineExpired = false
    let rejectStopped!: (reason: Error) => void
    const stoppedPromise = new Promise<never>((_resolve, reject) => { rejectStopped = reject })
    void stoppedPromise.catch(() => {})
    const stop = () => {
      if (stopped) return
      stopped = true
      controller.abort()
      rejectStopped(unavailable())
    }
    for (const signal of signals) signal.addEventListener('abort', stop, { once: true })
    if (signals.some(signal => signal.aborted)) stop()
    if (stopped) {
      for (const signal of signals) signal.removeEventListener('abort', stop)
      throw unavailable()
    }
    const timer = setTimeout(() => {
      if (!stopped) { deadlineExpired = true; stop() }
    }, operationMs)
    let response: Response | undefined
    try {
      const raw = Promise.resolve().then(() => {
        if (stopped) throw unavailable()
        return fetch(input, { ...init, signal: controller.signal, redirect: 'manual' })
      })
      // A transport can ignore abort and settle after the caller has returned.
      // Its body must still be disposed, without waiting for cancel to settle.
      void raw.then(late => { if (stopped) cancel(late.body) }, () => {})
      response = await Promise.race([raw, stoppedPromise])
      if (stopped || response.redirected || response.type === 'opaqueredirect' ||
        response.status < 200 || response.status >= 300 && response.status < 400 && response.status !== 304) throw unavailable()

      const success = response.ok
      if (success && (response.status === 206 || response.headers.has('content-range'))) throw unavailable()
      const length = response.headers.get('content-length')
      let advertised: number | null = null
      if (length !== null) {
        if (!/^(0|[1-9][0-9]*)$/.test(length)) {
          if (success) throw unavailable()
          cancel(response.body)
          return emptyError(response.status)
        }
        advertised = Number(length)
        if (!Number.isSafeInteger(advertised) || advertised > (success ? successLimit : errorLimit)) {
          if (success) throw unavailable()
          advertised = null
          cancel(response.body)
          return emptyError(response.status)
        }
      }

      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      let complete = !reader
      let errorTimer: ReturnType<typeof setTimeout> | undefined
      const errorDeadline = success ? undefined : new Promise<null>(resolve => {
        errorTimer = setTimeout(() => resolve(null), errorBodyMs)
      })
      try {
        while (reader && !complete) {
          const part = await Promise.race([reader.read(), stoppedPromise, ...(errorDeadline ? [errorDeadline] : [])])
          if (part === null) break
          if (part.done) { complete = true; break }
          size += part.value.byteLength
          if (size > (success ? successLimit : errorLimit)) break
          chunks.push(part.value)
        }
      } finally {
        if (errorTimer) clearTimeout(errorTimer)
        if (!complete) {
          try { void reader?.cancel().catch(() => {}) } catch { /* Best effort. */ }
        }
      }
      if (stopped) throw unavailable()
      if (!complete || advertised !== null && advertised !== size) {
        if (success) throw unavailable()
        return emptyError(response.status)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      if (success) {
        try {
          const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw unavailable()
        } catch { throw unavailable() }
      }
      // Keep only a safe content type. The sanitizer strips the error body and
      // retains its one allowed revoked-session classification.
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : bytes, {
        status: response.status,
        statusText: success ? 'OK' : 'Authentication request failed',
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      cancel(response?.body ?? null)
      if (deadlineExpired && response && !response.ok) return emptyError(response.status)
      throw unavailable()
    } finally {
      clearTimeout(timer)
      for (const signal of signals) signal.removeEventListener('abort', stop)
    }
  }
}
