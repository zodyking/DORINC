import { describe, expect, it } from 'vitest'
import { formatPlatformHelpHtml, matchPlatformHelpAnswer } from '../../shared/platform-help'

describe('formatPlatformHelpHtml', () => {
  it('converts markdown numbered steps to an ordered list', () => {
    const raw = 'Follow these steps:\n1. Open Customers\n2. Click New Customer\n3. Save'
    const html = formatPlatformHelpHtml(raw)
    expect(html).toContain('help-steps')
    expect(html).toContain('<li>Open Customers</li>')
    expect(html).toContain('<li>Click New Customer</li>')
  })

  it('strips truncated HTML tags at the end', () => {
    const html = formatPlatformHelpHtml('<p>Complete the form and click <')
    expect(html).toBe('<p>Complete the form and click')
  })

  it('structures Steps/Tips paragraphs into styled lists', () => {
    const raw = '<p>Here is how.</p><p>Steps</p><p>Go to <b>Invoices</b>.</p><p>Click <b>New Invoice</b>.</p><p>Tips</p><p>Use drafts first.</p>'
    const html = formatPlatformHelpHtml(raw)
    expect(html).toContain('<h4 class="help-section">Steps</h4>')
    expect(html).toContain('<ol class="help-steps">')
    expect(html).toContain('<ul class="help-tips">')
    expect(html).toContain('class="help-lead"')
  })

  it('converts numbered HTML paragraphs under Steps into a list', () => {
    const raw = '<p>How to invoice:</p><p>Steps</p><p>1. Go to <b>Invoices</b>.</p><p>2. Click <b>New Invoice</b>.</p>'
    const html = formatPlatformHelpHtml(raw)
    expect(html).toContain('<h4 class="help-section">Steps</h4>')
    expect(html).toContain('<ol class="help-steps">')
    expect(html).toContain('Go to <b>Invoices</b>')
  })

  it('converts plain-text Steps blocks into lists', () => {
    const raw = 'Start here.\n\nSteps\nGo to Invoices\nClick New Invoice\n\nTips\nSave as draft first'
    const html = formatPlatformHelpHtml(raw)
    expect(html).toContain('help-steps')
    expect(html).toContain('help-tips')
  })

  it('converts markdown headings to h4 section headers', () => {
    const html = formatPlatformHelpHtml('### Steps\n1. Open Customers\n2. Save')
    expect(html).toContain('<h4 class="help-section">Steps</h4>')
    expect(html).toContain('<ol')
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
