// Verify a supplied email code and return session cookies through the guarded server path.
import { NextRequest } from 'next/server'
import { handleEmailAuth } from '../../../../lib/server/email-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleEmailAuth(request, 'verify')
}
