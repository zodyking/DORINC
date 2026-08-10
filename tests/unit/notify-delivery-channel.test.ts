import { describe, expect, it, vi, beforeEach } from 'vitest'

const resolveUserNotifyDelivery = vi.fn()
const enqueueTemplatedSms = vi.fn()
const enqueueJob = vi.fn()

vi.mock('../../server/services/user-notify-channel.service', () => ({
  resolveUserNotifyDelivery: (...args: unknown[]) => resolveUserNotifyDelivery(...args),
}))

vi.mock('../../server/services/sms-notifications.service', () => ({
  enqueueTemplatedSms: (...args: unknown[]) => enqueueTemplatedSms(...args),
}))

vi.mock('../../server/services/jobs.service', () => ({
  enqueueJob: (...args: unknown[]) => enqueueJob(...args),
}))

describe('deliverUserNotification', () => {
  beforeEach(() => {
    vi.resetModules()
    resolveUserNotifyDelivery.mockReset()
    enqueueTemplatedSms.mockReset()
    enqueueJob.mockReset()
  })

  it('queues SMS and skips email when the recipient prefers Text', async () => {
    resolveUserNotifyDelivery.mockResolvedValue({
      channel: 'sms',
      phone: '+15551234567',
      email: 'pat@example.com',
    })
    enqueueTemplatedSms.mockResolvedValue({ queued: true })

    const { deliverUserNotification } = await import('../../server/services/notify-delivery.service')
    const result = await deliverUserNotification({} as never, {
      id: 'u1',
      email: 'pat@example.com',
      phone: '+15551234567',
      messageNotifyChannel: 'sms',
    }, {
      sms: { typeKey: 'chat_message_received', vars: { senderName: 'Alex' } },
      email: { subject: 's', text: 't', html: '<p>h</p>' },
      meta: { notificationKind: 'chat_message_received' },
    })

    expect(result).toEqual({ channel: 'sms' })
    expect(enqueueTemplatedSms).toHaveBeenCalledOnce()
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it('falls back to email when SMS cannot be queued', async () => {
    resolveUserNotifyDelivery.mockResolvedValue({
      channel: 'sms',
      phone: '+15551234567',
      email: 'pat@example.com',
    })
    enqueueTemplatedSms.mockResolvedValue({ queued: false, reason: 'empty_body' })
    enqueueJob.mockResolvedValue({ id: 'job-1' })

    const { deliverUserNotification } = await import('../../server/services/notify-delivery.service')
    const result = await deliverUserNotification({} as never, {
      email: 'pat@example.com',
      phone: '+15551234567',
      messageNotifyChannel: 'sms',
    }, {
      sms: { typeKey: 'password_reset', vars: { resetUrl: 'https://example.com' } },
      email: { subject: 'Reset', text: 'reset', html: '<p>reset</p>' },
    })

    expect(result).toEqual({ channel: 'email' })
    expect(enqueueJob).toHaveBeenCalledOnce()
  })
})
