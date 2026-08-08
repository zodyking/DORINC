import { describe, expect, it } from 'vitest'
import {
  buildPrintMeSubject,
  extractPrintMeReleaseCode,
  extractPrintMeSubjectToken,
  isPrintMeSender,
  replyMatchesPrintMeJob,
} from '../../shared/staples-printme'

describe('staples printme helpers', () => {
  it('detects PrintMe senders', () => {
    expect(isPrintMeSender('PrintMe <noreply@printme.com>')).toBe(true)
    expect(isPrintMeSender('staples@printme.com')).toBe(true)
    expect(isPrintMeSender('customer@fleet.com')).toBe(false)
  })

  it('embeds and extracts correlation tokens from subjects', () => {
    const subject = buildPrintMeSubject('ABC12DEF')
    expect(subject).toContain('[DORINC-PRINT-ABC12DEF]')
    expect(extractPrintMeSubjectToken(`Re: ${subject}`)).toBe('ABC12DEF')
  })

  it('extracts labeled release codes from confirmation text', () => {
    expect(extractPrintMeReleaseCode(
      'Thanks for using PrintMe.\nYour Release Code is: 4F92KQ\nEnter it at any Staples PrintMe kiosk.',
    )).toBe('4F92KQ')

    expect(extractPrintMeReleaseCode(
      null,
      '<p>Document ID: <b>8831201</b></p>',
    )).toBe('8831201')
  })

  it('matches replies by In-Reply-To / References', () => {
    const outbound = '<job-123@dorinc.local>'
    expect(replyMatchesPrintMeJob(outbound, {
      inReplyTo: outbound,
      references: outbound,
      subject: 'Your PrintMe document',
    })).toBe(true)

    expect(replyMatchesPrintMeJob(outbound, {
      inReplyTo: null,
      references: null,
      subject: 'Re: DORINC Service Log Sheet [DORINC-PRINT-AABBCCDD]',
    })).toBe(true)

    expect(replyMatchesPrintMeJob(outbound, {
      inReplyTo: '<other@x.com>',
      references: null,
      subject: 'Hello',
    })).toBe(false)
  })
})
