// Share canonical account request checks and bounded JSON parsing across server routes.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'

// Only the configured site may present account requests; writes must carry its Origin.
export function trustedAccountOrigin(request: NextRequest, siteOrigin: string, requireOrigin: boolean) {
  const site = new URL(siteOrigin)
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  return ((!requireOrigin && origin === null) || origin === siteOrigin) &&
    request.nextUrl.origin === siteOrigin && host === site.host &&
    (!forwardedHost || forwardedHost === site.host) &&
    (!forwardedProto || `${forwardedProto}:` === site.protocol)
}

// Read at most 4096 actual bytes, regardless of the stated Content-Length.
export async function boundedAccountJson(request: NextRequest, failure: (status: 400 | 413 | 415) => NextResponse): Promise<unknown | NextResponse> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return failure(415)
  const statedLength = request.headers.get('content-length')
  if (statedLength && /^\d+$/.test(statedLength) && Number(statedLength) > 4096) return failure(413)
  if (!request.body) return failure(400)
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4096) {
        void reader.cancel().catch(() => {})
        return failure(413)
      }
      parts.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return failure(400)
  } finally {
    reader.releaseLock()
  }
}

// JSON values must be ordinary records with precisely the declared fields.
export function exactAccountRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}
