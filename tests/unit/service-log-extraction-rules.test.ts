import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVICE_LOG_EXTRACTION_RULES,
  SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  buildPageTypeSystemPrompt,
  flattenActiveSheetItems,
  isSheetLockedPage,
  matchDraftLineToSheetItem,
  mergeServiceLogPageExtractions,
  normalizePageType,
  normalizeServiceLogExtractionRules,
  requiresHighCertaintyLines,
  sheetPriceToRate,
} from '../../shared/service-log-extraction-rules.mjs'
import { defaultServiceLogSheetDocument } from '../../shared/service-log-sheet-default'

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

  it('locks front printed prompts to the active sheet list', () => {
    const items = flattenActiveSheetItems(defaultServiceLogSheetDocument())
    const prompt = buildExtractionSystemPrompt(DEFAULT_SERVICE_LOG_EXTRACTION_RULES, 'printed_form', {
      sheetLocked: true,
      activeSheetItems: items,
    })
    expect(prompt).toContain('FRONT PRINTED CHECKLIST MODE')
    expect(prompt).toContain('item-oil-filter')
    expect(prompt).toContain('Replace Oil and Oil Filter')

    const user = buildExtractionUserPrompt(1, 2, 'printed_form', { activeSheetItems: items })
    expect(user).toContain('front checklist locked')
  })

  it('requires high certainty on rear / non-template prompts', () => {
    const prompt = buildExtractionSystemPrompt(DEFAULT_SERVICE_LOG_EXTRACTION_RULES, 'handwritten', {
      highCertainty: true,
    })
    expect(prompt).toContain('HIGH-CERTAINTY MODE')
    expect(prompt).toContain(String(SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD))

    const user = buildExtractionUserPrompt(2, 2, 'handwritten')
    expect(user).toContain('high-certainty')
  })

  it('normalizes page types and page modes', () => {
    expect(normalizePageType('printed_form')).toBe('printed_form')
    expect(normalizePageType('form')).toBe('printed_form')
    expect(normalizePageType('handwritten')).toBe('handwritten')
    expect(normalizePageType('weird')).toBe('handwritten')
    expect(isSheetLockedPage('printed_form', 1)).toBe(true)
    expect(isSheetLockedPage('printed_form', 2)).toBe(false)
    expect(isSheetLockedPage('handwritten', 1)).toBe(false)
    expect(requiresHighCertaintyLines('handwritten', 1)).toBe(true)
    expect(requiresHighCertaintyLines('printed_form', 2)).toBe(true)
    expect(requiresHighCertaintyLines('printed_form', 1)).toBe(false)
  })

  it('flattens and matches active sheet items', () => {
    const items = flattenActiveSheetItems(defaultServiceLogSheetDocument())
    expect(items.length).toBeGreaterThan(10)
    expect(sheetPriceToRate('$1,600')).toBe('1600')

    const byId = matchDraftLineToSheetItem({
      description: 'whatever',
      matchedSheetItemId: 'item-oil-filter',
    }, items)
    expect(byId?.item.id).toBe('item-oil-filter')

    const byName = matchDraftLineToSheetItem({
      description: 'Replace Oil and Oil Filter',
    }, items)
    expect(byName?.item.id).toBe('item-oil-filter')
  })

  it('merges multi-page extractions', () => {
    const merged = mergeServiceLogPageExtractions([
      {
        fileId: '11111111-1111-1111-1111-111111111111',
        pageIndex: 1,
        pageType: 'handwritten',
        complaint: 'Noise',
        internalNotes: 'Check hub',
        draftLineItems: [{
          description: 'Hub seal',
          qty: '1',
          rate: '40',
          amount: '40',
          confidence: 0.95,
        }],
      },
      {
        fileId: '22222222-2222-2222-2222-222222222222',
        pageIndex: 2,
        pageType: 'printed_form',
        complaint: 'Noise',
        internalNotes: 'Torque to spec',
        draftLineItems: [{
          description: 'Labor',
          qty: '1',
          rate: '120',
          amount: '120',
          confidence: 0.9,
        }],
      },
    ], '11111111-1111-1111-1111-111111111111')

    expect(merged.complaint).toBe('Noise')
    expect(merged.internalNotes).toContain('Check hub')
    expect(merged.internalNotes).toContain('Torque to spec')
    expect(merged.draftLineItems).toHaveLength(2)
    expect(merged.pageResults).toHaveLength(2)
  })

  it('locks front printed lines to the active sheet catalog', () => {
    const items = flattenActiveSheetItems(defaultServiceLogSheetDocument())
    const frontFile = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const merged = mergeServiceLogPageExtractions([
      {
        fileId: frontFile,
        pageIndex: 1,
        pageType: 'printed_form',
        draftLineItems: [
          {
            description: 'oil and oil filter',
            matchedSheetItemId: 'item-oil-filter',
            confidence: 0.93,
            checkMark: { x: 0.12, y: 0.44 },
          },
          {
            description: 'Totally invented service not on sheet',
            confidence: 0.99,
          },
        ],
      },
    ], frontFile, { activeSheetItems: items })

    expect(merged.draftLineItems).toHaveLength(1)
    expect(merged.draftLineItems?.[0]?.matchedSheetItemId).toBe('item-oil-filter')
    expect(merged.draftLineItems?.[0]?.description).toBe('Replace Oil and Oil Filter')
    expect(merged.draftLineItems?.[0]?.rate).toBe('250')
    expect(merged.checkMarks).toHaveLength(1)
    expect(merged.checkMarks?.[0]?.fileId).toBe(frontFile)
  })

  it('skips low-certainty rear / handwritten lines', () => {
    const rearFile = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const merged = mergeServiceLogPageExtractions([
      {
        fileId: rearFile,
        pageIndex: 2,
        pageType: 'handwritten',
        draftLineItems: [
          { description: 'Custom weld bracket', qty: '1', rate: '85', confidence: 0.91 },
          { description: 'maybe something?', confidence: 0.4 },
          { description: 'no confidence field' },
        ],
      },
    ], rearFile)

    expect(merged.draftLineItems).toHaveLength(1)
    expect(merged.draftLineItems?.[0]?.description).toBe('Custom weld bracket')
    expect(merged.draftLineItems?.[0]?.confidence).toBe(0.91)
  })
})
