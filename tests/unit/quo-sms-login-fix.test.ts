import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('sms channel must not block auth flows', () => {
  it('queues templated SMS instead of calling Quo on the request path', () => {
    const src = readFileSync(resolve('server/services/sms-notifications.service.ts'), 'utf8')
    expect(src).not.toContain('sendQuoSms(')
    expect(src).toContain("mode: 'queued'")
  })

  it('always emails outside-geofence verification codes', () => {
    const src = readFileSync(resolve('server/services/outside-geo-verify.service.ts'), 'utf8')
    expect(src).toContain('enqueueOutsideGeoVerificationEmail')
    expect(src).not.toContain('enqueueTemplatedSms')
    expect(src).not.toContain('resolveUserNotifyDelivery')
  })

  it('always emails password reset links', () => {
    const src = readFileSync(resolve('server/services/password-reset-email.service.ts'), 'utf8')
    expect(src).not.toContain('resolveUserNotifyDelivery')
    expect(src).not.toContain('enqueueTemplatedSms')
  })

  it('always emails login notifications', () => {
    const src = readFileSync(resolve('server/services/login-notification.service.ts'), 'utf8')
    expect(src).not.toContain('resolveUserNotifyDelivery')
    expect(src).not.toContain('enqueueTemplatedSms')
  })

  it('does not await geofence challenge delivery on HTML navigations', () => {
    const src = readFileSync(resolve('server/middleware/guard-access-gate.ts'), 'utf8')
    expect(src).toContain('void quietlyIssueOutsideGeoChallenge')
    expect(src).not.toMatch(/await quietlyIssueOutsideGeoChallenge/)
  })

  it('does not send Quo SMS from the embedded Nitro worker', () => {
    const plugin = readFileSync(resolve('server/plugins/background-workers.ts'), 'utf8')
    const tick = readFileSync(resolve('server/lib/general-worker-tick.mjs'), 'utf8')
    expect(plugin).toContain('skipSms: true')
    expect(tick).toContain('opts.skipSms')
  })

  it('queues worker recipient SMS instead of calling Quo inline', () => {
    const src = readFileSync(resolve('server/workers/lib/sms-notify.mjs'), 'utf8')
    expect(src).toContain('await queueSmsJob(pool, {')
    expect(src).not.toMatch(/enqueueRecipientNotification[\s\S]*sendQuoSmsDirect/)
  })
})

describe('signup phone field', () => {
  it('is always visible and optional on the request-account form', () => {
    const ui = readFileSync(resolve('app/components/auth/AuthScreen.vue'), 'utf8')
    expect(ui).toContain('id="signup-phone"')
    expect(ui).toContain('(optional)')
    expect(ui).not.toContain('quoSmsEnabled')
    const phoneBlock = ui.match(/id="signup-phone"[\s\S]*?>/)?.[0] ?? ''
    expect(phoneBlock).not.toContain('required')
  })
})
