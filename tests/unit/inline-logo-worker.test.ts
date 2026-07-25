import { describe, expect, it } from 'vitest'
import { embedInlineLogoInHtml } from '../../server/mail/inline-logo.mjs'

describe('inline-logo worker embedding', () => {
  it('does not attach inline logos (text-only email headers)', async () => {
    const html = `<img src="https://app.example.com/images/dorinc-icon-trans.png" width="38" height="38" alt="Shop">`
    const result = await embedInlineLogoInHtml(html, {})
    expect(result.html).toBe(html)
    expect(result.attachments).toEqual([])
  })
})
