import { describe, expect, it } from 'vitest'
import { defaultServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import {
  sectionsByColumn,
  sheetColumnRows,
  sheetGridRows,
} from '../../shared/service-log-sheet-layout'

describe('sheetColumnRows', () => {
  it('emits a title row followed by its item rows', () => {
    const rows = sheetColumnRows([{
      id: 'sec-a',
      title: 'Cleaning',
      column: 'left',
      items: [
        { id: 'i1', name: 'Steam Clean Engine', subtext: '', price: '$35', catalogItemId: null },
        { id: 'i2', name: 'Wash Bus Body', subtext: '', price: '$45', catalogItemId: null },
      ],
    }])

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ kind: 'title', sectionId: 'sec-a', title: 'Cleaning' })
    expect(rows[1]?.kind).toBe('item')
    expect(rows[1]?.kind === 'item' && rows[1].item.name).toBe('Steam Clean Engine')
  })
})

describe('sheetGridRows', () => {
  const doc = defaultServiceLogSheetDocument()

  it('zips the columns to the longer column length', () => {
    const { left, right } = sectionsByColumn(doc)
    const leftRows = sheetColumnRows(left)
    const rightRows = sheetColumnRows(right)
    const rows = sheetGridRows(doc)

    expect(rows).toHaveLength(Math.max(leftRows.length, rightRows.length))
    expect(rows[0]?.left?.kind).toBe('title')
    expect(rows[0]?.right?.kind).toBe('title')
  })

  it('marks the last row of each column so the group box can close', () => {
    const rows = sheetGridRows(doc)
    expect(rows.filter(row => row.leftEnd)).toHaveLength(1)
    expect(rows.filter(row => row.rightEnd)).toHaveLength(1)

    const { left, right } = sectionsByColumn(doc)
    const leftCount = sheetColumnRows(left).length
    const rightCount = sheetColumnRows(right).length
    expect(rows[leftCount - 1]?.leftEnd).toBe(true)
    expect(rows[rightCount - 1]?.rightEnd).toBe(true)
  })

  it('pads the shorter column with empty cells', () => {
    const rows = sheetGridRows(doc)
    const { right } = sectionsByColumn(doc)
    const rightCount = sheetColumnRows(right).length
    expect(rows[rightCount]?.right).toBeNull()
    expect(rows[rows.length - 1]?.right).toBeNull()
  })

  it('returns no rows for an empty document', () => {
    expect(sheetGridRows({ version: 2, sections: [] })).toEqual([])
  })
})
