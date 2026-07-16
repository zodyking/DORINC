import { describe, expect, it } from 'vitest'
import { formatPhoneDisplay, phoneDisplay } from '../../shared/format/phone'

describe('formatPhoneDisplay', () => {
  it('formats 10-digit US numbers as (xxx) xxx xxxx', () => {
    expect(formatPhoneDisplay('2122037678')).toBe('(212) 203 7678')
    expect(formatPhoneDisplay('3025550101')).toBe('(302) 555 0101')
  })

  it('strips leading country code 1', () => {
    expect(formatPhoneDisplay('12122037678')).toBe('(212) 203 7678')
    expect(formatPhoneDisplay('+1 (212) 203-7678')).toBe('(212) 203 7678')
  })

  it('normalizes existing punctuation', () => {
    expect(formatPhoneDisplay('(302) 555-0101')).toBe('(302) 555 0101')
    expect(formatPhoneDisplay('212-203-7678')).toBe('(212) 203 7678')
  })

  it('returns non-standard numbers unchanged', () => {
    expect(formatPhoneDisplay('555-0100')).toBe('555-0100')
    expect(formatPhoneDisplay('ext. 42')).toBe('ext. 42')
  })

  it('preserves placeholders', () => {
    expect(formatPhoneDisplay('—')).toBe('—')
    expect(formatPhoneDisplay('-')).toBe('-')
    expect(formatPhoneDisplay('')).toBe('')
    expect(formatPhoneDisplay(null)).toBe('')
  })
})

describe('phoneDisplay', () => {
  it('uses em dash for empty values', () => {
    expect(phoneDisplay(null)).toBe('—')
    expect(phoneDisplay('')).toBe('—')
    expect(phoneDisplay('2122037678')).toBe('(212) 203 7678')
  })
})
