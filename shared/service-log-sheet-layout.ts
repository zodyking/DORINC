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

/**
 * How many single-line catalog rows the front page fits below the header,
 * customer fields and complaint box. Measured from the rendered Letter PDF:
 * the 39-row default column leaves ~3.6 rows of slack at 14.5pt per row.
 */
export const SHEET_FRONT_PAGE_ROW_CAPACITY = 43

/** A line with a note prints two lines, so it eats ~1.45 rows of height. */
function rowWeight(row: SheetColumnRow): number {
  return row.kind === 'item' && row.item.subtext.trim() ? 1.45 : 1
}

/**
 * Estimate how full the front page is, so the editor can warn before the
 * catalog spills onto a continuation page.
 */
export function sheetFrontPageFill(document: ServiceLogSheetDocument): {
  rows: number
  capacity: number
  overflows: boolean
} {
  const { left, right } = sectionsByColumn(document)
  const weigh = (sections: ServiceLogSheetSection[]) =>
    sheetColumnRows(sections).reduce((total, row) => total + rowWeight(row), 0)
  const rows = Math.max(weigh(left), weigh(right))

  return {
    rows: Math.round(rows * 10) / 10,
    capacity: SHEET_FRONT_PAGE_ROW_CAPACITY,
    overflows: rows > SHEET_FRONT_PAGE_ROW_CAPACITY,
  }
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

/**
 * Trailing empty right-column rows under the last right section (Inspection).
 * Used to seat the scan-to-upload QR in the bottom-right void on page 1.
 */
export function sheetRightTrailingVoid(document: ServiceLogSheetDocument): {
  startIndex: number
  rowCount: number
} | null {
  const rows = sheetGridRows(document)
  let start = -1
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.right && rows.slice(i).every(row => !row.right)) {
      start = i
      break
    }
  }
  if (start < 0) return null
  return { startIndex: start, rowCount: rows.length - start }
}
