// Expose authenticated account preset reads and writes through one guarded server path.
import { NextRequest } from 'next/server'
import { handleAntePresets } from '../../../../lib/server/ante-presets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleAntePresets(request, 'read')
}

export async function PUT(request: NextRequest) {
  return handleAntePresets(request, 'write')
}
