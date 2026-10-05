import 'server-only'

// Keep sign-in and account editing on the same ordinary address acceptance rules.
export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || email.length < 3) return null
  const at = email.indexOf('@')
  if (at < 1 || at !== email.lastIndexOf('@')) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  return email
}
