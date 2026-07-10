import { describe, expect, it } from 'vitest'
import {
  formatFieldText,
  formatLiveFieldText,
  formatVoiceText,
} from '../../shared/format/prose-field'

describe('prose field formatting', () => {
  it('applies live title case and abbreviations while typing', () => {
    expect(formatLiveFieldText('hello world')).toBe('Hello World')
    expect(formatLiveFieldText('replace right side mirror')).toBe('Replace R/S Mirror')
    expect(formatLiveFieldText('replaced f/r tire')).toBe('Replaced F/R Tire')
  })

  it('preserves trailing space during live formatting', () => {
    expect(formatLiveFieldText('replace right ')).toBe('Replace Right ')
  })

  it('title-cases and stores location shorthand on blur', () => {
    expect(formatFieldText('replaced front right tire', 'prose')).toBe('Replaced F/R Tire')
    expect(formatFieldText('replaced f/r tire', 'prose')).toBe('Replaced F/R Tire')
    expect(formatFieldText('bias brocho LLC', 'prose')).toBe('Bias Brocho LLC')
  })

  it('formats names without abbreviation compression', () => {
    expect(formatFieldText('john smith', 'name')).toBe('John Smith')
  })

  it('leaves addresses unchanged', () => {
    expect(formatFieldText('123 main st front right', 'address')).toBe('123 main st front right')
  })

  it('compresses voice dictation to shorthand like blur', () => {
    expect(formatVoiceText('install stop arm rear right', 'prose')).toBe('Install Stop Arm R/R')
  })
})
