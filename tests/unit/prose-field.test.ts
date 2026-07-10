import { describe, expect, it } from 'vitest'
import {
  applyLiveTitleCase,
  formatFieldText,
  formatVoiceText,
} from '../../shared/format/prose-field'

describe('prose field formatting', () => {
  it('applies live title case after spaces', () => {
    expect(applyLiveTitleCase('hello world')).toBe('Hello World')
    expect(applyLiveTitleCase('hello WORLD')).toBe('Hello WORLD')
  })

  it('formats prose with abbreviations and title case on blur', () => {
    expect(formatFieldText('replaced f/r tire', 'prose')).toBe('Replaced Front Right Tire')
    expect(formatFieldText('bias brocho LLC', 'prose')).toBe('Bias Brocho LLC')
  })

  it('formats names without abbrev expansion priority issues', () => {
    expect(formatFieldText('john smith', 'name')).toBe('John Smith')
  })

  it('leaves addresses unchanged', () => {
    expect(formatFieldText('123 main st f/r', 'address')).toBe('123 main st f/r')
  })

  it('formats voice dictation like blur', () => {
    expect(formatVoiceText('install stop arm r/r', 'prose')).toBe('Install Stop Arm Rear Right')
  })
})
