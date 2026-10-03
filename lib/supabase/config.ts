// Require explicit public credentials for account auth; marketing's fallback client is never trusted here.
export function accountConfig(): { url: string; key: string; siteOrigin: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const siteOrigin = process.env.NEXT_PUBLIC_ANTE_SITE_ORIGIN

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for account sign-in')
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required for account sign-in')
  if (!siteOrigin) throw new Error('NEXT_PUBLIC_ANTE_SITE_ORIGIN is required for account sign-in')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid Supabase project URL')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || /placeholder|example|your[-_]/i.test(parsed.hostname)) {
    throw new Error('Invalid Supabase project URL')
  }

  let site: URL
  try {
    site = new URL(siteOrigin)
  } catch {
    throw new Error('Invalid account site origin')
  }
  const local = site.hostname === 'localhost' || site.hostname === '127.0.0.1'
  if ((!local && site.protocol !== 'https:') || (local && !['http:', 'https:'].includes(site.protocol)) || site.username || site.password || site.pathname !== '/' || site.search || site.hash || site.hostname === 'example.com' || site.hostname.endsWith('.example') || /placeholder|your[-_]/i.test(site.hostname)) {
    throw new Error('Invalid account site origin')
  }

  // Publishable keys are public by design; legacy JWT keys are accepted only when their role is anon.
  const publishable = key.startsWith('sb_publishable_') && !/placeholder|example|your[-_]/i.test(key)
  let legacyAnon = false
  if (!publishable && key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1] ?? '')) as { role?: unknown }
      legacyAnon = payload.role === 'anon'
    } catch {
      legacyAnon = false
    }
  }
  if (!publishable && !legacyAnon) throw new Error('Invalid public Supabase key')

  return { url: parsed.origin, key, siteOrigin: site.origin }
}

// Pin one cookie policy across browser, server, callback and proxy clients.
export function accountCookieOptions(siteOrigin: string) {
  return { path: '/', sameSite: 'lax' as const, secure: new URL(siteOrigin).protocol === 'https:' }
}
