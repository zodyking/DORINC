import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueVerificationEmail } from '../../server/services/verification-email.service'

const { enqueueJob } = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
}))

vi.mock('../../server/services/jobs.service', () => ({
  enqueueJob,
}))

vi.mock('../../server/services/email-branding.service', () => ({
  resolveEmailBrand: vi.fn(async () => ({
    brandName: 'Acme Repairs',
    brandLegal: 'Acme Repairs LLC',
    brandTagline: 'Onsite repairs',
    logoUrl: 'https://app.example.com/logo.png',
    logoInitial: 'A',
    addressLines: [],
    phone: '',
    email: '',
    website: '',
    appUrl: 'https://app.example.com',
    settingsUrl: 'https://app.example.com/settings',
    helpUrl: 'https://app.example.com/help',
    signInUrl: 'https://app.example.com/auth/login',
  })),
}))

describe('verification email queue', () => {
  beforeEach(() => {
    enqueueJob.mockReset()
    enqueueJob.mockResolvedValue({ id: 'job-1' })
  })

  it('queues a complete verification email instead of waiting for SMTP', async () => {
    await enqueueVerificationEmail({} as never, {
      to: 'alex@example.com',
      name: 'Alex',
      verificationToken: 'secret-token',
    })

    expect(enqueueJob).toHaveBeenCalledTimes(1)
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      'email_send',
      expect.objectContaining({
        to: 'alex@example.com',
        subject: 'Verify Your Email',
        notificationKind: 'email_verification',
      }),
    )
    const payload = enqueueJob.mock.calls[0]?.[2] as { html: string }
    expect(payload.html).toContain('secret-token')
  })
})
