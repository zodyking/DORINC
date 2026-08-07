import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVICE_LOG_EXTRACTION_RULES,
  buildExtractionSystemPrompt,
  buildPageTypeSystemPrompt,
  mergeServiceLogPageExtractions,
  normalizePageType,
  normalizeServiceLogExtractionRules,
} from '../../shared/service-log-extraction-rules.mjs'

describe('service log extraction rules', () => {
  it('normalizes empty rules to defaults', () => {
    expect(normalizeServiceLogExtractionRules('')).toBe(DEFAULT_SERVICE_LOG_EXTRACTION_RULES)
  })

  it('builds page-type and extraction prompts', () => {
    expect(buildPageTypeSystemPrompt()).toContain('handwritten')
    expect(buildPageTypeSystemPrompt()).toContain('printed_form')
    const prompt = buildExtractionSystemPrompt(DEFAULT_SERVICE_LOG_EXTRACTION_RULES, 'printed_form')
    expect(prompt).toContain('printed form')
    expect(prompt).toContain('draftLineItems')
  })

  it('normalizes page types', () => {
    expect(normalizePageType('printed_form')).toBe('printed_form')
    expect(normalizePageType('form')).toBe('printed_form')
    expect(normalizePageType('handwritten')).toBe('handwritten')
    expect(normalizePageType('weird')).toBe('handwritten')
  })

  it('merges multi-page extractions', () => {
    const merged = mergeServiceLogPageExtractions([
      {
        fileId: '11111111-1111-1111-1111-111111111111',
        pageType: 'handwritten',
        complaint: 'Noise',
        internalNotes: 'Check hub',
        draftLineItems: [{ description: 'Hub seal', qty: '1', rate: '40', amount: '40' }],
      },
      {
        fileId: '22222222-2222-2222-2222-222222222222',
        pageType: 'printed_form',
        complaint: 'Noise',
        internalNotes: 'Torque to spec',
        draftLineItems: [{ description: 'Labor', qty: '1', rate: '120', amount: '120' }],
      },
    ], '11111111-1111-1111-1111-111111111111')

    expect(merged.complaint).toBe('Noise')
    expect(merged.internalNotes).toContain('Check hub')
    expect(merged.internalNotes).toContain('Torque to spec')
    expect(merged.draftLineItems).toHaveLength(2)
    expect(merged.pageResults).toHaveLength(2)
  })
})
