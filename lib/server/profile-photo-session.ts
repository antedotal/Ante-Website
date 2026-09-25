// Establish one verified photo identity and exact bearer token before any owner or Storage action.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createCallbackClient } from '../supabase/server'
import { providerStatus } from './account-session'
import { profilePhotoKey } from './profile-photo-store'

export type VerifiedPhotoSession = { ownerId: string; token: string; provisional: NextResponse }
export type PhotoSessionResult = { kind: 'verified'; session: VerifiedPhotoSession } | { kind: 'failed'; status: 401 | 429 | 503 }

// Fetch the session only to obtain its access token; never read session.user for authority.
export async function verifyProfilePhotoSession(request: NextRequest): Promise<PhotoSessionResult> {
  const provisional = new NextResponse(null, { headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const supabase = createCallbackClient(request, provisional)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) return { kind: 'failed', status: authFailure(sessionError) }
    const token = sessionData?.session?.access_token
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 8192) {
      return { kind: 'failed', status: 401 }
    }
    // Supplying the exact token prevents a later implicit refresh from changing the credential.
    const { data, error } = await supabase.auth.getUser(token)
    if (error) return { kind: 'failed', status: authFailure(error) }
    const ownerId = data?.user?.id
    if (typeof ownerId !== 'string' || !profilePhotoKey(ownerId)) return { kind: 'failed', status: 401 }
    return { kind: 'verified', session: { ownerId, token, provisional } }
  } catch { return { kind: 'failed', status: 503 } }
}

// Auth 4xx means no usable identity; provider uncertainty cannot be treated as a missing user.
function authFailure(error: unknown): 401 | 429 | 503 {
  const status = providerStatus(error)
  if (status === 429) return 429
  return status === null || status === 0 || status === 408 || status >= 500 ? 503 : 401
}
