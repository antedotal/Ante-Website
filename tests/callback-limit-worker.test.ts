// Exercise the real admission adapter in workerd; only the external provider is synthetic.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reuse Wrangler's installed runtime/build dependencies without adding a separate harness.
const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler'))
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
const { build } = wranglerRequire('esbuild')

// Bundle authored production code while replacing only the server-only import marker.
async function admissionWorkerScript() {
  const result = await build({
    stdin: {
      contents: `import { consumeCallbackLimit, consumeAccountLimit } from './lib/server/callback-limit-store';
        export default { async fetch(request) {
          const consume = new URL(request.url).pathname === '/account' ? consumeAccountLimit : consumeCallbackLimit;
          return Response.json(await consume('a'.repeat(64)));
        } };`,
      resolveDir: resolve('.'),
    },
    bundle: true, write: false, format: 'esm', platform: 'neutral',
    plugins: [{
      name: 'server-only-marker',
      setup(plugin: {
        onResolve: (options: { filter: RegExp }, callback: () => { path: string; namespace: string }) => void
        onLoad: (options: { filter: RegExp; namespace: string }, callback: () => { contents: string }) => void
      }) {
        plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'marker' }))
        plugin.onLoad({ filter: /.*/, namespace: 'marker' }, () => ({ contents: '' }))
      },
    }],
  })
  return result.outputFiles[0].text
}

// Keep the synthetic bindings and runtime lifecycle identical across admission outcomes.
async function admissionRuntime(outboundService: (request: Request) => Promise<Response>) {
  return new Miniflare(convertV4MiniflareOptions({
    modules: true, script: await admissionWorkerScript(), compatibilityDate: '2026-09-23',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://provider.test',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      NEXT_PUBLIC_ANTE_SITE_ORIGIN: 'https://ante.test',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    },
    outboundService,
  }))
}

describe('admission in the Worker fetch runtime', () => {
  it.each([
    { kind: 'callback', singletonRange: false, unit: null }, { kind: 'account', singletonRange: false, unit: null },
    { kind: 'callback', singletonRange: true, unit: null }, { kind: 'account', singletonRange: true, unit: null },
    { kind: 'callback', singletonRange: true, unit: 'items' }, { kind: 'account', singletonRange: true, unit: 'items' },
  ])('accepts complete $kind RPC JSON with singleton metadata=$singletonRange and unit=$unit', async ({ kind, singletonRange, unit }) => {
    const observations: { path: string; body: string; apikey: string | null; bearer: string | null; cookie: string | null }[] = []
    const mf = await admissionRuntime(async request => {
      observations.push({ path: new URL(request.url).pathname, body: await request.text(),
        apikey: request.headers.get('apikey'), bearer: request.headers.get('authorization'), cookie: request.headers.get('cookie') })
      return new Response('{"allowed": true, "retry_after_seconds": 0}', {
        headers: { 'content-type': 'application/json', 'content-length': '43',
          ...(singletonRange ? { 'content-range': '0-0/*' } : {}), ...(unit ? { 'range-unit': unit } : {}) },
      })
    })
    try {
      const response = await mf.dispatchFetch(`https://ante.test/${kind}`)
      expect(await response.json()).toEqual({ kind: 'allowed' })
      expect(observations).toEqual([{ path: `/rest/v1/rpc/consume_website_${kind}_limit`,
        body: '{"p_visitor_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
        apikey: 'sb_secret_test', bearer: null, cookie: null }])
    } finally { await mf.dispose() }
  }, 20000)

  it('preserves the quota retry interval in a complete 44-byte singleton denial', async () => {
    const mf = await admissionRuntime(async () => new Response('{"allowed": false, "retry_after_seconds": 9}', {
      headers: { 'content-range': '0-0/*', 'content-length': '44' },
    }))
    try {
      const response = await mf.dispatchFetch('https://ante.test/callback')
      expect(await response.json()).toEqual({ kind: 'denied', retryAfter: 9 })
    } finally { await mf.dispose() }
  }, 20000)

  it('does not allow an extra JSON field despite valid singleton metadata', async () => {
    const mf = await admissionRuntime(async () => new Response('{"allowed":true,"retry_after_seconds":0,"extra":true}', {
      headers: { 'content-range': '0-0/*' },
    }))
    try {
      const response = await mf.dispatchFetch('https://ante.test/callback')
      expect(await response.json()).toEqual({ kind: 'unavailable' })
    } finally { await mf.dispose() }
  }, 20000)

  it.each([
    { status: 206, range: '0-0/*', unit: null },
    { status: 200, range: '0-1/*', unit: null },
    { status: 200, range: '0-0/1', unit: null },
    { status: 200, range: 'bytes 0-0/1', unit: null },
    { status: 200, range: '0-0/*', unit: 'bytes' },
    { status: 200, range: '0-0/*', unit: 'unknown' },
  ])('denies partial or unexpected singleton metadata: $status $range $unit', async ({ status, range, unit }) => {
    const mf = await admissionRuntime(async () => new Response('{"allowed":true,"retry_after_seconds":0}', {
      status, headers: { 'content-range': range, 'content-length': '40', ...(unit ? { 'range-unit': unit } : {}) },
    }))
    try {
      const response = await mf.dispatchFetch('https://ante.test/callback')
      expect(await response.json()).toEqual({ kind: 'unavailable' })
    } finally { await mf.dispose() }
  }, 20000)

  it('rejects provider redirects before any second credential-bearing dispatch', async () => {
    const paths: string[] = []
    const mf = await admissionRuntime(async request => {
      const path = new URL(request.url).pathname
      paths.push(path)
      return path === '/redirect-target'
        ? new Response('{"allowed":true,"retry_after_seconds":0}')
        : new Response(null, { status: 307, headers: { location: 'https://provider.test/redirect-target' } })
    })
    try {
      const response = await mf.dispatchFetch('https://ante.test/callback')
      expect(await response.json()).toEqual({ kind: 'unavailable' })
      expect(paths).toEqual(['/rest/v1/rpc/consume_website_callback_limit'])
    } finally { await mf.dispose() }
  }, 20000)
})
