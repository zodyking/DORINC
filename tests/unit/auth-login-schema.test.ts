import { describe, expect, it } from 'vitest'
import { loginBodySchema } from '../../shared/validators/auth'

describe('loginBodySchema', () => {
  it('requires geo for staff login', () => {
    const parsed = loginBodySchema.safeParse({
      portal: 'staff',
      email: 'staff@example.com',
      password: 'secret',
      geo: { latitude: 40.6782, longitude: -73.9442, accuracyM: 35 },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects staff login without geo', () => {
    const parsed = loginBodySchema.safeParse({
      portal: 'staff',
      email: 'staff@example.com',
      password: 'secret',
    })
    expect(parsed.success).toBe(false)
  })

  it('allows customer login without geo', () => {
    const parsed = loginBodySchema.safeParse({
      portal: 'customer',
      username: 'acme',
      password: 'secret',
    })
    expect(parsed.success).toBe(true)
  })
})
