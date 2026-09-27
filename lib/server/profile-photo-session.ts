// Establish one verified photo identity and exact bearer token before any owner or Storage action.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createCallbackClient } from '../supabase/server'
import { providerStatus } from './account-session'
import { profilePhotoKey } from './profile-photo-store'
import { createProfilePhotoAuthFetch } from './profile-photo-auth-fetch'
import { accountConfig } from '../supabase/config'

export type VerifiedPhotoSession = { ownerId: string; token: string; provisional: NextResponse }
export type PhotoSessionResult = { kind: 'verified'; session: VerifiedPhotoSession } | { kind: 'failed'; status: 401 | 429 | 503 }

// Fetch the session only to obtain its access token; never read session.user for authority.
export async function verifyProfilePhotoSession(request: NextRequest, signal?: AbortSignal): Promise<PhotoSessionResult> {
  const provisional = new NextResponse(null, { headers: { 'Cache-Control': 'private, no-store' } })
  const controller = new AbortController()
  const interrupted = Symbol('Photo session interrupted')
  let wake!: (value: typeof interrupted) => void
  const interruption = new Promise<typeof interrupted>(resolve => { wake = resolve })
  const abort = () => { if (!controller.signal.aborted) { controller.abort(); wake(interrupted) } }
  const signals = [request.signal, signal].filter((candidate): candidate is AbortSignal => !!candidate)
  for (const candidate of signals) candidate.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 30_000)
  if (signals.some(candidate => candidate.aborted)) abort()
  const wait = async <T>(operation: () => Promise<T>): Promise<T | typeof interrupted> => {
    if (controller.signal.aborted) return interrupted
    const result = await Promise.race([Promise.resolve().then(async () => {
      if (controller.signal.aborted) return interrupted
      return await operation()
    }), interruption])
    return controller.signal.aborted ? interrupted : result
  }
  try {
    if (controller.signal.aborted) return { kind: 'failed', status: 503 }
    const supabase = createCallbackClient(request, provisional, createProfilePhotoAuthFetch(accountConfig().url, controller.signal))
    const sessionResult = await wait(() => supabase.auth.getSession())
    if (sessionResult === interrupted) return { kind: 'failed', status: 503 }
    const { data: sessionData, error: sessionError } = sessionResult
    if (sessionError) return { kind: 'failed', status: authFailure(sessionError) }
    const token = sessionData?.session?.access_token
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 8192) {
      return { kind: 'failed', status: 401 }
    }
    // Supplying the exact token prevents a later implicit refresh from changing the credential.
    const userResult = await wait(() => supabase.auth.getUser(token))
    if (userResult === interrupted) return { kind: 'failed', status: 503 }
    const { data, error } = userResult
    if (error) return { kind: 'failed', status: authFailure(error) }
    const ownerId = data?.user?.id
    // A successful Auth reply without a canonical identity is a provider protocol failure.
    if (typeof ownerId !== 'string' || !profilePhotoKey(ownerId)) return { kind: 'failed', status: 503 }
    return { kind: 'verified', session: { ownerId, token, provisional } }
  } catch { return { kind: 'failed', status: 503 } }
  finally {
    clearTimeout(timer)
    for (const candidate of signals) candidate.removeEventListener('abort', abort)
  }
}

// Only actual authentication-class 4xx replies mean no usable identity.
function authFailure(error: unknown): 401 | 429 | 503 {
  const status = providerStatus(error)
  if (status === 429) return 429
  return status !== null && status >= 400 && status < 500 && status !== 408 ? 401 : 503
}
