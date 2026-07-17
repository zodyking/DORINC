import { describe, expect, it } from 'vitest'
import { looksLikeEmailCssArtifact, normalizeInboundBody } from '../../shared/email-css-artifact.mjs'

describe('email-css-artifact', () => {
  it('normalizes inbound bodies that leaked css as plain text', () => {
    const cssLeak = [
      'body { margin: 0; padding: 0; width: 100%; background: #f4f7fa; }',
      '.email-container { width: 100%; max-width: 620px; margin: 0 auto; }',
    ].join('\n')
    const html = '<div class="email-container"><p>We got your email body</p></div>'

    expect(looksLikeEmailCssArtifact(cssLeak)).toBe(true)
    expect(normalizeInboundBody(cssLeak, html)).toBe('We got your email body')
  })
})
