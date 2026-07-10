import { describe, expect, it } from 'vitest'
import { expandAbbreviations, expandForSpeech } from '../../shared/format/abbreviations'

describe('abbreviations', () => {
  it('expands vehicle location shorthand', () => {
    expect(expandAbbreviations('replaced tire F/R')).toBe('replaced tire Front Right')
    expect(expandAbbreviations('brake F-L and R/S')).toBe('brake Front Left and Right Side')
    expect(expandAbbreviations('R/R door')).toBe('Rear Right door')
    expect(expandAbbreviations('r/l mirror')).toBe('Rear Left mirror')
  })

  it('expands for speech synthesis', () => {
    expect(expandForSpeech('work on F/R')).toBe('work on Front Right')
  })
})
