import { describe, expect, it } from 'vitest'
import {
  formatFieldText,
  formatLiveFieldText,
  formatVoiceText,
} from '../../shared/format/prose-field'

describe('prose field formatting', () => {
  it('applies live title case and abbreviations while typing', () => {
    expect(formatLiveFieldText('hello world')).toBe('Hello World')
    expect(formatLiveFieldText('replace right side mirror')).toBe('Replace R/Side Mirror')
    // Legacy F/R stays during live typing (title-case may leave F/r); blur migrates to R/Front.
    expect(formatLiveFieldText('replaced f/r tire')).toBe('Replaced F/r Tire')
  })

  it('does not snap abbreviations back while backspacing through them', () => {
    expect(formatLiveFieldText('Replace R/Rea')).toBe('Replace R/rea')
    expect(formatLiveFieldText('Replace R/r')).toBe('Replace R/r')
    expect(formatLiveFieldText('Replace R/R')).toBe('Replace R/r')
    expect(formatLiveFieldText('Replace R/S')).toBe('Replace R/s')
    expect(formatLiveFieldText('Replace L/S')).toBe('Replace L/s')
    expect(formatLiveFieldText('Replace R/Rear')).toBe('Replace R/Rear')
    expect(formatLiveFieldText('Replace R/r')).not.toBe('Replace R/Rear')
  })

  it('preserves trailing space during live formatting', () => {
    expect(formatLiveFieldText('replace right ')).toBe('Replace Right ')
  })

  it('title-cases and stores location shorthand on blur', () => {
    expect(formatFieldText('replaced front right tire', 'prose')).toBe('Replaced R/Front Tire')
    expect(formatFieldText('replaced f/r tire', 'prose')).toBe('Replaced R/Front Tire')
    expect(formatFieldText('Replace R/R tire', 'prose')).toBe('Replace R/Rear Tire')
    expect(formatFieldText('bias brocho LLC', 'prose')).toBe('Bias Brocho LLC')
  })

  it('formats names without abbreviation compression', () => {
    expect(formatFieldText('john smith', 'name')).toBe('John Smith')
  })

  it('leaves addresses unchanged', () => {
    expect(formatFieldText('123 main st front right', 'address')).toBe('123 main st front right')
  })

  it('compresses voice dictation to shorthand like blur', () => {
    expect(formatVoiceText('install stop arm rear right', 'prose')).toBe('Install Stop Arm R/Rear')
    expect(formatVoiceText('replace right front headlight', 'prose')).toBe('Replace R/Front Headlight')
  })

  it('capitalizes letters after periods while typing', () => {
    expect(formatLiveFieldText('L.E.D')).toBe('L.E.D')
    expect(formatLiveFieldText('l.e.d bulb')).toBe('L.E.D Bulb')
  })
})
