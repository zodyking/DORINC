import { describe, expect, it } from 'vitest'
import { formatPersonName, toTitleCase } from '../../shared/format/person-name'

describe('person-name format', () => {
  it('title-cases each word', () => {
    expect(toTitleCase('jordan')).toBe('Jordan')
    expect(toTitleCase('  mary   jane  ')).toBe('Mary Jane')
    expect(toTitleCase('o\'brien')).toBe('O\'brien')
  })

  it('combines first and last names', () => {
    expect(formatPersonName('jordan', 'taylor')).toBe('Jordan Taylor')
    expect(formatPersonName('  alicia ', ' m. ')).toBe('Alicia M.')
  })
})
