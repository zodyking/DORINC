import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountPasswordSchema } from '../../shared/validators/account'

/**
 * A forced password change (mustChangePassword) must always be satisfiable:
 * demanding the "current" password wedged accounts whose temp password an
 * admin had replaced, and the unsatisfiable gate looped the whole app.
 */
describe('forced password change stays satisfiable', () => {
  const service = readFileSync(resolve('server/services/account.service.ts'), 'utf8')
  const gatePage = readFileSync(resolve('app/pages/account/password-required.vue'), 'utf8')
  const adminPatch = readFileSync(resolve('server/api/admin/users/[id]/index.patch.ts'), 'utf8')
  const usersService = readFileSync(resolve('server/services/users.service.ts'), 'utf8')

  it('schema accepts a change without the current password', () => {
    expect(accountPasswordSchema.safeParse({ newPassword: 'a-long-password-123' }).success).toBe(true)
    expect(accountPasswordSchema.safeParse({
      currentPassword: 'temp-password-000',
      newPassword: 'a-long-password-123',
    }).success).toBe(true)
    expect(accountPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false)
  })

  it('server verifies the current password only for normal (non-forced) changes', () => {
    const start = service.indexOf('export async function changeAccountPassword')
    const body = service.slice(start, service.indexOf('export', start + 10))
    expect(body).toContain('if (!user.mustChangePassword)')
    expect(body).toContain('verifyPassword')
    expect(body).toContain('mustChangePassword: false')
    expect(body).toContain('tempPasswordExpiresAt: null')
  })

  it('gate page no longer asks for the current password and offers sign out', () => {
    expect(gatePage).not.toContain('currentPassword')
    expect(gatePage).toContain('Sign out instead')
  })

  it('admins can clear a stale requirement (never arm one) through the user PATCH', () => {
    expect(adminPatch).toContain('mustChangePassword: z.literal(false).optional()')
    const start = usersService.indexOf('export async function updateUser')
    const body = usersService.slice(start, usersService.indexOf('export interface ListUsersFilter'))
    expect(body).toContain('input.mustChangePassword === false')
    expect(body).toContain('tempPasswordExpiresAt = null')
  })
})
