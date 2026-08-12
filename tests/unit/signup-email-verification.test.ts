import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('signup verification is always email', () => {
  it('creates users with email notify channel regardless of phone', () => {
    const src = readFileSync(resolve('server/auth/auth.service.ts'), 'utf8')
    expect(src).toContain("messageNotifyChannel: 'email'")
    expect(src).not.toContain('phone ? \'sms\' : \'email\'')
  })

  it('never routes signup verification through Quo SMS', () => {
    const svc = readFileSync(resolve('server/services/verification-email.service.ts'), 'utf8')
    expect(svc).not.toContain('resolveUserNotifyDelivery')
    expect(svc).not.toContain('enqueueTemplatedSms')
    expect(svc).toContain('email_send')
  })

  it('accepts blank phone on signup even when Quo is enabled', () => {
    const route = readFileSync(resolve('server/api/auth/signup.post.ts'), 'utf8')
    expect(route).toContain('optionalPhoneE164Schema')
    expect(route).not.toContain('isQuoEnabled')
    expect(route).not.toContain('phoneE164Schema')
  })

  it('tells users to check email after signup', () => {
    const route = readFileSync(resolve('server/api/auth/signup.post.ts'), 'utf8')
    expect(route).toContain('Check your email to verify your account')
    expect(route).not.toContain('Check your phone')
  })
})

describe('signup UI phone field', () => {
  it('marks phone optional and does not require it on submit', () => {
    const ui = readFileSync(resolve('app/components/auth/AuthScreen.vue'), 'utf8')
    expect(ui).toContain('Phone number <span class="help">(optional)</span>')
    const phoneBlock = ui.match(/id="signup-phone"[\s\S]*?>/)?.[0] ?? ''
    expect(phoneBlock).not.toContain('required')
  })
})
