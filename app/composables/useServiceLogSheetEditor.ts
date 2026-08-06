import { computed, reactive } from 'vue'
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
 * Flat reactive editor state (no nested refs). Nested ref bags passed as props
 * unwrap inconsistently in child templates and left the Letter paper blank.
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
  const state = reactive({
    doc: null as ServiceLogSheetDocument | null,
    selectedSectionId: null as string | null,
    selectedItemId: null as string | null,
  })

  const sections = computed(() => state.doc?.sections ?? [])
  const columns = computed(() => sectionsByColumn(state.doc ?? { version: 2, sections: [] }))
  const leftSections = computed(() => columns.value.left)
  const rightSections = computed(() => columns.value.right)
  const gridRows = computed(() => sheetGridRows(state.doc ?? { version: 2, sections: [] }))
  const pageFill = computed(() => sheetFrontPageFill(state.doc ?? { version: 2, sections: [] }))
  const lineCount = computed(() =>
    sections.value.reduce((total, section) => total + section.items.length, 0),
  )

  function setDocument(next: ServiceLogSheetDocument | null) {
    state.doc = next ? structuredClone(next) : null
    state.selectedSectionId = null
    state.selectedItemId = null
  }

  function findSection(sectionId: string): ServiceLogSheetSection | undefined {
    return state.doc?.sections.find(section => section.id === sectionId)
  }

  function selectSection(sectionId: string) {
    state.selectedSectionId = sectionId
    state.selectedItemId = null
  }

  function selectItem(sectionId: string, itemId: string) {
    state.selectedSectionId = sectionId
    state.selectedItemId = itemId
  }

  function addSection(column: 'left' | 'right'): ServiceLogSheetSection | null {
    if (!state.doc) return null
    const section: ServiceLogSheetSection = {
      id: newId('sec'),
      title: 'New section',
      column,
      items: [blankLine()],
    }
    state.doc.sections.push(section)
    selectSection(section.id)
    return section
  }

  function removeSection(sectionId: string) {
    if (!state.doc) return
    state.doc.sections = state.doc.sections.filter(section => section.id !== sectionId)
    if (state.selectedSectionId === sectionId) {
      state.selectedSectionId = null
      state.selectedItemId = null
    }
  }

  /** Reorder within the section's own column. */
  function moveSection(sectionId: string, direction: -1 | 1) {
    const all = state.doc?.sections
    const section = findSection(sectionId)
    if (!all || !section) return
    const sameColumn = all.filter(candidate => candidate.column === section.column)
    const swapWith = sameColumn[sameColumn.indexOf(section) + direction]
    if (!swapWith) return
    const a = all.indexOf(section)
    const b = all.indexOf(swapWith)
    const held = all[a]!
    all[a] = all[b]!
    all[b] = held
  }

  function moveSectionColumn(sectionId: string) {
    const section = findSection(sectionId)
    if (!section) return
    section.column = section.column === 'left' ? 'right' : 'left'
    selectSection(sectionId)
  }

  function addItem(sectionId: string): ServiceLogSheetLine | null {
    const section = findSection(sectionId)
    if (!section) return null
    const item = blankLine()
    section.items.push(item)
    selectItem(sectionId, item.id)
    return item
  }

  function removeItem(sectionId: string, itemId: string) {
    const section = findSection(sectionId)
    if (!section) return
    section.items = section.items.filter(item => item.id !== itemId)
    if (state.selectedItemId === itemId) state.selectedItemId = null
  }

  function moveItem(sectionId: string, itemId: string, direction: -1 | 1) {
    const section = findSection(sectionId)
    if (!section) return
    const index = section.items.findIndex(item => item.id === itemId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= section.items.length) return
    const held = section.items[index]!
    section.items[index] = section.items[next]!
    section.items[next] = held
  }

  function addCatalogItem(pick: SheetCatalogPick, sectionId: string | null): boolean {
    let target = sectionId && findSection(sectionId) ? sectionId : null
    if (!target) target = addSection('left')?.id ?? null
    const section = target ? findSection(target) : undefined
    if (!section) return false

    const price = formatSheetPriceDisplay(pick.defaultPrice)
    section.items.push({
      id: newId('item'),
      name: pick.name,
      subtext: pick.description?.trim() || '',
      price: price === '—' || !price ? '$0' : price,
      catalogItemId: pick.id,
    })
    selectItem(section.id, section.items[section.items.length - 1]!.id)
    return true
  }

  /** Trim blanks before saving; empty names would print as empty rows. */
  function cleanDocument(): ServiceLogSheetDocument | null {
    if (!state.doc) return null
    return {
      version: 2,
      sections: state.doc.sections.map(section => ({
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
  }

  return reactive({
    get doc() { return state.doc },
    get selectedSectionId() { return state.selectedSectionId },
    get selectedItemId() { return state.selectedItemId },
    sections,
    leftSections,
    rightSections,
    gridRows,
    pageFill,
    lineCount,
    setDocument,
    findSection,
    selectSection,
    selectItem,
    addSection,
    removeSection,
    moveSection,
    moveSectionColumn,
    addItem,
    removeItem,
    moveItem,
    addCatalogItem,
    cleanDocument,
  })
}

export type ServiceLogSheetEditor = ReturnType<typeof useServiceLogSheetEditor>
