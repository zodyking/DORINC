import { describe, expect, it } from 'vitest'
import {
  applyEmailTemplateOverride,
  finalizeMailWithTemplateOverride,
  interpolateEmailTemplate,
} from '../../server/mail/email-template-override.mjs'

describe('email template override merge', () => {
  it('applies subject, lead, note, and CTA label overrides', () => {
    const merged = applyEmailTemplateOverride({
      subject: 'Default subject',
      eyebrow: 'Default eyebrow',
      headline: 'Default headline',
      lead: 'Default lead',
      note: { title: 'Default note', body: 'Default body' },
      primaryAction: { href: 'https://example.com', label: 'Default CTA' },
    }, {
      subject: 'Hello {{name}}',
      lead: 'Lead for {{brandName}}',
      noteTitle: 'Custom note',
      noteBody: 'Body {{name}}',
      primaryActionLabel: 'Open now',
    }, {
      name: 'Alex',
      brandName: 'Acme',
    })

    expect(merged.subject).toBe('Hello Alex')
    expect(merged.lead).toBe('Lead for Acme')
    expect(merged.note).toEqual({ title: 'Custom note', body: 'Body Alex' })
    expect(merged.primaryAction.label).toBe('Open now')
    expect(interpolateEmailTemplate('{{missing}}', {})).toBe('')
  })

  it('replaces mail HTML when htmlSource is present', () => {
    const mail = finalizeMailWithTemplateOverride({
      subject: 'Default',
      text: 'text',
      html: '<p>generated</p>',
    }, {
      subject: 'Hi {{name}}',
      htmlSource: '<html><body>Hello {{name}}</body></html>',
    }, { name: 'Alex' })

    expect(mail.subject).toBe('Hi Alex')
    expect(mail.html).toBe('<html><body>Hello Alex</body></html>')
  })
})
