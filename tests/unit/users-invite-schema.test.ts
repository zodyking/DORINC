import { describe, expect, it } from 'vitest'
import { inviteStaffUserSchema } from '../../shared/validators/users'

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
