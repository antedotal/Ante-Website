// Exercise the account configuration boundary so marketing placeholders cannot authorize users.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountConfig } from '../lib/supabase/config'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
})

describe('account configuration', () => {
  it('rejects missing and placeholder project settings', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(() => accountConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example'
    process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
    expect(() => accountConfig()).toThrow(/Supabase/)
  })

  it('accepts a configured project and rejects a secret key in the public slot', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
    process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test'
    expect(accountConfig()).toEqual({
      url: 'https://yxilmwxptfnebnjsikwo.supabase.co',
      key: 'sb_publishable_testvalue',
      siteOrigin: 'https://ante.test',
    })
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_do-not-expose'
    expect(() => accountConfig()).toThrow(/key/i)
  })

  it('rejects an absent or malformed canonical website origin', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yxilmwxptfnebnjsikwo.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testvalue'
    delete process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN
    expect(() => accountConfig()).toThrow(/SITE_ORIGIN/)
    process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://ante.test/attacker/path'
    expect(() => accountConfig()).toThrow(/site origin/i)
    process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN = 'https://example.com'
    expect(() => accountConfig()).toThrow(/site origin/i)
  })
})
