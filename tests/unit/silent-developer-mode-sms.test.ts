import { beforeEach, describe, expect, it, vi } from 'vitest'

const shouldSuppressActorNotifications = vi.fn()
const deliverUserNotification = vi.fn()
const isNotificationEnabled = vi.fn()
const listPermissionRecipients = vi.fn()
const resolveEmailBrand = vi.fn()
const getActiveEmailTemplateContent = vi.fn()
const getAppUrl = vi.fn(() => 'https://app.example.com')

vi.mock('../../server/services/notification-suppression.service', () => ({
  shouldSuppressActorNotifications: (...args: unknown[]) => shouldSuppressActorNotifications(...args),
}))

vi.mock('../../server/services/notify-delivery.service', () => ({
  deliverUserNotification: (...args: unknown[]) => deliverUserNotification(...args),
}))

vi.mock('../../server/services/workspace-settings.service', () => ({
  isNotificationEnabled: (...args: unknown[]) => isNotificationEnabled(...args),
}))

vi.mock('../../server/services/notification-recipients.service', () => ({
  listPermissionRecipients: (...args: unknown[]) => listPermissionRecipients(...args),
  listAccountants: vi.fn(),
  listAllTeamMembers: vi.fn(),
}))

vi.mock('../../server/services/email-branding.service', () => ({
  resolveEmailBrand: (...args: unknown[]) => resolveEmailBrand(...args),
}))

vi.mock('../../server/services/email-templates.service', () => ({
  getActiveEmailTemplateContent: (...args: unknown[]) => getActiveEmailTemplateContent(...args),
}))

vi.mock('../../server/services/app-config.service', () => ({
  getAppUrl: () => getAppUrl(),
}))

vi.mock('../../server/services/user-notify-channel.service', () => ({
  loadUserNotifyProfile: vi.fn(),
}))

vi.mock('../../server/mail/templates/system', () => ({
  buildDeletionRequestSubmittedEmail: () => ({
    subject: 'Deletion',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildDeletionRequestResultEmail: () => ({
    subject: 'Deletion',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildUserSignupPendingEmail: () => ({
    subject: 'Signup',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildInvoicePendingApprovalEmail: () => ({
    subject: 'Invoice',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildCustomerServiceRequestStaffEmail: () => ({
    subject: 'Service',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildCustomerChangeRequestStaffEmail: () => ({
    subject: 'Change',
    text: 'text',
    html: '<p>html</p>',
  }),
  buildCustomerEmailReceivedStaffEmail: () => ({
    subject: 'Email',
    text: 'text',
    html: '<p>html</p>',
  }),
}))

describe('silent developer mode SMS parity', () => {
  beforeEach(() => {
    shouldSuppressActorNotifications.mockReset()
    deliverUserNotification.mockReset()
    isNotificationEnabled.mockReset()
    listPermissionRecipients.mockReset()
    resolveEmailBrand.mockReset()
    getActiveEmailTemplateContent.mockReset()
    resolveEmailBrand.mockResolvedValue({ brandName: 'DORINC', appUrl: 'https://app.example.com' })
    getActiveEmailTemplateContent.mockResolvedValue(null)
  })

  it('suppresses deletion-request notifications before email or SMS delivery', async () => {
    shouldSuppressActorNotifications.mockResolvedValue(true)
    const { notifyDeletionRequestSubmitted } = await import('../../server/services/staff-notifications.service')

    const result = await notifyDeletionRequestSubmitted({} as never, {
      submitterName: 'Jordan',
      submitterId: 'actor-1',
      entityType: 'invoice',
      entityLabel: 'INV-1',
      reason: 'Duplicate',
      requestId: 'req-1',
    })

    expect(result).toEqual({ queued: 0, reason: 'suppressed' })
    expect(isNotificationEnabled).not.toHaveBeenCalled()
    expect(deliverUserNotification).not.toHaveBeenCalled()
  })

  it('delivers deletion-request SMS vars with email-parity fields when not suppressed', async () => {
    shouldSuppressActorNotifications.mockResolvedValue(false)
    isNotificationEnabled.mockResolvedValue(true)
    listPermissionRecipients.mockResolvedValue([{
      id: 'rev-1',
      name: 'Alex',
      email: 'alex@example.com',
      phone: '+15551234567',
      messageNotifyChannel: 'sms',
    }])
    deliverUserNotification.mockResolvedValue({ channel: 'sms' })

    const { notifyDeletionRequestSubmitted } = await import('../../server/services/staff-notifications.service')
    const result = await notifyDeletionRequestSubmitted({} as never, {
      submitterName: 'Jordan',
      submitterId: 'actor-1',
      entityType: 'invoice',
      entityLabel: 'INV-1',
      reason: 'Duplicate invoice',
      requestId: 'req-1',
    })

    expect(result.queued).toBe(1)
    expect(deliverUserNotification).toHaveBeenCalledOnce()
    const sms = deliverUserNotification.mock.calls[0][2].sms
    expect(sms.typeKey).toBe('deletion_request_submitted')
    expect(sms.vars.reason).toBe('Duplicate invoice')
    expect(sms.vars.reviewerName).toBe('Alex')
  })
})
