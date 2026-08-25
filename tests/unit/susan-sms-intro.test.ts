import { describe, expect, it } from 'vitest'
import {
  SUSAN_SMS_INTRO_MS,
  SUSAN_SMS_INTRO_SECONDS,
  formatSusanSmsIntroMessage,
  isSusanSmsIntroDue,
} from '../../shared/susan-sms-intro.mjs'

const now = new Date('2026-08-21T12:00:00.000Z')

describe('Susan SMS how-to copy', () => {
  it('is a short SMS intro with Menu, not carrier keywords', () => {
    const text = formatSusanSmsIntroMessage()
    expect(text).toBe(
      [
        `Hey — I'm Susan, your AI assistant.`,
        '',
        'You can chat with me here or in the app for your DORINC Suite needs.',
        '',
        'Just ask me anything, or text Menu for commands.',
      ].join('\n'),
    )
    expect(text).not.toMatch(/\b(CANCEL|STOP|QUIT)\b/)
    expect(SUSAN_SMS_INTRO_SECONDS).toBe(72 * 60 * 60)
    expect(SUSAN_SMS_INTRO_MS).toBe(72 * 60 * 60 * 1000)
  })
})

describe('Susan SMS how-to cadence', () => {
  it('sends to staff who have never texted and never got the how-to', () => {
    expect(isSusanSmsIntroDue({}, now)).toBe(true)
  })

  it('does not resend when the staffer texted in the last 72 hours', () => {
    expect(isSusanSmsIntroDue({
      lastUserAt: new Date('2026-08-20T12:01:00.000Z'),
    }, now)).toBe(false)
  })

  it('resends when the last staff text was at least 72 hours ago', () => {
    expect(isSusanSmsIntroDue({
      lastUserAt: new Date('2026-08-18T12:00:00.000Z'),
      lastIntroAt: new Date('2026-08-18T12:00:00.000Z'),
    }, now)).toBe(true)
  })

  it('does not resend within 72 hours of the last how-to', () => {
    expect(isSusanSmsIntroDue({
      lastIntroAt: new Date('2026-08-20T12:00:00.000Z'),
    }, now)).toBe(false)
  })

  it('never sends after a carrier opt-out', () => {
    expect(isSusanSmsIntroDue({
      optedOutAt: new Date('2026-08-01T00:00:00.000Z'),
    }, now)).toBe(false)
  })

  it('does not talk over a live 5-minute chat', () => {
    expect(isSusanSmsIntroDue({
      lastUserAt: new Date('2026-08-21T11:58:00.000Z'),
    }, now)).toBe(false)
  })
})
