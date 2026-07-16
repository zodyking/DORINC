import { describe, expect, it } from 'vitest'
import {
  filterProfanity,
  normalizeOutgoingMessage,
  toSentenceCase,
} from '../../shared/format/outgoing-message'

describe('toSentenceCase', () => {
  it('capitalises the first letter of the message', () => {
    expect(toSentenceCase('not sure sorry')).toBe('Not sure sorry')
  })

  it('capitalises the start of each sentence', () => {
    expect(toSentenceCase('hello there. how are you? i am fine!')).toBe(
      'Hello there. How are you? I am fine!',
    )
  })

  it('capitalises the first letter of each new line', () => {
    expect(toSentenceCase('thanks\nsee you soon')).toBe('Thanks\nSee you soon')
  })

  it('does not mangle urls, emails or abbreviations', () => {
    expect(toSentenceCase('visit devononsiterepairs.com for details')).toBe(
      'Visit devononsiterepairs.com for details',
    )
    expect(toSentenceCase('email us at accounting@devononsiterepairs.com')).toBe(
      'Email us at accounting@devononsiterepairs.com',
    )
  })

  it('preserves existing capitals and acronyms', () => {
    expect(toSentenceCase('the VIN is ready. INC filing done')).toBe(
      'The VIN is ready. INC filing done',
    )
  })
})

describe('filterProfanity', () => {
  it('masks flagged words with asterisks of equal length', () => {
    expect(filterProfanity('this is shit')).toBe('this is ****')
  })

  it('leaves clean words that merely contain flagged substrings', () => {
    expect(filterProfanity('assistant classes passed')).toBe('assistant classes passed')
  })

  it('catches simple leetspeak obfuscation', () => {
    expect(filterProfanity('what the sh1t')).toBe('what the ****')
  })
})

describe('normalizeOutgoingMessage', () => {
  it('applies sentence casing then profanity masking', () => {
    expect(normalizeOutgoingMessage('shit happens. we fixed it')).toBe(
      '**** happens. We fixed it',
    )
  })

  it('returns empty input unchanged', () => {
    expect(normalizeOutgoingMessage('')).toBe('')
  })
})
