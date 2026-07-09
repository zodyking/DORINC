import { describe, expect, it } from 'vitest'
import { matchPlatformHelpAnswer } from '../../shared/platform-help'
import { helpPageKeyFromRoute } from '../../app/utils/platform-help-ui'

describe('platform-help (P2-15)', () => {
  it('matches keyword answers for invoice questions', () => {
    const answer = matchPlatformHelpAnswer('How do I create a new invoice?')
    expect(answer).toContain('New Invoice')
  })

  it('returns default fallback for unknown questions', () => {
    const answer = matchPlatformHelpAnswer('xyzzy plugh')
    expect(answer).toContain('I can help with invoices')
  })

  it('maps routes to page keys for contextual suggestions', () => {
    expect(helpPageKeyFromRoute('/dashboard')).toBe('dashboard')
    expect(helpPageKeyFromRoute('/invoices/new')).toBe('create')
    expect(helpPageKeyFromRoute('/invoices/abc-123/edit')).toBe('editor')
    expect(helpPageKeyFromRoute('/invoices/abc-123')).toBe('invoice-detail')
    expect(helpPageKeyFromRoute('/admin')).toBe('admin')
    expect(helpPageKeyFromRoute('/admin', { tab: 'designer' })).toBe('designer')
  })
})
