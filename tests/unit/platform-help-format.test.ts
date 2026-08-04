import { describe, expect, it } from 'vitest'
import { formatPlatformHelpHtml, matchPlatformHelpAnswer } from '../../shared/platform-help'

describe('formatPlatformHelpHtml', () => {
  it('converts markdown numbered steps to an ordered list', () => {
    const raw = 'Follow these steps:\n1. Open Customers\n2. Click New Customer\n3. Save'
    const html = formatPlatformHelpHtml(raw)
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>Open Customers</li>')
    expect(html).toContain('<li>Click New Customer</li>')
  })

  it('strips truncated HTML tags at the end', () => {
    const html = formatPlatformHelpHtml('<p>Complete the form and click <')
    expect(html).toBe('<p>Complete the form and click')
  })

  it('converts markdown headings to h4 section headers', () => {
    const html = formatPlatformHelpHtml('### Steps\n1. Open Customers\n2. Save')
    expect(html).toContain('<h4>Steps</h4>')
    expect(html).toContain('<ol>')
  })

  it('removes disallowed tags but keeps allowed formatting', () => {
    const html = formatPlatformHelpHtml('<p>Go to <b>Customers</b></p><script>alert(1)</script>')
    expect(html).toContain('<b>Customers</b>')
    expect(html).not.toContain('script')
  })
})

describe('matchPlatformHelpAnswer formatting', () => {
  it('returns formatted fallback for known topics', () => {
    const answer = formatPlatformHelpHtml(matchPlatformHelpAnswer('How do I create a new invoice?'))
    expect(answer).toContain('<b>')
  })
})
