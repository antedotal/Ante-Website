// Share verified account-session and RPC boundary checks without treating cookies as identity.
import 'server-only'
import { NextResponse } from 'next/server'
import { createCallbackClient } from '../supabase/server'

// Supabase errors are untrusted objects, so inspect only the fields used for safe status mapping.
export function providerStatus(value: unknown): number | null {
  return value && typeof value === 'object' && 'status' in value && typeof value.status === 'number' ? value.status : null
}

export function providerCode(value: unknown): string | null {
  return value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' ? value.code : null
}

// A failed Auth verification never grants RPC access or returns provisional refresh cookies.
export async function verifyAccountUser(supabase: ReturnType<typeof createCallbackClient>): Promise<null | 401 | 429 | 503> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (providerStatus(error) === 429) return 429
    if (error) {
      const status = providerStatus(error)
      return status === null || status === 0 || status === 408 || status >= 500 ? 503 : 401
    }
    if (!data?.user || typeof data.user.id !== 'string' || !data.user.id) return 401
    return null
  } catch { return 503 }
}

// Copy a refreshed session only after getUser establishes an actual user.
export function withVerifiedCookies(response: NextResponse, provisional: NextResponse) {
  for (const cookie of provisional.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie)
  if (provisional.headers.has('set-cookie')) {
    response.headers.set('Expires', '0')
    response.headers.set('Pragma', 'no-cache')
  }
  return response
}

// Validate the bounded, zoned calendar timestamp emitted by the SQL RPCs.
export function accountTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const offset = match[7]
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return false
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day)
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day && !Number.isNaN(Date.parse(value))
}
