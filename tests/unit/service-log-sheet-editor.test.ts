import { describe, expect, it } from 'vitest'
import { isReactive } from 'vue'
import { defaultServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import { useServiceLogSheetEditor } from '../../app/composables/useServiceLogSheetEditor'

describe('useServiceLogSheetEditor', () => {
  it('returns a reactive API so nested state is readable without .value', () => {
    const api = useServiceLogSheetEditor()
    expect(isReactive(api)).toBe(true)

    api.setDocument(defaultServiceLogSheetDocument())

    expect(api.doc?.version).toBe(2)
    expect(api.doc?.sections.length).toBeGreaterThan(0)
    expect(Array.isArray(api.gridRows)).toBe(true)
    expect(api.gridRows.length).toBeGreaterThan(0)
    expect(api.lineCount).toBeGreaterThan(0)
    expect(api.leftSections.some(section => section.title === 'Cleaning')).toBe(true)
    expect(api.pageFill.capacity).toBeGreaterThan(0)

    const firstLeft = api.leftSections[0]!
    api.selectSection(firstLeft.id)
    expect(api.selectedSectionId).toBe(firstLeft.id)
    expect(api.findSection(firstLeft.id)?.title).toBe('Cleaning')
  })
})
