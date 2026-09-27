// Server-only photo provider requests; route authorization remains the caller's responsibility.
import 'server-only'
import { accountConfig } from '../supabase/config'
import { boundedProviderRequest } from './bounded-provider-request'
import type { ValidatedProfilePhoto } from './profile-photo'
import { serviceCredential } from './service-credential'

export type StoredProfilePhoto = { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png' }
export type PhotoMutationResult = { kind: 'ok' } | { kind: 'unavailable' }
export type PhotoReadResult = ({ kind: 'found' } & StoredProfilePhoto) | { kind: 'not_found' } | { kind: 'unavailable' }
export type PhotoProfileResult = { kind: 'exists' } | { kind: 'missing' } | { kind: 'unavailable' }

const unavailable = { kind: 'unavailable' } as const
const photoCap = 2097152
const jsonCap = 16384
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Reject path components before deriving a legacy provider key.
export function profilePhotoKey(ownerId: string): string | null {
  return uuid.test(ownerId) ? `${ownerId}/avatar` : null
}

function callerSuitable(token: string): boolean {
  return typeof token === 'string' && token.length <= 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function jsonBody(bytes: Uint8Array): Record<string, unknown> | null {
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) } catch { return null }
}

function authHeaders(key: string, bearer?: string): Record<string, string> {
  return { apikey: key, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }
}

// Accept only the published resolver union before deriving a private Storage key.
async function resolvedPhotoKey(url: string, publicKey: string, ownerId: string, callerToken: string, signal?: AbortSignal): Promise<{ kind: 'key'; key: string } | { kind: 'not_found' } | { kind: 'unavailable' }> {
  const result = await boundedProviderRequest(`${url}/rest/v1/rpc/resolve_profile_photo_v1`, {
    method: 'POST', headers: { ...authHeaders(publicKey, callerToken), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ p_owner: ownerId }), cache: 'no-store', redirect: 'error',
  }, jsonCap, { signal })
  if (!result || result.response.status !== 200 || result.response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return unavailable
  const body = jsonBody(result.bytes)
  if (!body) return unavailable
  const keys = Object.keys(body)
  if (keys.length === 1 && body.kind === 'not_found') return { kind: 'not_found' }
  if (keys.length === 1 && body.kind === 'legacy') return { kind: 'key', key: `${ownerId}/avatar` }
  if (keys.length === 2 && body.kind === 'current' && typeof body.asset_id === 'string' && uuid.test(body.asset_id)) {
    return { kind: 'key', key: `${ownerId}/${body.asset_id}` }
  }
  return unavailable
}

// Upload one already-validated original image; require the provider to confirm its exact key.
export async function putProfilePhoto(ownerId: string, photo: ValidatedProfilePhoto, signal?: AbortSignal): Promise<PhotoMutationResult> {
  const key = profilePhotoKey(ownerId)
  if (!key || !photo || !(photo.bytes instanceof Uint8Array) || photo.bytes.length < 1 || photo.bytes.length > photoCap ||
    photo.contentType !== 'image/jpeg' && photo.contentType !== 'image/png') return unavailable
  const credential = serviceCredential()
  if (!credential) return unavailable
  try {
    const { url } = accountConfig()
    const response = await boundedProviderRequest(`${url}/storage/v1/object/profile-photos/${key}`, {
      method: 'POST', headers: {
        ...authHeaders(credential.key, credential.bearer ? credential.key : undefined),
        'content-type': photo.contentType, 'cache-control': 'max-age=0', 'x-upsert': 'true', accept: 'application/json',
      }, body: photo.bytes.slice() as BodyInit, cache: 'no-store', redirect: 'error',
    }, jsonCap, { signal })
    if (!response || response.response.status < 200 || response.response.status >= 300) return unavailable
    const body = jsonBody(response.bytes)
    return body?.Key === `profile-photos/${key}` && (!Object.hasOwn(body, 'Id') || typeof body.Id === 'string' && body.Id.length > 0)
      ? { kind: 'ok' } : unavailable
  } catch { return unavailable }
}

// A precise missing-object reply makes this single-key DELETE idempotent; other uncertainty fails closed.
export async function deleteProfilePhoto(ownerId: string, signal?: AbortSignal): Promise<PhotoMutationResult> {
  const key = profilePhotoKey(ownerId)
  if (!key) return unavailable
  const credential = serviceCredential()
  if (!credential) return unavailable
  try {
    const { url } = accountConfig()
    const result = await boundedProviderRequest(`${url}/storage/v1/object/profile-photos/${key}`, {
      method: 'DELETE', headers: { ...authHeaders(credential.key, credential.bearer ? credential.key : undefined), accept: 'application/json' },
      cache: 'no-store', redirect: 'error',
    }, jsonCap, { signal })
    if (!result) return unavailable
    const body = jsonBody(result.bytes)
    if (result.response.status === 200 && body?.message === 'Successfully deleted') return { kind: 'ok' }
    if (result.response.status === 400 && body?.statusCode === '404' && body.code === 'NoSuchKey' && body.error === 'not_found') return { kind: 'ok' }
    return unavailable
  } catch { return unavailable }
}

// Resolve the visible generation and read it through Storage RLS using the same caller token.
export async function downloadProfilePhoto(targetId: string, callerToken: string, signal?: AbortSignal): Promise<PhotoReadResult> {
  if (!profilePhotoKey(targetId) || !callerSuitable(callerToken)) return unavailable
  try {
    const { url, key: publicKey } = accountConfig()
    const selected = await resolvedPhotoKey(url, publicKey, targetId, callerToken, signal)
    if (selected.kind !== 'key') return selected
    const key = selected.key
    const result = await boundedProviderRequest(`${url}/storage/v1/object/authenticated/profile-photos/${key}`, {
      method: 'GET', headers: authHeaders(publicKey, callerToken), cache: 'no-store', redirect: 'error',
    }, photoCap, { signal })
    if (!result) return unavailable
    const { response, bytes } = result
    if (response.status === 200) {
      const contentType = response.headers.get('content-type')
      return bytes.length > 0 && (contentType === 'image/jpeg' || contentType === 'image/png')
        ? { kind: 'found', bytes, contentType } : unavailable
    }
    if (response.status !== 400) return unavailable
    const error = jsonBody(bytes)
    return error && (
      error.statusCode === '404' && (error.code === 'NoSuchKey' || error.code === 'NoSuchBucket') ||
      error.statusCode === '403' && error.code === 'AccessDenied'
    ) ? { kind: 'not_found' } : unavailable
  } catch { return unavailable }
}

// Owner existence is checked with caller-scoped RLS; malformed or duplicate rows never authorize writes.
export async function photoOwnerProfile(ownerId: string, callerToken: string, signal?: AbortSignal): Promise<PhotoProfileResult> {
  if (!profilePhotoKey(ownerId) || !callerSuitable(callerToken)) return unavailable
  try {
    const { url, key: publicKey } = accountConfig()
    const result = await boundedProviderRequest(`${url}/rest/v1/profiles?select=id&id=eq.${ownerId}&limit=2`, {
      method: 'GET', headers: { ...authHeaders(publicKey, callerToken), accept: 'application/json' },
      cache: 'no-store', redirect: 'error',
    }, jsonCap, { signal })
    if (!result || result.response.status !== 200) return unavailable
    const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)) as unknown
    if (!Array.isArray(rows)) return unavailable
    if (rows.length === 0) return { kind: 'missing' }
    const row = rows.length === 1 ? record(rows[0]) : null
    return row && Object.keys(row).length === 1 && row.id === ownerId ? { kind: 'exists' } : unavailable
  } catch { return unavailable }
}
