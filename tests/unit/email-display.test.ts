import { describe, expect, it } from 'vitest'
import {
  cleanPlainEmailText,
  emailBodyForDisplay,
  emailBodyForThreadDisplay,
  emailPreviewText,
  linkifyPlainEmailText,
  normalizeInboundEmailText,
  prepareEmailHtmlIframeDocument,
  sanitizeEmailHtml,
  shouldRenderEmailAsHtml,
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

  it('prefers html iframe content for display when html exists', () => {
    const result = emailBodyForDisplay('fallback', '<p><strong>Alert</strong></p>')
    expect(result.mode).toBe('html')
    expect(result.content).toContain('<strong>Alert</strong>')
  })

  it('builds a sandboxed iframe document with preserved styles', () => {
    const doc = prepareEmailHtmlIframeDocument(`
      <html><head><style>p { color: red; }</style></head>
      <body><p>Hello</p></body></html>
    `)
    expect(doc).toContain('color: red')
    expect(doc).toContain('<p>Hello</p>')
    expect(doc).not.toContain('<script')
  })

  it('prefers html iframe for inbound thread messages', () => {
    const result = emailBodyForThreadDisplay(
      '',
      '<p><strong>Customer note</strong></p>',
      'inbound',
    )
    expect(result.mode).toBe('html')
    expect(result.content).toContain('<strong>Customer note</strong>')
  })

  it('prefers plain text when html is mostly signature boilerplate', () => {
    const html = `
      <div><table><tr><td><b>Brandon King</b></td></tr>
      <tr><td>Brooklyn New York, 11207</td></tr></table></div>
    `
    const body = 'Wheres the invoice'
    expect(shouldRenderEmailAsHtml(html, body)).toBe(false)
    const rendered = emailBodyForThreadDisplay(body, html, 'inbound')
    expect(rendered.mode).toBe('text')
    expect(rendered.content).toContain('Wheres the invoice')
  })

  it('prefers html templates for outbound thread messages', () => {
    const result = emailBodyForThreadDisplay(
      'Its working!',
      '<div><p>Its working!</p><hr><footer>Devon On Site Repairs Inc.</footer></div>',
      'outbound',
    )
    expect(result.mode).toBe('html')
    expect(result.content).toContain('Its working!')
    expect(result.content).toContain('footer')
    expect(shouldRenderEmailAsHtml(result.content, 'Its working!', 'outbound')).toBe(true)
  })

  it('strips height constraints from email styles and inline styles in iframe doc', () => {
    const doc = prepareEmailHtmlIframeDocument(`
      <style>body { height: 120px; overflow: auto; } div.msg { max-height: 100px; }</style>
      <div style="height: 150px; overflow: scroll">Please see the attached check.</div>
    `)
    expect(doc).not.toMatch(/height\s*:\s*120px/)
    expect(doc).not.toMatch(/overflow\s*:\s*auto/)
    expect(doc).toContain('height: auto !important')
    expect(doc).toContain('Please see the attached check.')
  })
})
