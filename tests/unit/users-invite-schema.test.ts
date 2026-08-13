import { describe, expect, it } from 'vitest'
import { inviteStaffUserSchema, setStaffPasswordSchema } from '../../shared/validators/users'

describe('inviteStaffUserSchema', () => {
  it('accepts valid invite payload', () => {
    const parsed = inviteStaffUserSchema.safeParse({
      name: 'Jordan Taylor',
      email: 'jordan@example.com',
      accountType: 'mechanic',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects missing account type', () => {
    const parsed = inviteStaffUserSchema.safeParse({
      name: 'Jordan Taylor',
      email: 'jordan@example.com',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('setStaffPasswordSchema', () => {
  it('requires a 12+ character password and defaults mustChangePassword to true', () => {
    const parsed = setStaffPasswordSchema.safeParse({ password: 'testing-pass-1' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.mustChangePassword).toBe(true)
  })

  it('rejects short passwords', () => {
    const parsed = setStaffPasswordSchema.safeParse({ password: 'short' })
    expect(parsed.success).toBe(false)
  })

  it('allows skipping the forced change for testing logins', () => {
    const parsed = setStaffPasswordSchema.safeParse({
      password: 'testing-pass-1',
      mustChangePassword: false,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.mustChangePassword).toBe(false)
  })
})
