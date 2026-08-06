import { reactive } from 'vue'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'
import type {
  ServiceLogSheetDocument,
  ServiceLogSheetLine,
  ServiceLogSheetSection,
} from '#shared/service-log-sheet-default'
import {
  sectionsByColumn,
  sheetFrontPageFill,
  sheetGridRows,
} from '#shared/service-log-sheet-layout'

/**
 * Single reactive editor object. Child templates read `api.gridRows` / `api.doc`
 * directly — nested ref bags left the Paper view blank on mobile WebKit.
 */

export interface SheetCatalogPick {
  id: string
  name: string
  description: string | null
  defaultPrice: string | null
  itemType: string
  categoryName: string | null
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

function blankLine(): ServiceLogSheetLine {
  return { id: newId('item'), name: 'New service', subtext: '', price: '$0', catalogItemId: null }
}

/**
 * Editing state for the service log sheet, shared by the WYSIWYG paper editor
 * and the mobile line editor so both views mutate one document.
 */
export function useServiceLogSheetEditor() {
  const api = reactive({
    doc: null as ServiceLogSheetDocument | null,
    selectedSectionId: null as string | null,
    selectedItemId: null as string | null,

    get sections(): ServiceLogSheetSection[] {
      return api.doc?.sections ?? []
    },
    get leftSections(): ServiceLogSheetSection[] {
      return sectionsByColumn(api.doc ?? { version: 2, sections: [] }).left
    },
    get rightSections(): ServiceLogSheetSection[] {
      return sectionsByColumn(api.doc ?? { version: 2, sections: [] }).right
    },
    get gridRows() {
      return sheetGridRows(api.doc ?? { version: 2, sections: [] })
    },
    get pageFill() {
      return sheetFrontPageFill(api.doc ?? { version: 2, sections: [] })
    },
    get lineCount(): number {
      return api.sections.reduce((total, section) => total + section.items.length, 0)
    },

    setDocument(next: ServiceLogSheetDocument | null) {
      api.doc = next ? structuredClone(next) : null
      api.selectedSectionId = null
      api.selectedItemId = null
    },

    findSection(sectionId: string): ServiceLogSheetSection | undefined {
      return api.doc?.sections.find(section => section.id === sectionId)
    },

    selectSection(sectionId: string) {
      api.selectedSectionId = sectionId
      api.selectedItemId = null
    },

    selectItem(sectionId: string, itemId: string) {
      api.selectedSectionId = sectionId
      api.selectedItemId = itemId
    },

    addSection(column: 'left' | 'right'): ServiceLogSheetSection | null {
      if (!api.doc) return null
      const section: ServiceLogSheetSection = {
        id: newId('sec'),
        title: 'New section',
        column,
        items: [blankLine()],
      }
      api.doc.sections.push(section)
      api.selectSection(section.id)
      return section
    },

    removeSection(sectionId: string) {
      if (!api.doc) return
      api.doc.sections = api.doc.sections.filter(section => section.id !== sectionId)
      if (api.selectedSectionId === sectionId) {
        api.selectedSectionId = null
        api.selectedItemId = null
      }
    },

    moveSection(sectionId: string, direction: -1 | 1) {
      const all = api.doc?.sections
      const section = api.findSection(sectionId)
      if (!all || !section) return
      const sameColumn = all.filter(candidate => candidate.column === section.column)
      const swapWith = sameColumn[sameColumn.indexOf(section) + direction]
      if (!swapWith) return
      const a = all.indexOf(section)
      const b = all.indexOf(swapWith)
      const held = all[a]!
      all[a] = all[b]!
      all[b] = held
    },

    moveSectionColumn(sectionId: string) {
      const section = api.findSection(sectionId)
      if (!section) return
      section.column = section.column === 'left' ? 'right' : 'left'
      api.selectSection(sectionId)
    },

    addItem(sectionId: string): ServiceLogSheetLine | null {
      const section = api.findSection(sectionId)
      if (!section) return null
      const item = blankLine()
      section.items.push(item)
      api.selectItem(sectionId, item.id)
      return item
    },

    removeItem(sectionId: string, itemId: string) {
      const section = api.findSection(sectionId)
      if (!section) return
      section.items = section.items.filter(item => item.id !== itemId)
      if (api.selectedItemId === itemId) api.selectedItemId = null
    },

    moveItem(sectionId: string, itemId: string, direction: -1 | 1) {
      const section = api.findSection(sectionId)
      if (!section) return
      const index = section.items.findIndex(item => item.id === itemId)
      const next = index + direction
      if (index < 0 || next < 0 || next >= section.items.length) return
      const held = section.items[index]!
      section.items[index] = section.items[next]!
      section.items[next] = held
    },

    addCatalogItem(pick: SheetCatalogPick, sectionId: string | null): boolean {
      let target = sectionId && api.findSection(sectionId) ? sectionId : null
      if (!target) target = api.addSection('left')?.id ?? null
      const section = target ? api.findSection(target) : undefined
      if (!section) return false

      const price = formatSheetPriceDisplay(pick.defaultPrice)
      section.items.push({
        id: newId('item'),
        name: pick.name,
        subtext: pick.description?.trim() || '',
        price: price === '—' || !price ? '$0' : price,
        catalogItemId: pick.id,
      })
      api.selectItem(section.id, section.items[section.items.length - 1]!.id)
      return true
    },

    cleanDocument(): ServiceLogSheetDocument | null {
      if (!api.doc) return null
      return {
        version: 2,
        sections: api.doc.sections.map(section => ({
          ...section,
          title: section.title.trim() || 'Untitled',
          items: section.items
            .filter(item => item.name.trim())
            .map(item => ({
              ...item,
              name: item.name.trim(),
              subtext: item.subtext?.trim() || '',
              price: item.price?.trim() || '',
              catalogItemId: item.catalogItemId ?? null,
            })),
        })),
      }
    },
  })

  return api
}

export type ServiceLogSheetEditor = ReturnType<typeof useServiceLogSheetEditor>
