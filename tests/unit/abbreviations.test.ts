import { describe, expect, it } from 'vitest'
import { abbreviatePhrases, expandForSpeech } from '../../shared/format/abbreviations'

describe('abbreviations', () => {
  it('stores shorthand when full phrase is typed or spoken', () => {
    expect(abbreviatePhrases('replaced tire front right')).toBe('replaced tire F/R')
    expect(abbreviatePhrases('brake Front Left and right side')).toBe('brake F/L and R/S')
    expect(abbreviatePhrases('rear right door')).toBe('R/R door')
    expect(abbreviatePhrases('rear left mirror')).toBe('R/L mirror')
  })

  it('normalizes typed shorthand to canonical form', () => {
    expect(abbreviatePhrases('work on F/R')).toBe('work on F/R')
    expect(abbreviatePhrases('brake F-L')).toBe('brake F/L')
    expect(abbreviatePhrases('r/r door')).toBe('R/R door')
  })

  it('expands shorthand for speech synthesis only', () => {
    expect(expandForSpeech('work on F/R')).toBe('work on Front Right')
    expect(expandForSpeech('R/R door seal')).toBe('Rear Right door seal')
  })
})
