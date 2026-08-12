import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshQuoConfigCache = vi.fn()
const getQuoConfig = vi.fn()
const isQuoSmsEnabled = vi.fn()
const sendQuoSms = vi.fn()
const resolveSmsBody = vi.fn()
const resolveEmailBrand = vi.fn()
const getAppUrl = vi.fn()
const enqueueJob = vi.fn()

vi.mock('../../server/services/quo.service', () => ({
  refreshQuoConfigCache: (...args: unknown[]) => refreshQuoConfigCache(...args),
  getQuoConfig: (...args: unknown[]) => getQuoConfig(...args),
  isQuoSmsEnabled: (...args: unknown[]) => isQuoSmsEnabled(...args),
  sendQuoSms: (...args: unknown[]) => sendQuoSms(...args),
}))

vi.mock('../../server/services/sms-templates.service', () => ({
  resolveSmsBody: (...args: unknown[]) => resolveSmsBody(...args),
}))

vi.mock('../../server/services/email-branding.service', () => ({
  resolveEmailBrand: (...args: unknown[]) => resolveEmailBrand(...args),
}))

vi.mock('../../server/services/app-config.service', () => ({
  getAppUrl: (...args: unknown[]) => getAppUrl(...args),
}))

vi.mock('../../server/services/jobs.service', () => ({
  enqueueJob: (...args: unknown[]) => enqueueJob(...args),
}))

describe('enqueueTemplatedSms queue-only delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    refreshQuoConfigCache.mockReset().mockResolvedValue({})
    getQuoConfig.mockReset().mockResolvedValue({
      enabled: true,
      apiKey: 'sk_test',
      fromNumber: '+15165184847',
    })
    isQuoSmsEnabled.mockReset().mockReturnValue(true)
    sendQuoSms.mockReset().mockResolvedValue({ id: 'msg_1' })
    resolveSmsBody.mockReset().mockResolvedValue('Hello from Acme')
    resolveEmailBrand.mockReset().mockResolvedValue({ brandName: 'Acme', appUrl: 'https://example.com' })
    getAppUrl.mockReset().mockReturnValue('https://example.com')
    enqueueJob.mockReset().mockResolvedValue({ id: 'job_1' })
  })

  it('queues SMS for the worker and never blocks on a direct Quo API call', async () => {
    const { enqueueTemplatedSms } = await import('../../server/services/sms-notifications.service')
    const result = await enqueueTemplatedSms({} as never, {
      to: '+12122037678',
      typeKey: 'login_notification',
      vars: { name: 'Brandon' },
    })

    expect(result).toEqual({ queued: true, mode: 'queued' })
    expect(sendQuoSms).not.toHaveBeenCalled()
    expect(enqueueJob).toHaveBeenCalledOnce()
    expect(enqueueJob.mock.calls[0]![1]).toBe('sms_send')
  })
})
