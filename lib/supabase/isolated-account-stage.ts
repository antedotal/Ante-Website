// Keep Auth refresh and mutation cookies local until a route verifies their outcome.
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { accountConfig, accountCookieOptions } from './config'

type CookieWrite = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }
type JarCookie = { name: string; value: string }

export type AccountCookieStage = {
  client: ReturnType<typeof createServerClient>
  fork(): AccountCookieStage
  /** Only apply a stage after its Auth result has passed the route's checks. */
  readonly pending: ReadonlyMap<string, CookieWrite>
}

function makeStage(source: Iterable<JarCookie>): AccountCookieStage {
  const { url, key, siteOrigin } = accountConfig()
  const jar = new Map<string, JarCookie>()
  for (const cookie of source) jar.set(cookie.name, { name: cookie.name, value: cookie.value })
  const pending = new Map<string, CookieWrite>()
  const client = createServerClient(url, key, {
    // Auth SDK 2.106.0 logs a rejected fetch error before returning it. Strip
    // transport and HTTP error bodies on this isolated path before SDK logging.
    global: {
      fetch: async (input, init) => {
        try {
          const response = await fetch(input, init)
          if (response.ok) {
            // Auth parses successful replies with response.json(). A malformed
            // body otherwise puts its raw prefix in the SDK's retry error log.
            // Wrap that one parse operation without reading or replacing the
            // response stream, status, headers, or valid JSON value.
            const parseJson = response.json.bind(response)
            response.json = async () => {
              try { return await parseJson() }
              catch { throw new SyntaxError('Invalid Auth response JSON') }
            }
            return response
          }
          // Routes classify failures by status; provider messages are neither
          // needed for that decision nor safe for the SDK's internal logs.
          return new Response(JSON.stringify({ code: 'auth_error', msg: 'Authentication request failed' }), {
            status: response.status,
            headers: { 'content-type': 'application/json' },
          })
        }
        catch { throw new Error('Auth transport unavailable') }
      },
    },
    cookieOptions: accountCookieOptions(siteOrigin),
    cookies: {
      getAll() { return Array.from(jar.values(), ({ name, value }) => ({ name, value })) },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          const write = { name, value, options: { ...options } }
          pending.set(name, write)
          if (options?.maxAge === 0) jar.delete(name)
          else jar.set(name, { name, value })
        }
      },
    },
  })
  return {
    client,
    fork() { return makeStage(jar.values()) },
    pending,
  }
}

export function createIsolatedAccountStage(request: NextRequest): AccountCookieStage {
  return makeStage(request.cookies.getAll())
}

/** Stage order is significant: a verified later write or removal wins by cookie name. */
export function applyAccountCookieStages(response: NextResponse, ...stages: AccountCookieStage[]): NextResponse {
  const merged = new Map<string, CookieWrite>()
  for (const stage of stages) {
    for (const [name, write] of stage.pending) merged.set(name, write)
  }
  const { siteOrigin } = accountConfig()
  for (const { name, value, options } of merged.values()) {
    response.cookies.set(name, value, { ...options, ...accountCookieOptions(siteOrigin) })
  }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Expires', '0')
  response.headers.set('Pragma', 'no-cache')
  return response
}
