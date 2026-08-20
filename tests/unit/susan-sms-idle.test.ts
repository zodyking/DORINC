import { describe, expect, it } from 'vitest'
import {
  SUSAN_SMS_IDLE_MS,
  SUSAN_SMS_IDLE_SECONDS,
  formatSusanSmsIdleTimeoutMessage,
  lastSusanSmsUserText,
  susanSmsIdleThreadPatch,
  topicForSusanSmsIdle,
} from '../../shared/susan-sms-idle.mjs'

describe('Susan SMS idle timeout copy', () => {
  it('is 5 minutes', () => {
    expect(SUSAN_SMS_IDLE_SECONDS).toBe(300)
    expect(SUSAN_SMS_IDLE_MS).toBe(5 * 60 * 1000)
  })

  it('wraps up a lookup with a neat timeout note', () => {
    const text = formatSusanSmsIdleTimeoutMessage('looking up INV-000658')
    expect(text).toBe(
      [
        'Glad I could help with looking up INV-000658.',
        '',
        'This session timed out after 5 minutes of quiet.',
        `Text me anytime — I'm Susan, your personal AI assistant.`,
      ].join('\n'),
    )
    expect(text).not.toMatch(/\b(CANCEL|STOP|QUIT)\b/)
  })

  it('uses a generic wrap-up when there is no specific topic', () => {
    const text = formatSusanSmsIdleTimeoutMessage(null)
    expect(text.startsWith('Glad I could help.')).toBe(true)
    expect(text).toContain('timed out after 5 minutes')
    expect(text).toContain('personal AI assistant')
  })
})

describe('Susan SMS idle topic', () => {
  it('names a confirm send from the preview invoice number', () => {
    expect(topicForSusanSmsIdle({
      kind: 'confirm',
      tool: 'send_invoice',
      args: { invoiceId: 'abc' },
      preview: "I'll resend INV-000658 ($12,400.00, sent) for Tomer to a@b.com.",
      startedAt: new Date().toISOString(),
    }, 'yes')).toBe('sending INV-000658')
  })

  it('names a lookup wizard from the search query', () => {
    expect(topicForSusanSmsIdle({
      kind: 'wizard',
      action: 'lookup_customer',
      step: 'await_query',
      data: { query: 'Tomer' },
      startedAt: new Date().toISOString(),
    }, 'Tomer')).toBe('looking up Tomer')
  })

  it('treats a menu phrase as the action menu', () => {
    expect(topicForSusanSmsIdle(null, 'Text Menu')).toBe('the action menu')
  })

  it('does not paste a free-form question into “help with …”', () => {
    expect(topicForSusanSmsIdle(null, 'How do I create an invoice?')).toBeNull()
  })

  it('reads the last user line from history', () => {
    expect(lastSusanSmsUserText([
      { role: 'user', content: 'menu' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'lookup invoice 658' },
      { role: 'assistant', content: 'INV-000658' },
    ])).toBe('lookup invoice 658')
  })
})

describe('Susan SMS idle thread patch', () => {
  const now = new Date('2026-08-20T16:00:00.000Z')

  it('starts the 5-minute clock on a real user reply', () => {
    expect(susanSmsIdleThreadPatch('user_reply', now)).toEqual({
      lastUserAt: now,
      idleClosedAt: null,
    })
  })

  it('closes the session on a carrier keyword without bumping last_user_at', () => {
    expect(susanSmsIdleThreadPatch('carrier', now)).toEqual({
      idleClosedAt: now,
    })
  })
})
