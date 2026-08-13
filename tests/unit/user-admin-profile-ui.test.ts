import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('admin user profile edit UI', () => {
  const page = readFileSync(resolve('app/pages/users/[id].vue'), 'utf8')
  const patch = readFileSync(resolve('server/api/admin/users/[id]/index.patch.ts'), 'utf8')
  const service = readFileSync(resolve('server/services/users.service.ts'), 'utf8')

  it('splits full name into editable first/last fields', () => {
    expect(page).toContain('First name')
    expect(page).toContain('Last name')
    expect(page).not.toMatch(/Full name\s*<input/)
    expect(page).toContain('splitPersonName')
    expect(page).toContain('editFirstName')
    expect(page).toContain('editLastName')
    expect(page).toContain('editEmail')
  })

  it('saves name, email, phone, and account type together', () => {
    expect(page).toContain('nameDirty')
    expect(page).toContain('emailDirty')
    expect(page).toMatch(/firstName,\s*lastName/)
    expect(page).toContain('email: editEmail.value.trim()')
    expect(page).toContain('Save changes')
  })

  it('admin PATCH accepts firstName, lastName, and email', () => {
    expect(patch).toContain('firstName')
    expect(patch).toContain('lastName')
    expect(patch).toContain('email: emailSchema.optional()')
    expect(patch).toContain('EMAIL_TAKEN')
    expect(service).toContain('formatPersonName')
    expect(service).toContain('EMAIL_TAKEN')
    expect(service).toContain('changedFields.push(\'name\')')
    expect(service).toContain('changedFields.push(\'email\')')
  })

  it('clears email verification when admin changes the address', () => {
    expect(service).toContain('changes.emailVerifiedAt = null')
    expect(service).toContain('changedFields.push(\'emailVerifiedAt\')')
    expect(service).toContain('emailVerificationTokens')
  })

  it('lets admin set a password even if the user has never logged in', () => {
    expect(page).toContain('Set password')
    expect(page).toContain('/set-password')
    expect(page).toContain('canSetPassword')
    expect(page).not.toContain('canPasswordReset = computed(() => canCredentialAction.value && Boolean(user.value?.hasLoggedIn))')
    expect(page).toContain('canPasswordReset = computed(() => canCredentialAction.value)')
    expect(page).toContain('mustChangePassword: setPasswordMustChange.value')
  })

  it('busts admin user cache after delete and profile saves', () => {
    expect(page).toContain('bustAdminUsersCache')
    expect(page).toContain('adminUserDetailKey')
    expect(page).toContain('watch: [userId]')
  })
})
