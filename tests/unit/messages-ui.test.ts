import { describe, expect, it } from 'vitest'
import {
  detectEntityTrigger,
  entityPath,
  entityRefToken,
  messagePreviewText,
  renderMessageBody,
} from '../../app/utils/messages-ui'

describe('messages-ui', () => {
  it('builds entity ref tokens and paths', () => {
    const token = entityRefToken({
      entityType: 'invoice',
      entityId: '00000000-0000-0000-0000-000000000001',
      entityLabel: 'INV-000001',
    })
    expect(token).toContain('invoice')
    expect(entityPath('invoice', 'abc')).toBe('/invoices/abc')
    expect(entityPath('service_log', 'abc')).toBe('/service-logs/abc')
  })

  it('detects compose trigger keywords at cursor', () => {
    const text = 'Please review invoice'
    const hit = detectEntityTrigger(text, text.length)
    expect(hit?.entityType).toBe('invoice')
    expect(hit?.keyword).toBe('invoice')
  })

  it('renders entity refs as links in message body', () => {
    const body = `See ${entityRefToken({
      entityType: 'customer',
      entityId: '00000000-0000-0000-0000-000000000002',
      entityLabel: 'Acme Fleet',
    })} today`
    const html = renderMessageBody(body)
    expect(html).toContain('class="dm-entity-link"')
    expect(html).toContain('href="/customers/')
    expect(html).toContain('Acme Fleet')
    expect(messagePreviewText(body)).toBe('See Acme Fleet today')
  })
})
