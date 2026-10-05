// Server-only photo provider requests; route authorization remains the caller's responsibility.
import 'server-only'
import { accountConfig } from '../supabase/config'
import { boundedProviderRequest } from './bounded-provider-request'
import type { ValidatedProfilePhoto } from './profile-photo'
import { serviceCredential } from './service-credential'

export type StoredProfilePhoto = { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png' }
export type PhotoMutationResult = { kind: 'ok' } | { kind: 'unavailable' }
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

// Accept only the published scalar resolver union before deriving a private Storage key.
// Its exact PostgREST singleton item metadata is distinct from partial image bytes.
async function resolvePhoto(url: string, publicKey: string, ownerId: string, callerToken: string, signal?: AbortSignal): Promise<{ kind: 'current'; assetId: string } | { kind: 'legacy' } | { kind: 'not_found' } | { kind: 'unavailable' }> {
  const result = await boundedProviderRequest(`${url}/rest/v1/rpc/resolve_profile_photo_v1`, {
    method: 'POST', headers: { ...authHeaders(publicKey, callerToken), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ p_owner: ownerId }), cache: 'no-store', redirect: 'error',
  }, jsonCap, { signal, allowPostgrestSingletonRange: true })
  if (!result || result.response.status !== 200 || !isJson(result.response)) return unavailable
  const body = jsonBody(result.bytes)
  if (!body) return unavailable
  const keys = Object.keys(body)
  if (keys.length === 1 && body.kind === 'not_found') return { kind: 'not_found' }
  if (keys.length === 1 && body.kind === 'legacy') return { kind: 'legacy' }
  if (keys.length === 2 && body.kind === 'current' && typeof body.asset_id === 'string' && uuid.test(body.asset_id)) {
    return { kind: 'current', assetId: body.asset_id }
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

// The private brand prevents accidental construction; it is not an authorization grant.
const selectionBrand: unique symbol = Symbol('CurrentPhotoSelection')
export type CurrentPhotoSelection = Readonly<{ ownerId: string; assetId: string; [selectionBrand]: true }>
export type ProfilePhotoReadManifest = {
  kind: 'current'; asset_id: string; revision: string; sha256: string;
  mime: 'image/jpeg' | 'image/png'; width: number; height: number; byte_count: number; transform_version: string;
}
type CurrentPhotoResult = { kind: 'current'; selection: CurrentPhotoSelection } | { kind: 'not_found' } | { kind: 'unavailable' }
type SelectedPhotoResult = ({ kind: 'found'; manifest: ProfilePhotoReadManifest } & StoredProfilePhoto) | { kind: 'not_found' } | { kind: 'unavailable' }

// Only strict current caller resolution may construct the immutable service lookup inputs.
export async function resolveCurrentProfilePhoto(ownerId: string, callerToken: string, signal?: AbortSignal): Promise<CurrentPhotoResult> {
  if (!uuid.test(ownerId) || !callerSuitable(callerToken)) return unavailable
  try {
    const { url, key } = accountConfig()
    const resolved = await resolvePhoto(url, key, ownerId, callerToken, signal)
    if (resolved.kind === 'legacy') return { kind: 'not_found' }
    if (resolved.kind !== 'current') return resolved
    return { kind: 'current', selection: Object.freeze({ ownerId, assetId: resolved.assetId, [selectionBrand]: true as const }) }
  } catch { return unavailable }
}

// Validate all fields before any bytes are requested; revisions stay decimal strings, never Numbers.
function parseManifest(body: Record<string, unknown> | null, assetId: string): ProfilePhotoReadManifest | null {
  if (!body || Object.keys(body).length !== 9 || body.kind !== 'current' || body.asset_id !== assetId ||
      typeof body.revision !== 'string' || !/^[1-9][0-9]{0,18}$/.test(body.revision) || BigInt(body.revision) > BigInt('9223372036854775807') ||
      typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.sha256) ||
      body.mime !== 'image/jpeg' && body.mime !== 'image/png' ||
      typeof body.width !== 'number' || !Number.isInteger(body.width) || body.width < 1 ||
      typeof body.height !== 'number' || !Number.isInteger(body.height) || body.height < 1 ||
      !(body.width <= 1920 && body.height <= 1080 || body.width <= 1080 && body.height <= 1920) ||
      typeof body.byte_count !== 'number' || !Number.isInteger(body.byte_count) || body.byte_count < 1 || body.byte_count > photoCap ||
      typeof body.transform_version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(body.transform_version)) return null
  return body as ProfilePhotoReadManifest
}

function validSelection(selection: CurrentPhotoSelection): boolean {
  return !!selection && selection[selectionBrand] === true && Object.isFrozen(selection) && uuid.test(selection.ownerId) && uuid.test(selection.assetId)
}

function isJson(response: Response): boolean {
  return response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

// Attest one selected object's exact normalized bytes through the fixed service endpoints, without retries.
export async function readSelectedProfilePhoto(selection: CurrentPhotoSelection, signal?: AbortSignal): Promise<SelectedPhotoResult> {
  if (!validSelection(selection) || signal?.aborted) return unavailable
  const credential = serviceCredential()
  if (!credential) return unavailable
  try {
    const { url } = accountConfig()
    const headers = authHeaders(credential.key, credential.bearer ? credential.key : undefined)
    // The fixed scalar manifest shares resolver metadata; the object GET stays default-deny.
    const result = await boundedProviderRequest(`${url}/rest/v1/rpc/profile_photo_read_manifest_v1`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ p_owner: selection.ownerId, p_asset_id: selection.assetId }), cache: 'no-store', redirect: 'error',
    }, jsonCap, { signal, allowPostgrestSingletonRange: true })
    if (!result || result.response.status !== 200 || !isJson(result.response)) return unavailable
    const body = jsonBody(result.bytes)
    if (body?.kind === 'not_found' && Object.keys(body).length === 1) return { kind: 'not_found' }
    const manifest = parseManifest(body, selection.assetId)
    if (!manifest) return unavailable
    const object = await boundedProviderRequest(`${url}/storage/v1/object/profile-photos/${selection.ownerId}/${selection.assetId}`, {
      method: 'GET', headers, cache: 'no-store', redirect: 'error',
    }, photoCap, { signal })
    if (!object) return unavailable
    if (object.response.status !== 200) {
      if (object.response.status !== 400 || !isJson(object.response)) return unavailable
      const error = jsonBody(object.bytes)
      return error?.statusCode === '404' && (error.code === 'NoSuchKey' || error.code === 'NoSuchBucket') ? { kind: 'not_found' } : unavailable
    }
    if (object.response.headers.get('content-type') !== manifest.mime || object.bytes.length !== manifest.byte_count) return unavailable
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', object.bytes.slice()))
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
    if (signal?.aborted || hash !== manifest.sha256) return unavailable
    return { kind: 'found', manifest, bytes: object.bytes, contentType: manifest.mime }
  } catch { return unavailable }
}

// A fresh caller pass can only confirm the same selection; replacement never restarts this read.
export async function confirmCurrentProfilePhoto(selection: CurrentPhotoSelection, callerToken: string, signal?: AbortSignal): Promise<{ kind: 'current' } | { kind: 'not_found' } | { kind: 'unavailable' }> {
  if (!validSelection(selection)) return unavailable
  const current = await resolveCurrentProfilePhoto(selection.ownerId, callerToken, signal)
  if (current.kind !== 'current') return current
  return { kind: current.selection.assetId === selection.assetId ? 'current' : 'not_found' }
}
