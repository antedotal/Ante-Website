// Limit SDK log sanitization to Auth requests on the configured Supabase project.
import 'server-only'

const safeBody = JSON.stringify({ code: 'auth_error', msg: 'Authentication request failed' })
const revokedBody = JSON.stringify({ code: 'auth_error', error_code: 'session_not_found', msg: 'Authentication request failed' })
const maxErrorBytes = 2048
const errorReadTimeoutMs = 1000

// Preserve the one provider classification the installed SDK needs to remove
// revoked session and PKCE cookies. Bound both bytes and time, and discard all
// other provider data without allowing parse failures into SDK errors or logs.
async function isRevokedSession(response: Response): Promise<boolean> {
  if (!response.body) return false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = Symbol('Auth error body timed out')
  try {
    reader = response.body.getReader()
    const deadline = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), errorReadTimeoutMs)
    })
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const part = await Promise.race([reader.read(), deadline])
      if (part === timedOut) return false
      if (part.done) break
      total += part.value.byteLength
      if (total > maxErrorBytes) return false
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof data !== 'object' || data === null) return false
    const body = data as Record<string, unknown>
    return body.code === 'session_not_found' || body.error_code === 'session_not_found'
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
    try { void reader?.cancel().catch(() => {}) } catch { /* Cancellation is best effort. */ }
  }
}

export function createAuthFetch(projectUrl: string, transport?: typeof fetch): typeof fetch {
  const projectOrigin = new URL(projectUrl).origin
  return async (input, init) => {
    let requestUrl: URL
    try {
      // Fetch accepts these three input shapes; parse before transport so malformed
      // inputs cannot carry tokens into an SDK-logged URL parsing error.
      requestUrl = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input)
    } catch {
      throw new Error('Invalid Auth request URL')
    }
    const isAuth = requestUrl.origin === projectOrigin &&
      (requestUrl.pathname === '/auth/v1' || requestUrl.pathname.startsWith('/auth/v1/'))
    if (!isAuth) return (transport ?? fetch)(input, init)

    let response: Response
    try {
      response = await (transport ?? fetch)(input, init)
    } catch {
      throw new Error('Auth transport unavailable')
    }
    if (!response.ok) {
      const body = await isRevokedSession(response)
        ? revokedBody : safeBody
      // Fetch forbids a 304 body. Keep its numeric status and supply the same
      // fixed envelope to SDK callers that parse errors through json().
      const safeResponse = new Response(response.status === 304 ? null : body, {
        status: response.status,
        statusText: 'Authentication request failed',
        headers: { 'content-type': 'application/json' },
      })
      if (response.status === 304) safeResponse.json = async () => JSON.parse(body)
      return safeResponse
    }

    // Preserve the successful Response and stream; only hide malformed JSON
    // details when the SDK eventually calls json().
    const parseJson = response.json.bind(response)
    response.json = async () => {
      try { return await parseJson() }
      catch { throw new SyntaxError('Invalid Auth response JSON') }
    }
    return response
  }
}
