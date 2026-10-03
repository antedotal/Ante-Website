import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

vi.mock('server-only', () => ({}))

type CookieWrite = { name: string; value: string; options?: { maxAge?: number; path?: string; sameSite?: 'strict' | 'lax' | 'none'; secure?: boolean; httpOnly?: boolean } }
type FakeClient = { read: () => { name: string; value: string }[]; write: (cookies: CookieWrite[]) => void }
const clients: FakeClient[] = []

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    const client: FakeClient = {
      read: () => options.cookies.getAll(),
      write: (cookies) => options.cookies.setAll(cookies),
    }
    clients.push(client)
    return client
  }),
}))

beforeEach(() => {
  clients.length = 0
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
  process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
})

describe('isolated account cookie stages', () => {
  it('passes a successful response through without reading its stream or changing status and headers', async () => {
    const { createIsolatedAccountStage } = await import('../lib/supabase/isolated-account-stage')
    const response = new Response(JSON.stringify({ user: { id: 'verified' } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
    })
    vi.stubGlobal('fetch', vi.fn(async () => response))
    try {
      createIsolatedAccountStage(new NextRequest('https://ante.test/'))
      const fetcher = vi.mocked(createServerClient).mock.lastCall?.[2]?.global?.fetch
      expect(fetcher).toBeDefined()
      const result = await fetcher!('https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/user')
      expect(result).toBe(response)
      expect(result.status).toBe(200)
      expect(result.headers.get('x-supabase-api-version')).toBe('2024-01-01')
      expect(result.bodyUsed).toBe(false)
      expect(await result.json()).toEqual({ user: { id: 'verified' } })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps refresh writes out of the incoming request and response until explicitly applied', async () => {
    const { createIsolatedAccountStage, applyAccountCookieStages } = await import('../lib/supabase/isolated-account-stage')
    const request = new NextRequest('https://ante.test/api/account/email-change/request', { headers: { cookie: 'sb-auth=old; other=untouched' } })
    const stage = createIsolatedAccountStage(request)
    const response = NextResponse.json({ ok: true })
    expect((stage.client as unknown as FakeClient).read()).toEqual([{ name: 'sb-auth', value: 'old' }, { name: 'other', value: 'untouched' }])
    const copied = (stage.client as unknown as FakeClient).read()
    copied[0].value = 'tampered'
    copied.push({ name: 'injected', value: 'bad' })
    expect((stage.client as unknown as FakeClient).read()).toEqual([{ name: 'sb-auth', value: 'old' }, { name: 'other', value: 'untouched' }])
    ;(stage.client as unknown as FakeClient).write([{ name: 'sb-auth', value: 'refreshed', options: { httpOnly: true, path: '/bad', sameSite: 'strict', secure: false } }])
    expect(request.cookies.get('sb-auth')?.value).toBe('old')
    expect(response.cookies.getAll()).toEqual([])
    expect((stage.client as unknown as FakeClient).read().find((cookie) => cookie.name === 'sb-auth')?.value).toBe('refreshed')
    applyAccountCookieStages(response, stage)
    expect(response.cookies.get('sb-auth')?.value).toBe('refreshed')
    expect(response.cookies.get('sb-auth')?.path).toBe('/')
    expect(response.cookies.get('sb-auth')?.sameSite).toBe('lax')
    expect(response.cookies.get('sb-auth')?.secure).toBe(true)
    expect(response.cookies.get('sb-auth')?.httpOnly).toBe(true)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('pragma')).toBe('no-cache')
  })

  it('forks independent jars and preserves baseline refresh when a child is discarded', async () => {
    const { createIsolatedAccountStage, applyAccountCookieStages } = await import('../lib/supabase/isolated-account-stage')
    const request = new NextRequest('https://ante.test/', { headers: { cookie: 'sb-auth=old' } })
    const baseline = createIsolatedAccountStage(request)
    ;(baseline.client as unknown as FakeClient).write([{ name: 'sb-auth', value: 'refreshed' }])
    const first = baseline.fork()
    const second = baseline.fork()
    ;(first.client as unknown as FakeClient).write([{ name: 'sb-auth', value: 'hostile' }, { name: 'child-only', value: 'secret' }])
    expect((second.client as unknown as FakeClient).read()).toEqual([{ name: 'sb-auth', value: 'refreshed' }])
    const response = NextResponse.json({ error: 'fixed' }, { status: 503 })
    applyAccountCookieStages(response, baseline)
    expect(response.cookies.get('sb-auth')?.value).toBe('refreshed')
    expect(response.cookies.get('child-only')).toBeUndefined()
    expect(request.cookies.get('sb-auth')?.value).toBe('old')
  })

  it('applies accepted child replacement and chunk deletion after baseline writes', async () => {
    const { createIsolatedAccountStage, applyAccountCookieStages } = await import('../lib/supabase/isolated-account-stage')
    const baseline = createIsolatedAccountStage(new NextRequest('https://ante.test/', { headers: { cookie: 'sb-auth.0=old0; sb-auth.1=old1' } }))
    ;(baseline.client as unknown as FakeClient).write([
      { name: 'sb-auth.0', value: 'refresh0' }, { name: 'sb-auth.1', value: 'refresh1' },
    ])
    const child = baseline.fork()
    ;(child.client as unknown as FakeClient).write([
      { name: 'sb-auth.0', value: 'new0' }, { name: 'sb-auth.1', value: '', options: { maxAge: 0 } },
    ])
    const response = NextResponse.json({ ok: true })
    applyAccountCookieStages(response, baseline, child)
    expect(response.cookies.get('sb-auth.0')?.value).toBe('new0')
    expect(response.cookies.get('sb-auth.1')?.value).toBe('')
    expect(response.cookies.get('sb-auth.1')?.maxAge).toBe(0)
    expect((child.client as unknown as FakeClient).read()).toEqual([{ name: 'sb-auth.0', value: 'new0' }])
    expect((baseline.client as unknown as FakeClient).read()).toEqual([{ name: 'sb-auth.0', value: 'refresh0' }, { name: 'sb-auth.1', value: 'refresh1' }])
  })
})
