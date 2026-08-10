import { describe, expect, it } from 'vitest'
import {
  SMS_TEMPLATE_CATALOG,
  applySmsTemplateContent,
  interpolateSmsTemplate,
  normalizeSmsTemplateContent,
  smsTemplateByKey,
} from '../../shared/sms-template-catalog'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'

describe('sms template catalog', () => {
  it('includes core transactional SMS types with short defaults', () => {
    const keys = SMS_TEMPLATE_CATALOG.map(t => t.typeKey)
    expect(keys).toContain('login_notification')
    expect(keys).toContain('outside_geofence_verification')
    expect(keys).toContain('signup_verification')
    expect(keys).toContain('chat_message_received')
    expect(keys).toContain('password_reset')
    expect(keys).toContain('staff_invite')
    expect(keys).toContain('quo_test')

    for (const def of SMS_TEMPLATE_CATALOG) {
      expect(def.defaults.body.length).toBeGreaterThan(10)
      expect(def.defaults.body.length).toBeLessThanOrEqual(320)
      expect(def.defaults.body).toContain('{{brandName}}')
    }
  })

  it('interpolates and normalizes bodies', () => {
    const def = smsTemplateByKey('outside_geofence_verification')
    expect(def).toBeTruthy()
    const resolved = applySmsTemplateContent(def!.defaults, {
      brandName: 'Acme',
      code: '123456',
      expiresMinutes: '15',
    })
    expect(resolved.body).toContain('123456')
    expect(interpolateSmsTemplate('Hi {{name}}', { name: 'Pat' })).toBe('Hi Pat')
    const normalized = normalizeSmsTemplateContent({ body: '  Custom {{code}}  ' }, def!.defaults)
    expect(normalized.body).toBe('Custom {{code}}')
  })
})

describe('phone e164', () => {
  it('normalizes common US inputs', () => {
    expect(normalizePhoneE164('(555) 123-4567')).toBe('+15551234567')
    expect(normalizePhoneE164('15551234567')).toBe('+15551234567')
    expect(normalizePhoneE164('+44 7700 900123')).toBe('+447700900123')
    expect(normalizePhoneE164('abc')).toBeNull()
  })
})
