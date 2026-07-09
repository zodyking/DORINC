import { describe, expect, it } from 'vitest'
import {
  buildBackupNotificationEmail,
  buildInvoiceAttachedEmail,
  buildPortalCredentialEmail,
  buildSignupVerificationEmail,
  buildSmtpTestEmail,
} from '../../server/mail/templates/system.mjs'

describe('system email templates', () => {
  const appUrl = 'https://app.example.com'

  it('builds signup verification with CTA and layout', () => {
    const mail = buildSignupVerificationEmail({
      name: 'Alex',
      verifyUrl: `${appUrl}/auth/verify-email?token=abc`,
      appUrl,
    })
    expect(mail.subject).toContain('Verify')
    expect(mail.html).toContain('Verify email address')
    expect(mail.html).toContain(appUrl)
    expect(mail.text).toContain('Alex')
  })

  it('builds SMTP test with actor metadata', () => {
    const mail = buildSmtpTestEmail({
      source: 'control panel',
      actorName: 'Admin',
      sentAt: '2026-01-01T00:00:00.000Z',
      appUrl,
    })
    expect(mail.html).toContain('Admin')
    expect(mail.html).toContain('SMTP test successful')
  })

  it('builds portal credentials with sign-in panel', () => {
    const mail = buildPortalCredentialEmail({
      name: 'Pat',
      username: 'pat.r',
      tempPassword: 'Temp123!',
      appUrl,
    })
    expect(mail.html).toContain('pat.r')
    expect(mail.html).toContain('Sign in to the portal')
    expect(mail.text).toContain('Temporary password')
  })

  it('builds backup success and failure variants', () => {
    const ok = buildBackupNotificationEmail({
      success: true,
      filename: 'backup.enc',
      trigger: 'scheduled',
      appUrl,
    })
    const fail = buildBackupNotificationEmail({
      success: false,
      filename: 'backup.enc',
      trigger: 'manual',
      error: 'dump failed',
      appUrl,
    })
    expect(ok.html).toContain('Backup completed')
    expect(fail.html).toContain('Backup failed')
    expect(fail.html).toContain('dump failed')
  })

  it('builds invoice attached email with metadata', () => {
    const mail = buildInvoiceAttachedEmail({
      recipientName: 'Pat',
      invoiceNumber: 'INV-000001',
      dueDate: '2026-08-01',
      total: '$100.00',
      appUrl,
    })
    expect(mail.html).toContain('INV-000001')
    expect(mail.html).toContain('Due date')
    expect(mail.text).toContain('attached')
  })
})
