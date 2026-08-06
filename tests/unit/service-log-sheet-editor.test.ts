import { describe, expect, it } from 'vitest'
import { isRef, isReactive } from 'vue'
import { defaultServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import { useServiceLogSheetEditor } from '../../app/composables/useServiceLogSheetEditor'

describe('useServiceLogSheetEditor', () => {
  it('returns a reactive API so nested state is readable without .value', () => {
    const api = useServiceLogSheetEditor()
    expect(isReactive(api)).toBe(true)

    api.setDocument(defaultServiceLogSheetDocument())

    // Child templates / props must see plain arrays & objects, not Refs.
    expect(isRef(api.gridRows)).toBe(false)
    expect(Array.isArray(api.gridRows)).toBe(true)
    expect(api.gridRows.length).toBeGreaterThan(0)
    expect(api.doc?.version).toBe(2)
    expect(api.leftSections.some(section => section.title === 'Cleaning')).toBe(true)
    expect(api.pageFill.capacity).toBeGreaterThan(0)

    api.selectSection(api.leftSections[0]!.id)
    expect(api.selectedSectionId).toBe(api.leftSections[0]!.id)
    expect(api.findSection(api.leftSections[0]!.id)?.title).toBe('Cleaning')
  })
})
