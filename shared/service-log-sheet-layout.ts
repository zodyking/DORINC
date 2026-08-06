/**
 * Row model for the two-column service log catalog.
 *
 * The catalog prints as ONE flat table with a left group, a spacer column and a
 * right group, because DomPDF refuses to split a table that contains nested
 * tables: the whole grid then jumps to the next page and leaves page 1 blank.
 * A flat table splits like the invoice line-items table and repeats its header.
 *
 * The PDF renderer and the WYSIWYG editor both build their rows from here, so
 * the editor stays a true replica of the printed sheet.
 */
import type {
  ServiceLogSheetDocument,
  ServiceLogSheetLine,
  ServiceLogSheetSection,
} from './service-log-sheet-default'

export interface SheetTitleRow {
  kind: 'title'
  sectionId: string
  title: string
}

export interface SheetItemRow {
  kind: 'item'
  sectionId: string
  item: ServiceLogSheetLine
}

export type SheetColumnRow = SheetTitleRow | SheetItemRow

export interface SheetGridRow {
  left: SheetColumnRow | null
  right: SheetColumnRow | null
  /** Last row of the left/right group — closes the group's bottom border. */
  leftEnd: boolean
  rightEnd: boolean
}

export function sectionsByColumn(document: ServiceLogSheetDocument): {
  left: ServiceLogSheetSection[]
  right: ServiceLogSheetSection[]
} {
  return {
    left: document.sections.filter(section => section.column === 'left'),
    right: document.sections.filter(section => section.column === 'right'),
  }
}

/** Flatten one column into title/item rows in print order. */
export function sheetColumnRows(sections: ServiceLogSheetSection[]): SheetColumnRow[] {
  const rows: SheetColumnRow[] = []
  for (const section of sections) {
    rows.push({ kind: 'title', sectionId: section.id, title: section.title })
    for (const item of section.items) {
      rows.push({ kind: 'item', sectionId: section.id, item })
    }
  }
  return rows
}

/** Zip both columns into the printed table rows. */
export function sheetGridRows(document: ServiceLogSheetDocument): SheetGridRow[] {
  const { left, right } = sectionsByColumn(document)
  const leftRows = sheetColumnRows(left)
  const rightRows = sheetColumnRows(right)
  const total = Math.max(leftRows.length, rightRows.length)

  return Array.from({ length: total }, (_unused, index) => ({
    left: leftRows[index] ?? null,
    right: rightRows[index] ?? null,
    leftEnd: index === leftRows.length - 1,
    rightEnd: index === rightRows.length - 1,
  }))
}
