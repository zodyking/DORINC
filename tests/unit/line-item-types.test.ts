import { describe, expect, it } from 'vitest'
import { LINE_ITEM_TYPES, normalizeLineType } from '../../shared/line-item-types'

describe('line item types', () => {
  it('exposes part, labor, and fee only', () => {
    expect(LINE_ITEM_TYPES).toEqual(['part', 'labor', 'fee'])
  })

  it('converts legacy service to labor', () => {
    expect(normalizeLineType('service')).toBe('labor')
    expect(normalizeLineType('SERVICE')).toBe('labor')
  })

  it('passes through valid types', () => {
    expect(normalizeLineType('part')).toBe('part')
    expect(normalizeLineType('fee')).toBe('fee')
  })

  it('defaults unknown values to labor', () => {
    expect(normalizeLineType('')).toBe('labor')
    expect(normalizeLineType('unknown')).toBe('labor')
  })
})
