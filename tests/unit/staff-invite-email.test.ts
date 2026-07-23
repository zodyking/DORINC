import { describe, expect, it } from 'vitest'
import { buildStaffInviteEmail } from '../../server/mail/templates/system'

describe('buildStaffInviteEmail', () => {
  it('includes staff login url and temporary password details', () => {
    const mail = buildStaffInviteEmail({
      name: 'Jordan Taylor',
      email: 'jordan@example.com',
      tempPassword: 'BlueTree7!',
      appUrl: 'https://app.example.com',
      brand: { businessName: 'Acme Fleet' },
    })
    expect(mail.subject).toContain('invited')
    expect(mail.text).toContain('jordan@example.com')
    expect(mail.text).toContain('BlueTree7!')
    expect(mail.text).toContain('/auth/login?card=staff')
    expect(mail.html).toContain('jordan@example.com')
  })
})
