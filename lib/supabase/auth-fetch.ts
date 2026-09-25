// Limit SDK log sanitization to Auth requests on the configured Supabase project.
import 'server-only'

const safeBody = JSON.stringify({ code: 'auth_error', msg: 'Authentication request failed' })

export function createAuthFetch(projectUrl: string): typeof fetch {
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
    if (!isAuth) return fetch(input, init)

    let response: Response
    try {
      response = await fetch(input, init)
    } catch {
      throw new Error('Auth transport unavailable')
    }
    if (!response.ok) {
      // The provider body and headers are not needed for status classification.
      // Cancel its unread stream without waiting for an untrusted cancel promise.
      try { void response.body?.cancel().catch(() => {}) } catch { /* Cancellation is best effort. */ }
      return new Response(safeBody, {
        status: response.status,
        statusText: 'Authentication request failed',
        headers: { 'content-type': 'application/json' },
      })
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
