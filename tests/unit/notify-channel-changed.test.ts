import { describe, expect, it } from 'vitest'
import { EMAIL_TEMPLATE_CATALOG } from '../../shared/email-template-catalog'
import { SMS_TEMPLATE_CATALOG } from '../../shared/sms-template-catalog'
import { buildNotifyChannelChangedEmail } from '../../server/mail/templates/system.mjs'

describe('notify channel changed templates', () => {
  it('includes email catalog entry', () => {
    const entry = EMAIL_TEMPLATE_CATALOG.find((t) => t.typeKey === 'notify_channel_changed')
    expect(entry).toBeTruthy()
    expect(entry?.group).toBe('security')
    expect(entry?.defaults.subject).toMatch(/notification channel/i)
  })

  it('includes sms catalog entry', () => {
    const entry = SMS_TEMPLATE_CATALOG.find((t) => t.typeKey === 'notify_channel_changed')
    expect(entry).toBeTruthy()
    expect(entry?.group).toBe('security')
    expect(entry?.defaults.body).toMatch(/leadMessage/i)
    expect(entry?.defaults.body).toMatch(/detailMessage/i)
    expect(entry?.sampleVars.detailMessage).toMatch(/My Account/i)
  })

  it('builds email for sms channel change', () => {
    const built = buildNotifyChannelChangedEmail({ channel: 'sms', name: 'Alex' })
    expect(built.subject).toMatch(/Notification channel updated/i)
    expect(built.html).toMatch(/notification channel to text/i)
    expect(built.html).toMatch(/My Account/i)
    expect(built.text).toMatch(/email inbox/i)
  })

  it('builds email for email channel change', () => {
    const built = buildNotifyChannelChangedEmail({ channel: 'email', name: 'Alex' })
    expect(built.subject).toMatch(/Notification channel updated/i)
    expect(built.html).toMatch(/notification channel to email/i)
    expect(built.html).toMatch(/My Account/i)
    expect(built.text).toMatch(/lasting record/i)
  })
})
