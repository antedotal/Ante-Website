import { expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

it('shares the existing ordinary email normalization rules with account editing', async () => {
  const { normalizedEmail } = await import('../lib/server/email-validation')
  expect(normalizedEmail('  Person+Tag@Example.COM  ')).toBe('person+tag@example.com')
  for (const value of [undefined, 3, '', 'a@b', '.a@example.com', 'a..b@example.com', 'a@-example.com', 'a@example..com']) {
    expect(normalizedEmail(value)).toBeNull()
  }
})
