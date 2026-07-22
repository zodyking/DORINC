import { describe, expect, it } from 'vitest'
import { completeStaffLoginBodySchema, loginBodySchema } from '../../shared/validators/auth'

describe('loginBodySchema', () => {
  it('allows staff login with geo', () => {
    const parsed = loginBodySchema.safeParse({
      portal: 'staff',
      email: 'staff@example.com',
      password: 'secret',
      geo: { latitude: 40.6782, longitude: -73.9442, accuracyM: 35 },
    })
    expect(parsed.success).toBe(true)
  })

  it('allows staff login without geo', () => {
    const parsed = loginBodySchema.safeParse({
      portal: 'staff',
      email: 'staff@example.com',
      password: 'secret',
    })
    expect(parsed.success).toBe(true)
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
