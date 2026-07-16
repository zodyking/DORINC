import { describe, expect, it } from 'vitest'
import { formatPersonName, formatPersonNameShort, splitPersonName, toTitleCase } from '../../shared/format/person-name'

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

  it('formats short attribution labels', () => {
    expect(formatPersonNameShort('Anthony Parker')).toBe('Anthony P.')
    expect(formatPersonNameShort('jordan taylor')).toBe('Jordan T.')
    expect(formatPersonNameShort('Prince')).toBe('Prince')
  })

  it('splits stored full names for profile forms', () => {
    expect(splitPersonName('Jordan Taylor')).toEqual({ firstName: 'Jordan', lastName: 'Taylor' })
    expect(splitPersonName('Mary Jane Watson')).toEqual({ firstName: 'Mary', lastName: 'Jane Watson' })
    expect(splitPersonName('Prince')).toEqual({ firstName: 'Prince', lastName: '' })
  })
})
