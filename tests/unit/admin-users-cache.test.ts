import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('admin user cache busting', () => {
  const fetch = readFileSync(resolve('app/composables/useClientFetch.ts'), 'utf8')
  const cache = readFileSync(resolve('app/composables/useAdminUsersCache.ts'), 'utf8')
  const invite = readFileSync(resolve('server/services/staff-invite.service.ts'), 'utf8')
  const listGet = readFileSync(resolve('server/api/admin/users/index.get.ts'), 'utf8')
  const detailGet = readFileSync(resolve('server/api/admin/users/[id]/index.get.ts'), 'utf8')
  const setPassword = readFileSync(resolve('server/api/admin/users/[id]/set-password.post.ts'), 'utf8')

  it('does not reuse Nuxt payload cache for client fetches', () => {
    expect(fetch).toContain('getCachedData: opts.getCachedData ?? (() => undefined)')
  })

  it('clears admin-users Nuxt keys after mutations', () => {
    expect(cache).toContain('ADMIN_USERS_LIST_KEY')
    expect(cache).toContain('clearNuxtData')
    expect(cache).toContain('key.startsWith(\'admin-users\')')
  })

  it('sends no-store on admin user GET handlers', () => {
    expect(listGet).toContain('setPrivateNoStore')
    expect(detailGet).toContain('setPrivateNoStore')
  })

  it('does not auto-verify invited staff from a reused email', () => {
    expect(invite).toContain('A new identity on a reused (deleted) email must not inherit verification')
    expect(invite).not.toMatch(/insert\(users\)\.values\(\{[\s\S]*emailVerifiedAt:\s*now/)
    expect(invite).not.toContain('emailVerifiedAt: row.user.emailVerifiedAt ?? new Date()')
  })

  it('exposes admin set-password for test logins', () => {
    expect(setPassword).toContain('setStaffPassword')
    expect(setPassword).toContain('users.password_set')
    expect(invite).toContain('export async function setStaffPassword')
  })
})
