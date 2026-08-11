import { describe, expect, it } from 'vitest'
import {
  SMS_BODY_MAX_CHARS,
  SMS_TEMPLATE_CATALOG,
  applySmsTemplateContent,
  interpolateSmsTemplate,
  normalizeSmsTemplateContent,
  smsCatalogDefaultBodies,
  smsTemplateByKey,
} from '../../shared/sms-template-catalog'
import { SMS_DEFAULT_BODIES } from '../../server/workers/lib/sms-notify.mjs'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'

describe('sms template catalog', () => {
  it('includes core transactional SMS types with email-parity multi-line defaults', () => {
    const keys = SMS_TEMPLATE_CATALOG.map(t => t.typeKey)
    expect(keys).toContain('notify_channel_changed')
    expect(keys).toContain('dorinc_contact_card')
    expect(keys).toContain('login_notification')
    expect(keys).toContain('outside_geofence_verification')
    expect(keys).toContain('signup_verification')
    expect(keys).toContain('chat_message_received')
    expect(keys).toContain('password_reset')
    expect(keys).toContain('staff_invite')
    expect(keys).toContain('staff_password_reset')
    expect(keys).toContain('deletion_request_submitted')
    expect(keys).toContain('deletion_request_result')
    expect(keys).toContain('user_signup_pending')
    expect(keys).toContain('invoice_pending_approval')
    expect(keys).toContain('customer_service_request_staff')
    expect(keys).toContain('customer_change_request_staff')
    expect(keys).toContain('customer_email_received_staff')
    expect(keys).toContain('daily_summary_report')
    expect(keys).toContain('quo_test')

    for (const def of SMS_TEMPLATE_CATALOG) {
      expect(def.defaults.body.length).toBeGreaterThan(10)
      expect(def.defaults.body.length).toBeLessThanOrEqual(SMS_BODY_MAX_CHARS)
      expect(def.defaults.body).toContain('{{brandName}}')
      expect(def.defaults.body).toContain('\n')
      // Detail fields use stacked label/value (no "Label: value" colon form).
      expect(def.defaults.body).not.toMatch(/^(When|Email|Location|IP address|Device|Verification code|Expires|Record|Type|Decision|Name|Invoice|Customer|Total|Subject|Sent at|Temporary password|Reason for deletion|Reviewed by|Reviewer note|Request type|Topic|Vehicle|Details|Category|Urgency|Customer message|Message|Report date|Status|Requested by): /m)
      const rendered = applySmsTemplateContent(def.defaults, def.sampleVars).body
      expect(rendered.length).toBeGreaterThan(10)
      expect(rendered.length).toBeLessThanOrEqual(SMS_BODY_MAX_CHARS)
      expect(rendered).not.toMatch(/\{\{\s*[\w.]+\s*\}\}/)
    }

    const login = applySmsTemplateContent(
      smsTemplateByKey('login_notification')!.defaults,
      smsTemplateByKey('login_notification')!.sampleVars,
    ).body
    expect(login).toContain('When\nAug 10, 2026, 8:15 AM')
    expect(login).toContain('Email\nalex@example.com')
    expect(login).toContain('Open: https://app.example.com')
  })

  it('keeps worker SMS_DEFAULT_BODIES in sync with the shared catalog', () => {
    expect(SMS_DEFAULT_BODIES).toEqual(smsCatalogDefaultBodies())
  })

  it('interpolates and normalizes bodies', () => {
    const def = smsTemplateByKey('outside_geofence_verification')
    expect(def).toBeTruthy()
    const resolved = applySmsTemplateContent(def!.defaults, {
      brandName: 'Acme',
      code: '123456',
      expiresMinutes: '15',
      name: 'Pat',
      locationLabel: 'Austin, TX',
      ipAddress: '203.0.113.10',
    })
    expect(resolved.body).toContain('123456')
    expect(resolved.body).toContain('Suspicious location detected')
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
