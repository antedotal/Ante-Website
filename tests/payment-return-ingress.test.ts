// Exercise the authored Worker entry in workerd; only generated OpenNext and decoder imports are inert sentinels.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paymentReturnIngressResponse } from '../lib/payments/payment-return-ingress'
import { productionOriginResponse } from '../lib/production-origin'

// Reuse Wrangler's installed bundler/runtime, without installing or importing server application dependencies.
const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler'))
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
const { build } = wranglerRequire('esbuild')

// Keep the actual entry's import and fetch order; a downstream sentinel makes any accidental invocation observable.
async function entryBundle() {
  return build({
    entryPoints: [resolve('worker-entry.mjs')], bundle: true, write: false,
    format: 'esm', platform: 'neutral', metafile: true,
    plugins: [{
      name: 'generated-worker-sentinels',
      setup(plugin: {
        onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void
        onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string }) => void
      }) {
        plugin.onResolve({ filter: /^(\.\/\.open-next\/worker\.js|@jsquash\/.*\.wasm)$/ }, args => ({ path: args.path, namespace: 'sentinel' }))
        plugin.onLoad({ filter: /.*/, namespace: 'sentinel' }, args => ({ contents: args.path.endsWith('.wasm')
          ? 'export default new Uint8Array();'
          : `export const DOQueueHandler = class {}; export const DOShardedTagCache = class {}; export const BucketCachePurge = class {};
            export default { fetch(request) { return new Response(request.url, { status: 418, headers: { 'X-OpenNext-Called': 'true' } }); } };` }))
      },
    }],
  })
}

// Use the real Worker Fetch API with no provider route; redirects are observed as first-hop responses.
async function entryRuntime() {
  const bundle = await entryBundle()
  return new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-09-25', outboundService: () => { throw new Error('Unexpected outbound dispatch') } }))
}

describe('payment return first Worker hop', () => {
  it('drops the old www first-hop query leak before OpenNext', async () => {
    const runtime = await entryRuntime()
    try {
      const response = await runtime.dispatchFetch('https://www.antedotal.com/account/payments/return?client_secret=seti_secret&status=succeeded', { redirect: 'manual' })
      expect(response.headers.get('Location')).toBe('https://antedotal.com/account/payments')
      expect(response.status).toBe(303)
      expect(response.headers.get('X-OpenNext-Called')).toBeNull()
    } finally { await runtime.dispose() }
  }, 20000)
})

// Assert the complete fixed privacy contract on success and denial, including absence of ambient metadata.
async function expectPrivateReply(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(await response.text()).toBe('')
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(response.headers.get('Pragma')).toBe('no-cache')
  expect(response.headers.get('Expires')).toBe('0')
  for (const header of ['Set-Cookie', 'Vary', 'ETag', 'Last-Modified', 'X-OpenNext-Called']) {
    expect(response.headers.get(header)).toBeNull()
  }
  expect(response.headers.get('Location')).toBe(status === 303 ? 'https://antedotal.com/account/payments' : null)
  expect(response.headers.get('Allow')).toBe(status === 405 ? 'GET' : null)
}

const hostileHeaders = { Host: 'attacker.test', Origin: 'https://attacker.test',
  'X-Forwarded-Host': 'attacker.test', 'X-Forwarded-Proto': 'http',
  Referer: 'https://attacker.test/?client_secret=referer_secret', Cookie: '__Host-ante-payment-return=invalid',
  Authorization: 'Bearer invalid' }

describe('fixed payment return sanitation', () => {
  it.each(['antedotal.com', 'www.antedotal.com'])('drops all queries on %s with no ambient identity or target input', async host => {
    for (const query of ['', '?client_secret=seti_test_secret&status=succeeded',
      '?state=untrusted&state=second&next=https://attacker.test', '?%63lient_secret=%0d%0aLocation%3Aevil&x=%FF',
      `?client_secret=${'x'.repeat(131072)}`]) {
      await expectPrivateReply(paymentReturnIngressResponse(new Request(`https://${host}/account/payments/return${query}`,
        { headers: hostileHeaders }))!, 303)
    }
  })

  it.each(['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('denies %s without Location, cookies or a body', async method => {
    for (const host of ['antedotal.com', 'www.antedotal.com']) {
      await expectPrivateReply(paymentReturnIngressResponse(new Request(`https://${host}/account/payments/return?secret=discard`,
        { method, headers: hostileHeaders }))!, 405)
    }
  })

  it.each(['http://antedotal.com', 'http://www.antedotal.com', 'https://antedotal.com:444',
    'https://www.antedotal.com:8443'])('denies unsafe scheme/port %s', async origin => {
    await expectPrivateReply(paymentReturnIngressResponse(new Request(`${origin}/account/payments/return?secret=discard`))!, 403)
  })

  it.each(['/account/payments/%72eturn', '/%61ccount/payments/return', '/account%2Fpayments%2Freturn',
    '/account/payments/return/', '//account//payments//return', '/account/payments/return%2f'])
  ('refuses the nonliteral return alias %s before any query-preserving redirect', async path => {
    await expectPrivateReply(paymentReturnIngressResponse(new Request(`https://www.antedotal.com${path}?secret=discard`))!, 403)
  })

  it.each(['/account/other/../payments/return', '/account/payments/%2e/return', '/account/payments/other/%2e%2e/return'])
  ('sanitizes the URL-normalized dot-segment return %s', async path => {
    await expectPrivateReply(paymentReturnIngressResponse(new Request(`https://www.antedotal.com${path}?secret=discard`))!, 303)
  })

  it('accepts the standard HTTPS default port and reads only URL/method', async () => {
    const request = { url: 'https://antedotal.com:443/account/payments/return?secret=discard', method: 'GET',
      get headers() { throw new Error('Headers must not be read') },
      get body() { throw new Error('Body must not be read') } } as unknown as Request
    await expectPrivateReply(paymentReturnIngressResponse(request)!, 303)
  })

  it.each(['http://localhost:3000', 'https://ante-website-backend-preview.example.workers.dev',
    'https://acceptance.antedotal.com', 'https://www.antedotal.com.attacker.test', 'https://antedotal.com.'])
  ('leaves preview/local/hostile host handling unchanged on %s', origin => {
    expect(paymentReturnIngressResponse(new Request(`${origin}/account/payments/return?secret=discard`,
      { headers: hostileHeaders }))).toBeNull()
  })

  it.each(['/account/billing/return', '/account/payments', '/auth/callback', '/account/payments/return-other',
    '/account/payments/return%FF', '/account/payments/%2572eturn'])('preserves ordinary www routing for %s', path => {
    const request = new Request(`https://www.antedotal.com${path}?code=a%2Fb&next=%2Faccount`)
    expect(paymentReturnIngressResponse(request)).toBeNull()
    expect(productionOriginResponse(request)!.headers.get('Location')).toBe(`https://antedotal.com${path}?code=a%2Fb&next=%2Faccount`)
  })
})

describe('authored entry order and Worker-safe dependency graph', () => {
  it('sanitizes both hosts and refuses aliases before OpenNext, preserving unrelated routing', async () => {
    const runtime = await entryRuntime()
    try {
      for (const host of ['antedotal.com', 'www.antedotal.com']) {
        for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
          await expectPrivateReply(await runtime.dispatchFetch(`https://${host}/account/payments/return?client_secret=seti_test_secret`,
            { method, headers: hostileHeaders, redirect: 'manual' }), method === 'GET' ? 303 : 405)
        }
      }
      for (const path of ['/account/payments/%72eturn', '/account/payments/return/', '//account//payments//return',
        '/account%2Fpayments%2Freturn']) {
        await expectPrivateReply(await runtime.dispatchFetch(`https://www.antedotal.com${path}?secret=discard`, { redirect: 'manual' }), 403)
      }
      for (const origin of ['http://www.antedotal.com', 'https://www.antedotal.com:444']) {
        await expectPrivateReply(await runtime.dispatchFetch(`${origin}/account/payments/return?secret=discard`, { redirect: 'manual' }), 403)
      }
      const ordinary = await runtime.dispatchFetch('https://www.antedotal.com/auth/callback?code=a%2Fb', { redirect: 'manual' })
      expect(ordinary.status).toBe(308)
      expect(ordinary.headers.get('Location')).toBe('https://antedotal.com/auth/callback?code=a%2Fb')
      const unsafe = await runtime.dispatchFetch('https://www.antedotal.com/api/account/profile', { method: 'POST', redirect: 'manual' })
      expect(unsafe.status).toBe(403)
      expect(unsafe.headers.get('Location')).toBeNull()
      for (const origin of ['http://localhost:3000', 'https://preview.example.workers.dev', 'https://attacker.test']) {
        const untouched = await runtime.dispatchFetch(`${origin}/account/payments/return?state=unchanged`, { redirect: 'manual' })
        expect(untouched.status).toBe(418)
        expect(await untouched.text()).toBe(`${origin}/account/payments/return?state=unchanged`)
      }
    } finally { await runtime.dispose() }
  }, 20000)

  it('bundles only the pure ingress, existing origin helper, authored entry and explicit generated sentinels', async () => {
    const inputs = Object.keys((await entryBundle()).metafile.inputs).sort()
    expect(inputs.filter(path => !path.startsWith('sentinel:'))).toEqual([
      'lib/payments/payment-return-ingress.ts', 'lib/production-origin.ts', 'worker-entry.mjs',
    ])
    expect(inputs.filter(path => path.startsWith('sentinel:'))).toHaveLength(3)
  })
})
