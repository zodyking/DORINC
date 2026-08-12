import { describe, expect, it } from 'vitest'
import {
  abbreviatePhrases,
  expandForSpeech,
  stripLocationAbbreviations,
} from '../../shared/format/abbreviations'

describe('abbreviations', () => {
  it('stores shorthand when full phrase is typed or spoken', () => {
    expect(abbreviatePhrases('replaced tire front right')).toBe('replaced tire R/Front')
    expect(abbreviatePhrases('brake Front Left and right side')).toBe('brake L/Front and R/Side')
    expect(abbreviatePhrases('rear right door')).toBe('R/Rear door')
    expect(abbreviatePhrases('rear left mirror')).toBe('L/Rear mirror')
    expect(abbreviatePhrases('Replace Right Front headlight')).toBe('Replace R/Front headlight')
    expect(abbreviatePhrases('Right Front headlight')).toBe('R/Front headlight')
  })

  it('normalizes typed shorthand to canonical form', () => {
    expect(abbreviatePhrases('work on R/Front')).toBe('work on R/Front')
    expect(abbreviatePhrases('brake L-Front')).toBe('brake L/Front')
    expect(abbreviatePhrases('r/rear door')).toBe('R/Rear door')
  })

  it('migrates legacy shorthand to the new canonical forms', () => {
    expect(abbreviatePhrases('work on F/R')).toBe('work on R/Front')
    expect(abbreviatePhrases('brake F-L')).toBe('brake L/Front')
    expect(abbreviatePhrases('r/r door')).toBe('R/Rear door')
    expect(abbreviatePhrases('R/S mirror')).toBe('R/Side mirror')
    expect(abbreviatePhrases('L/S door')).toBe('L/Side door')
    expect(abbreviatePhrases('R/L seal')).toBe('L/Rear seal')
  })

  it('expands shorthand for speech synthesis only', () => {
    expect(expandForSpeech('work on R/Front')).toBe('work on Front Right')
    expect(expandForSpeech('R/Rear door seal')).toBe('Rear Right door seal')
    expect(expandForSpeech('work on F/R')).toBe('work on Front Right')
  })

  it('strips side abbreviations for catalog matching', () => {
    expect(stripLocationAbbreviations('Replace Air Filter R/S')).toBe('Replace Air Filter')
    expect(stripLocationAbbreviations('Repair L/S door seal')).toBe('Repair door seal')
    expect(stripLocationAbbreviations('Marker light F/R and F/L')).toBe('Marker light and')
    expect(stripLocationAbbreviations('Front Right headlight')).toBe('headlight')
    expect(stripLocationAbbreviations('Right Side mirror')).toBe('mirror')
  })
})
