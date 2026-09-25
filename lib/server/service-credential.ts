// Keep private Supabase credentials server-only and preserve the existing key selection rules.
import 'server-only'

// Opaque secret keys are apikey-only; legacy service JWTs also require bearer auth.
export function serviceCredential(): { key: string; bearer: boolean } | null {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (secret !== undefined) {
    return /^sb_secret_[A-Za-z0-9_-]+$/.test(secret) && !/placeholder|example|your[-_]/i.test(secret)
      ? { key: secret, bearer: false }
      : null
  }

  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!legacy || !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(legacy)) return null
  try {
    const payload = JSON.parse(atob(legacy.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return payload.role === 'service_role' ? { key: legacy, bearer: true } : null
  } catch {
    return null
  }
}
