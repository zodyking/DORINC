import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatPlatformHelpForSms,
  formatPlatformHelpHtml,
  matchPlatformHelpAnswer,
  susanTemporarilyUnavailableHtml,
} from '../../shared/platform-help'

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

describe('formatPlatformHelpForSms', () => {
  it('converts HTML help into short plain SMS text with numbered steps', () => {
    const sms = formatPlatformHelpForSms(
      '<p>Hi Alex!</p><p>I can help with DORINC.</p>'
      + '<h4 class="help-section">What I can help with</h4>'
      + '<ol class="help-steps"><li>Explain navigation</li><li>Walk through workflows</li></ol>',
    )
    expect(sms).not.toMatch(/<[^>]+>/)
    expect(sms).toMatch(/1\) Explain navigation/)
    expect(sms).toMatch(/2\) Walk through workflows/)
    expect(sms).toContain('Hi Alex!')
    expect(sms).toMatch(/1\) Explain navigation\n\n2\) Walk through workflows/)
  })

  it('breaks a packed feature dump into titled blocks with blank lines', () => {
    const sms = formatPlatformHelpForSms(
      'Brandon, some useful DORINC features include: '
      + '1. AI service-log extraction: upload photos of handwritten or printed logs, review the results, and convert accepted lines into an invoice. '
      + '2. QR phone uploads: add service-log photos directly from a phone. '
      + '3. Invoice tools: packages, catalog-based line items, PDF previews, payment recording, and payment reconciliation. '
      + '4. Customer portal: customers can access their own invoices and account information. '
      + '5. Fleet records: organize customers with linked vehicles or units. '
      + '6. Custom templates: design invoice PDFs and edit email or notification templates. '
      + '7. Dashboard queues: quickly find items needing review or attention.',
    )
    expect(sms).toContain('Brandon, some useful DORINC features include:')
    expect(sms).toContain('1) AI service-log extraction\nUpload photos of handwritten or printed logs')
    expect(sms).toContain('2) QR phone uploads\nAdd service-log photos directly from a phone.')
    expect(sms).toContain('4) Customer portal\nCustomers can access their own invoices')
    expect(sms).toMatch(/1\) AI service-log extraction[\s\S]+\n\n2\) QR phone uploads/)
    expect(sms).toMatch(/3\) Invoice tools\nPackages/)
    expect(sms.split('\n\n').length).toBeGreaterThan(6)
  })

  it('puts a blank line between already-numbered SMS items', () => {
    const sms = formatPlatformHelpForSms('Try this:\n1. Open Invoices\n2. Tap New Invoice\n3. Save')
    expect(sms).toBe('Try this:\n\n1) Open Invoices\n\n2) Tap New Invoice\n\n3) Save')
  })

  it('does not leave SMS-chat feature wording in the reply', () => {
    const sms = formatPlatformHelpForSms('I can help you use the SMS chat with Susan AI.')
    expect(sms).not.toMatch(/SMS chat with Susan AI/i)
    expect(sms).toContain('DORINC')
  })

  it('truncates very long replies', () => {
    const sms = formatPlatformHelpForSms('A'.repeat(2000), 200)
    expect(sms.length).toBeLessThanOrEqual(200)
    expect(sms.endsWith('…')).toBe(true)
  })
})

describe('SMS help prompt keeps lists scannable', () => {
  it('tells the model not to pack numbered items into one paragraph', () => {
    const src = readFileSync(resolve('server/services/platform-help.service.ts'), 'utf8')
    expect(src).toContain('Never pack 1) 2) 3) into one paragraph')
    expect(src).toContain('one item per block, with a blank line between items')
    expect(src).toContain('Max 5 items')
  })
})

describe('susanTemporarilyUnavailableHtml', () => {
  it('is a complete retry message without provider internals', () => {
    const html = susanTemporarilyUnavailableHtml('Brandon King')
    expect(html).toContain('Hi Brandon.')
    expect(html).toContain('Please wait a moment and try again.')
    expect(html).not.toContain('OpenRouter')
    expect(html).not.toContain('no content')
    expect(html.endsWith('</p>')).toBe(true)
  })
})
