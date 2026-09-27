// Bound server-only provider fetches and body reads under one abortable deadline.
import 'server-only'

const errorCap = 16384

// Cancellation is deliberately fire-and-forget because a hostile stream may never settle it.
function cancelResponse(response: Response): void {
  try { void response.body?.cancel().catch(() => {}) } catch { /* A locked or hostile body is already unusable. */ }
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try { void reader.cancel().catch(() => {}) } catch { /* A hostile reader cannot delay denial. */ }
}

// The caller supplies a fixed provider URL; this helper never chooses a key or credential.
export async function boundedProviderRequest(
  url: string,
  init: RequestInit,
  maxBytes: number,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ response: Response; bytes: Uint8Array } | null> {
  const timeoutMs = options.timeoutMs ?? 10000
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
      options.signal?.aborted || init.signal?.aborted) return null

  // A monotonic boundary also works when a ready stream starves timer callbacks.
  const deadlineAt = performance.now() + timeoutMs
  const pastDeadline = () => performance.now() >= deadlineAt
  const controller = new AbortController()
  let expired = false
  let stopRequest!: () => void
  const stopped = new Promise<null>(resolve => {
    stopRequest = () => { expired = true; controller.abort(); resolve(null) }
  })
  const parentAbort = () => stopRequest()
  options.signal?.addEventListener('abort', parentAbort, { once: true })
  init.signal?.addEventListener('abort', parentAbort, { once: true })
  const timeout = setTimeout(stopRequest, timeoutMs)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  let completed = false
  try {
    if (options.signal?.aborted || init.signal?.aborted || pastDeadline()) return null
    const headers = new Headers(init.headers)
    // Some fetch runtimes own this header; response encoding is still checked below.
    try { headers.set('Accept-Encoding', 'identity') } catch { /* Runtime-controlled header. */ }
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('aborted')
      return fetch(url, { ...init, headers, signal: controller.signal })
    })
    // A response arriving after cancellation must not leave a private stream unread.
    void pending.then(late => { if (expired) cancelResponse(late) }, () => {})
    response = await Promise.race([pending, stopped]) ?? undefined
    if (!response) return null
    if (expired || pastDeadline()) {
      stopRequest()
      cancelResponse(response)
      return null
    }
    if (response.redirected || response.type === 'opaqueredirect' || response.type === 'opaque' ||
        response.status === 206 || response.status >= 300 && response.status < 400 ||
        response.headers.has('content-range')) {
      cancelResponse(response)
      return null
    }
    const encoding = response.headers.get('content-encoding')
    if (encoding !== null && encoding.trim().toLowerCase() !== 'identity') {
      cancelResponse(response)
      return null
    }
    const cap = response.ok ? maxBytes : errorCap
    const declared = response.headers.get('content-length')
    const length = declared === null ? null : Number(declared)
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) ||
        length === null || !Number.isSafeInteger(length) || length > cap)) {
      cancelResponse(response)
      return null
    }
    if (!response.body) {
      if (pastDeadline() || expired) { stopRequest(); return null }
      return length === null || length === 0 ? { response, bytes: new Uint8Array() } : null
    }
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const part = await Promise.race([reader.read(), stopped])
      if (!part || expired || pastDeadline()) { stopRequest(); return null }
      if (part.done) break
      if (!(part.value instanceof Uint8Array) || part.value.length > cap - size) return null
      if (part.value.length === 0) continue
      size += part.value.length
      chunks.push(part.value.slice())
    }
    if (length !== null && size !== length) return null
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    if (pastDeadline() || expired) { stopRequest(); return null }
    completed = true
    return { response, bytes }
  } catch {
    return null
  } finally {
    expired = true
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', parentAbort)
    init.signal?.removeEventListener('abort', parentAbort)
    if (reader) {
      if (completed) reader.releaseLock()
      else cancelReader(reader)
    }
  }
}
