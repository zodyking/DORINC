import { describe, expect, it } from 'vitest'
import {
  assertPrintMePdfAttachment,
  buildPrintMeMailPayload,
  buildPrintMeSubject,
  extractPrintMeReleaseCode,
  extractPrintMeSubjectToken,
  isPrintMeSender,
  replyMatchesPrintMeJob,
} from '../../shared/staples-printme'
import {
  buildNotificationSendMailOptions,
  composeRawMimeMessage,
} from '../../server/mail/outbound-notification-mail.mjs'

function fakePdf(bytes = 1200): Buffer {
  const buf = Buffer.alloc(bytes, 0x20)
  buf.write('%PDF-1.4', 0, 'utf8')
  return buf
}

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

  it('extracts Staples 8-digit retrieval codes from confirmation text', () => {
    expect(extractPrintMeReleaseCode(
      'Thanks for using Staples PrintMe.\nYour retrieval code is: 48291037\nEnter it at any Staples self-service printer.',
    )).toBe('48291037')

    expect(extractPrintMeReleaseCode(
      'Check your email for the 8-digit code or barcode.\n\n71930482\n',
    )).toBe('71930482')

    expect(extractPrintMeReleaseCode(
      null,
      '<p>Document ID: <b>88312015</b></p>',
    )).toBe('88312015')
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

  it('rejects non-PDF payloads before emailing PrintMe', () => {
    expect(assertPrintMePdfAttachment(Buffer.from('not-a-pdf')).ok).toBe(false)
    expect(assertPrintMePdfAttachment(Buffer.alloc(0)).ok).toBe(false)
    expect(assertPrintMePdfAttachment(fakePdf()).ok).toBe(true)
  })

  it('builds a Staples PrintMe mail with the PDF attached and no HTML body', () => {
    const pdf = fakePdf(2048)
    const built = buildPrintMeMailPayload({ token: 'AABBCCDD11', pdf })
    expect(built.ok).toBe(true)
    expect(built.mail?.to).toBe('staples@printme.com')
    expect(built.mail?.subject).toContain('[DORINC-PRINT-AABBCCDD11]')
    expect((built.mail as { html?: string }).html).toBeUndefined()
    expect(built.mail?.attachments).toHaveLength(1)
    expect(built.mail?.attachments[0]?.filename).toBe('service-log-sheet.pdf')
    expect(built.mail?.attachments[0]?.contentType).toBe('application/pdf')
    expect(built.mail?.attachments[0]?.contentDisposition).toBe('attachment')
    expect(built.mail?.attachments[0]?.content.equals(pdf)).toBe(true)
  })

  it('composes MIME that includes the PDF as an attachment part', async () => {
    const pdf = fakePdf(1500)
    const built = buildPrintMeMailPayload({ token: 'MIMETEST01', pdf })
    expect(built.ok).toBe(true)

    const options = buildNotificationSendMailOptions({
      from: 'shop@example.com',
      to: built.mail!.to,
      subject: built.mail!.subject,
      text: built.mail!.text,
      messageId: '<staples.test@example.com>',
      attachments: built.mail!.attachments,
    })

    const raw = await composeRawMimeMessage(options)
    const mime = raw.toString('utf8')
    expect(mime).toContain('To: staples@printme.com')
    expect(mime).toContain('Subject: DORINC Service Log Sheet [DORINC-PRINT-MIMETEST01]')
    expect(mime).toMatch(/Content-Type:\s*application\/pdf/i)
    expect(mime).toMatch(/Content-Disposition:\s*attachment/i)
    expect(mime).toMatch(/filename[^;=\n]*=\s*"?service-log-sheet\.pdf"?/i)
    expect(mime).not.toMatch(/Content-Type:\s*text\/html/i)
  })
})
