import { describe, expect, it } from 'vitest'
import {
  cleanPlainEmailText,
  emailBodyForDisplay,
  emailPreviewText,
  linkifyPlainEmailText,
  normalizeInboundEmailText,
  sanitizeEmailHtml,
  stripHtmlToText,
} from '../../shared/email-display'

describe('email-display', () => {
  it('strips image placeholders from plain text', () => {
    expect(cleanPlainEmailText('Hello [image: Google] world')).toBe('Hello world')
  })

  it('converts html to readable plain text', () => {
    expect(stripHtmlToText('<p>Hello<br>there</p>')).toContain('Hello')
    expect(stripHtmlToText('<p>Hello<br>there</p>')).toContain('there')
  })

  it('falls back to html when plain text is empty', () => {
    expect(normalizeInboundEmailText('', '<p>Security alert</p>')).toBe('Security alert')
  })

  it('builds shorter previews for long urls', () => {
    const preview = emailPreviewText(
      'Visit https://accounts.google.com/signin/v2/challenge/pwd?flowName=GlifWebSignIn&continue=true for details',
    )
    expect(preview.length).toBeLessThanOrEqual(140)
    expect(preview).toContain('accounts.google.com')
  })

  it('linkifies plain text urls', () => {
    const html = linkifyPlainEmailText('See https://example.com/path now')
    expect(html).toContain('<a href="https://example.com/path"')
    expect(html).toContain('example.com/path')
  })

  it('sanitizes dangerous html', () => {
    const safe = sanitizeEmailHtml('<p onclick="alert(1)">Hi</p><script>alert(1)</script>')
    expect(safe).not.toContain('script')
    expect(safe).not.toContain('onclick')
    expect(safe).toContain('Hi')
  })

  it('prefers sanitized html for display', () => {
    const result = emailBodyForDisplay('fallback', '<p><strong>Alert</strong></p>')
    expect(result.mode).toBe('html')
    expect(result.content).toContain('<strong>Alert</strong>')
  })
})
