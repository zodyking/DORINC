import { describe, expect, it } from 'vitest'
import { quoSettingsPatchSchema } from '../../shared/validators/quo'

describe('quo settings portal credentials', () => {
  it('accepts portal username and password with payment fields', () => {
    const parsed = quoSettingsPatchSchema.parse({
      enabled: true,
      fromNumber: '+15551234567',
      paymentDate: '2026-08-04',
      paymentAmountUsd: 23.85,
      portalUsername: 'ops@example.com',
      portalPassword: 'secret-pass',
    })
    expect(parsed.portalUsername).toBe('ops@example.com')
    expect(parsed.portalPassword).toBe('secret-pass')
    expect(parsed.paymentDate).toBe('2026-08-04')
    expect(parsed.paymentAmountUsd).toBe(23.85)
  })

  it('rejects invalid payment dates', () => {
    const result = quoSettingsPatchSchema.safeParse({
      paymentDate: '08/04/2026',
      paymentAmountUsd: 23.85,
    })
    expect(result.success).toBe(false)
  })
})
