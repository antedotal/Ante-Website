// This public distribution omits private source-acceptance evidence. Keep its
// payment entry boundary closed regardless of environment presence: unavailable
// pages may render before Auth, credential parsing or financial admission.
// Financial activation requires a separately reviewed source transition; a
// public configuration value cannot recreate the omitted private acceptance.
export function paymentWebsiteSourceEnabled(): boolean {
  return false
}
