import { describe, expect, it } from 'vitest'
import { matchPlatformHelpAnswer } from '../../shared/platform-help'
import {
  helpEntityFromRoute,
  helpPageKeyFromRoute,
  isPlatformHelpWidgetVisible,
  platformHelpModelLabel,
  platformHelpPoweredByLabel,
} from '../../app/utils/platform-help-ui'

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

  it('binds open records for Susan entity tools', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(helpEntityFromRoute(`/invoices/${id}`).entityType).toBe('invoice')
    expect(helpEntityFromRoute('/invoices/new')).toEqual({})
  })

  it('hides the floating helper unless platform help is explicitly enabled', () => {
    expect(isPlatformHelpWidgetVisible(true, { enabled: true })).toBe(true)
    expect(isPlatformHelpWidgetVisible(true, { enabled: false })).toBe(false)
    expect(isPlatformHelpWidgetVisible(true, null)).toBe(false)
    expect(isPlatformHelpWidgetVisible(true, undefined)).toBe(false)
    expect(isPlatformHelpWidgetVisible(false, { enabled: true })).toBe(false)
  })

  it('formats OpenRouter model ids for the powered-by footer', () => {
    expect(platformHelpModelLabel('openai/gpt-4o-mini')).toBe('gpt-4o-mini')
    expect(platformHelpPoweredByLabel('anthropic/claude-3.5-sonnet')).toBe('Powered by claude-3.5-sonnet')
    expect(platformHelpPoweredByLabel(null)).toBe('Powered by AI')
  })
})
