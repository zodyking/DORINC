import { describe, expect, it } from 'vitest'
import { titleCaseSegment, toTitleCase } from '../../shared/format/title-case'

describe('title-case format', () => {
  it('title-cases lowercase words', () => {
    expect(toTitleCase('jordan')).toBe('Jordan')
    expect(toTitleCase('  mary   jane  ')).toBe('Mary Jane')
    expect(toTitleCase('o\'brien')).toBe('O\'brien')
  })

  it('title-cases long all-caps tokens', () => {
    expect(toTitleCase('BNOS YAKOV')).toBe('Bnos Yakov')
    expect(toTitleCase('KOLEL BAIS BARUCH GRIBOV')).toBe('Kolel Bais Baruch Gribov')
  })

  it('preserves short acronym runs and mixed-case uppercase tails', () => {
    expect(toTitleCase('Bnos Yakov INC')).toBe('Bnos Yakov INC')
    expect(toTitleCase('bias brocho LLC')).toBe('Bias Brocho LLC')
    expect(toTitleCase('fleet VIN lookup')).toBe('Fleet VIN Lookup')
    expect(titleCaseSegment('McDONALD')).toBe('McDONALD')
  })

  it('capitalizes dotted abbreviations', () => {
    expect(toTitleCase('l.e.d bulb')).toBe('L.E.D Bulb')
    expect(titleCaseSegment('l.e.d')).toBe('L.E.D')
  })

  it('preserves hyphenated segments', () => {
    expect(toTitleCase('mary-jane watson')).toBe('Mary-Jane Watson')
  })
})
