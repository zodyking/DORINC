import { describe, expect, it } from 'vitest'
import {
  buildBackupNotificationEmail,
  buildDeletionRequestResultEmail,
  buildDeletionRequestSubmittedEmail,
  buildInvoiceAttachedEmail,
  buildInvoicePendingApprovalEmail,
  buildLoginNotificationEmail,
  buildPortalCredentialEmail,
  buildSignupVerificationEmail,
  buildSmtpTestEmail,
  buildUserSignupPendingEmail,
} from '../../server/mail/templates/system.mjs'

describe('system email templates', () => {
  const appUrl = 'https://app.example.com'
  const brand = {
    brandName: 'Acme Shop',
    brandLegal: 'Acme Shop LLC',
    brandTagline: 'Accounting workspace',
    logoUrl: `${appUrl}/images/dorinc-icon-trans.png`,
    logoInitial: 'A',
    addressLines: ['123 Main'],
    appUrl,
    settingsUrl: `${appUrl}/admin?tab=notifications`,
    helpUrl: `${appUrl}/help`,
    signInUrl: `${appUrl}/auth/login`,
  }

  it('builds signup verification with CTA and layout', () => {
    const mail = buildSignupVerificationEmail({
      name: 'Alex',
      verifyUrl: `${appUrl}/auth/verify-email?token=abc`,
      appUrl,
      brand,
    })
    expect(mail.subject).toContain('Verify')
    expect(mail.html).toContain('Verify email address')
    expect(mail.html).toContain('Acme Shop')
    expect(mail.text).toContain('Alex')
  })

  it('builds SMTP test with actor metadata', () => {
    const mail = buildSmtpTestEmail({
      source: 'control panel',
      actorName: 'Admin',
      sentAt: '2026-01-01T00:00:00.000Z',
      appUrl,
      brand,
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
      brand,
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
      brand,
    })
    const fail = buildBackupNotificationEmail({
      success: false,
      filename: 'backup.enc',
      trigger: 'manual',
      error: 'dump failed',
      appUrl,
      brand,
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
      brand,
    })
    expect(mail.html).toContain('INV-000001')
    expect(mail.html).toContain('Due date')
    expect(mail.text).toContain('attached')
  })

  it('builds login notification with sign-in details', () => {
    const mail = buildLoginNotificationEmail({
      name: 'Alex',
      email: 'alex@example.com',
      portal: 'staff',
      signedInAt: '2026-07-10T20:00:00.000Z',
      ipAddress: '203.0.113.10',
      location: 'Austin, Texas',
      device: 'iPhone - Safari',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      appUrl,
      brand,
    })
    expect(mail.subject).toContain('New sign-in')
    expect(mail.html).toContain('Sign-in alert')
    expect(mail.html).toContain('Alex')
    expect(mail.html).toContain('alex@example.com')
    expect(mail.html).toContain('Austin, Texas')
    expect(mail.html).toContain('iPhone - Safari')
    expect(mail.html).toContain('203.0.113.10')
    expect(mail.text).toContain('If this was not you')
    expect(mail.text).toContain('alex@example.com')
    expect(mail.text).toContain('Austin, Texas')
  })

  it('builds deletion request submitted and result emails', () => {
    const submitted = buildDeletionRequestSubmittedEmail({
      reviewerName: 'Admin',
      submitterName: 'Mechanic',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000010',
      reason: 'Duplicate entry',
      reviewUrl: `${appUrl}/deletion-requests`,
      appUrl,
      brand,
    })
    const result = buildDeletionRequestResultEmail({
      requestorName: 'Mechanic',
      status: 'rejected',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000010',
      reviewReason: 'Still needed for audit',
      reviewedByName: 'Admin',
      appUrl,
      brand,
    })
    expect(submitted.html).toContain('New deletion request')
    expect(submitted.html).toContain('Duplicate entry')
    expect(result.html).toContain('Deletion denied')
    expect(result.html).toContain('Still needed for audit')
  })

  it('builds user signup and invoice approval staff alerts', () => {
    const signup = buildUserSignupPendingEmail({
      adminName: 'Admin',
      userName: 'New User',
      userEmail: 'new@example.com',
      usersUrl: `${appUrl}/users`,
      appUrl,
      brand,
    })
    const approval = buildInvoicePendingApprovalEmail({
      approverName: 'Manager',
      invoiceNumber: 'INV-000099',
      customerName: 'Fleet Co',
      total: '$6,000.00',
      invoiceUrl: `${appUrl}/invoices/abc`,
      appUrl,
      brand,
    })
    expect(signup.html).toContain('awaiting approval')
    expect(approval.html).toContain('INV-000099')
    expect(approval.html).toContain('needs approval')
  })
})
