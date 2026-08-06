import { computed, reactive, ref } from 'vue'
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
 * Sheet editor state. Keep `doc` as a reactive object field (not a nested Ref)
 * so parent and child templates can read `api.doc.sections` without `.value`.
 */
export function useServiceLogSheetEditor() {
  const doc = ref<ServiceLogSheetDocument | null>(null)
  const selectedSectionId = ref<string | null>(null)
  const selectedItemId = ref<string | null>(null)

  const api = reactive({
    get doc() {
      return doc.value
    },
    set doc(value: ServiceLogSheetDocument | null) {
      doc.value = value
    },
    get selectedSectionId() {
      return selectedSectionId.value
    },
    set selectedSectionId(value: string | null) {
      selectedSectionId.value = value
    },
    get selectedItemId() {
      return selectedItemId.value
    },
    set selectedItemId(value: string | null) {
      selectedItemId.value = value
    },
    sections: computed(() => doc.value?.sections ?? []),
    leftSections: computed(() => sectionsByColumn(doc.value ?? { version: 2, sections: [] }).left),
    rightSections: computed(() => sectionsByColumn(doc.value ?? { version: 2, sections: [] }).right),
    gridRows: computed(() => sheetGridRows(doc.value ?? { version: 2, sections: [] })),
    pageFill: computed(() => sheetFrontPageFill(doc.value ?? { version: 2, sections: [] })),
    lineCount: computed(() =>
      (doc.value?.sections ?? []).reduce((total, section) => total + section.items.length, 0),
    ),

    setDocument(next: ServiceLogSheetDocument | null) {
      doc.value = next ? structuredClone(next) : null
      selectedSectionId.value = null
      selectedItemId.value = null
    },

    findSection(sectionId: string): ServiceLogSheetSection | undefined {
      return doc.value?.sections.find(section => section.id === sectionId)
    },

    selectSection(sectionId: string) {
      selectedSectionId.value = sectionId
      selectedItemId.value = null
    },

    selectItem(sectionId: string, itemId: string) {
      selectedSectionId.value = sectionId
      selectedItemId.value = itemId
    },

    addSection(column: 'left' | 'right'): ServiceLogSheetSection | null {
      if (!doc.value) return null
      const section: ServiceLogSheetSection = {
        id: newId('sec'),
        title: 'New section',
        column,
        items: [blankLine()],
      }
      doc.value.sections.push(section)
      api.selectSection(section.id)
      return section
    },

    removeSection(sectionId: string) {
      if (!doc.value) return
      doc.value.sections = doc.value.sections.filter(section => section.id !== sectionId)
      if (selectedSectionId.value === sectionId) {
        selectedSectionId.value = null
        selectedItemId.value = null
      }
    },

    moveSection(sectionId: string, direction: -1 | 1) {
      const all = doc.value?.sections
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
      if (selectedItemId.value === itemId) selectedItemId.value = null
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
      if (!doc.value) return null
      return {
        version: 2,
        sections: doc.value.sections.map(section => ({
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
