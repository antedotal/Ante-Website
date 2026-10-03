import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

const url = 'https://auth.example.test'
const key = 'synthetic-public-key'
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'current@example.test',
  new_email: 'next@example.test',
  created_at: '2026-09-25T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
}
const completedUser = {
  id: user.id,
  aud: user.aud,
  role: user.role,
  email: 'next@example.test',
  created_at: user.created_at,
  app_metadata: user.app_metadata,
  user_metadata: user.user_metadata,
  identities: user.identities,
}
const session = {
  access_token: 'synthetic-access-token',
  refresh_token: 'synthetic-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  user: completedUser,
}

function clientFor(response: Response) {
  const fetcher = vi.fn(async () => response)
  const client = createClient(url, key, {
    global: { fetch: fetcher },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return { client, fetcher }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
}

describe('installed Supabase email-change Auth response contract', () => {
  it('parses a first secure confirmation as null identity and installs no session', async () => {
    const { client, fetcher } = clientFor(jsonResponse({ msg: 'Confirmation link accepted. Please confirm the other email.', code: 200 }))
    const events: string[] = []
    const { data: listener } = client.auth.onAuthStateChange((event) => events.push(event))

    const result = await client.auth.verifyOtp({ email: 'current@example.test', token: '001234', type: 'email_change' })

    expect(result).toEqual({ data: { user: null, session: null }, error: null })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [requestUrl, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(requestUrl).toBe(`${url}/auth/v1/verify`)
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toMatchObject({ email: 'current@example.test', token: '001234', type: 'email_change' })
    expect((await client.auth.getSession()).data.session).toBeNull()
    expect(events).not.toContain('SIGNED_IN')
    listener.subscription.unsubscribe()
  })

  it('parses a completed confirmation with a user and session', async () => {
    const { client } = clientFor(jsonResponse(session))
    const result = await client.auth.verifyOtp({ email: 'next@example.test', token: '009876', type: 'email_change' })
    expect(result.error).toBeNull()
    expect(result.data.user).toMatchObject({ id: user.id, email: 'next@example.test' })
    expect(result.data.user).not.toHaveProperty('new_email')
    expect(result.data.session).toMatchObject({ access_token: session.access_token, refresh_token: session.refresh_token })
    expect(result.data.session?.user).toMatchObject({ id: user.id, email: 'next@example.test' })
    expect(result.data.session?.user).not.toHaveProperty('new_email')
    expect((await client.auth.getSession()).data.session?.access_token).toBe(session.access_token)
  })

  it('returns a provider error and no identity for an expired code', async () => {
    const { client } = clientFor(jsonResponse({ code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403))
    const result = await client.auth.verifyOtp({ email: 'current@example.test', token: '001234', type: 'email_change' })
    expect(result.data).toEqual({ user: null, session: null })
    expect(result.error).toMatchObject({ status: 403, code: 'otp_expired' })
    expect((await client.auth.getSession()).data.session).toBeNull()
  })

  it('retains the provider supplied pending address on getUser', async () => {
    const { client, fetcher } = clientFor(jsonResponse({ user }))
    const result = await client.auth.getUser('synthetic-access-token')
    expect(result.error).toBeNull()
    expect(result.data.user).toMatchObject({ id: user.id, email: 'current@example.test', new_email: 'next@example.test' })
    const [requestUrl, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(requestUrl).toBe(`${url}/auth/v1/user`)
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-access-token')
  })
})
