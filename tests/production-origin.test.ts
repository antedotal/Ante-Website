// Check fixed canonicalization without generated OpenNext code or provider traffic.
import { describe, expect, it } from 'vitest'
import { productionOriginResponse } from '../lib/production-origin'

describe('production alternate host', () => {
  it.each(['GET', 'HEAD'])('redirects %s before account processing with encoded path/query intact', (method) => {
    const response = productionOriginResponse(new Request('https://www.antedotal.com/auth/callback?code=a%2Fb&next=%2Faccount', { method }))!
    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('https://antedotal.com/auth/callback?code=a%2Fb&next=%2Faccount')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('denies %s without a redirect or replay', (method) => {
    const response = productionOriginResponse(new Request('https://www.antedotal.com/api/account/profile', { method }))!
    expect(response.status).toBe(403)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it.each(['https://antedotal.com/account', 'http://localhost:3000/account', 'https://ante-website-backend-preview.example.workers.dev/account', 'https://acceptance.antedotal.com/account', 'https://www.antedotal.com.attacker.test/account'])('leaves %s unchanged regardless of forwarded headers', (url) => {
    expect(productionOriginResponse(new Request(url, { headers: { Host: 'www.antedotal.com', 'X-Forwarded-Host': 'www.antedotal.com' } }))).toBeNull()
  })
  it('cannot interpret a protocol-relative path as a redirect destination', () => {
    const response = productionOriginResponse(new Request('https://www.antedotal.com//attacker.test/account'))!
    expect(response.headers.get('Location')).toBe('https://antedotal.com//attacker.test/account')
  })
})
