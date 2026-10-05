// Expose authenticated account preset reads and writes through one guarded server path.
import { NextRequest, NextResponse } from 'next/server'
import { handleAntePresets } from '../../../../lib/server/ante-presets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleAntePresets(request, 'read')
}

export async function PUT(request: NextRequest) {
  return handleAntePresets(request, 'write')
}

// Override Next's automatic HEAD-to-GET and OPTIONS handling so no other method reaches Auth or the read quota.
function methodNotAllowed() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: 'GET, PUT', 'Cache-Control': 'private, no-store' },
  })
}

export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const POST = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
