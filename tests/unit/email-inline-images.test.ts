import { describe, expect, it } from 'vitest'
import { normalizeContentId, rewriteEmailHtmlCidSources } from '../../shared/email-inline-images'

describe('email-inline-images', () => {
  it('normalizes content ids for lookup', () => {
    expect(normalizeContentId('<abc@host>')).toBe('abc@host')
    expect(normalizeContentId('cid:ABC@host')).toBe('abc@host')
  })

  it('rewrites cid image sources to preview urls', () => {
    const html = '<p>Hi</p><img src="cid:logo@mailer" alt="logo">'
    const out = rewriteEmailHtmlCidSources(html, cid =>
      cid === 'logo@mailer' ? '/api/preview/logo' : null,
    )
    expect(out).toContain('src="/api/preview/logo"')
    expect(out).not.toContain('cid:')
  })

  it('rewrites unquoted cid image sources', () => {
    const html = '<img src=cid:logo@mailer alt="logo">'
    const out = rewriteEmailHtmlCidSources(html, cid =>
      cid === 'logo@mailer' ? '/api/preview/logo' : null,
    )
    expect(out).toContain('src="/api/preview/logo"')
  })

  it('leaves unknown cid references unchanged', () => {
    const html = '<img src="cid:missing@mailer">'
    expect(rewriteEmailHtmlCidSources(html, () => null)).toBe(html)
  })
})
