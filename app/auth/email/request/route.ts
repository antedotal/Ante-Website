// Request a one-time email code through the shared guarded server path.
import { NextRequest } from 'next/server'
import { handleEmailAuth } from '../../../../lib/server/email-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleEmailAuth(request, 'request')
}
