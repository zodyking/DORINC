import { describe, expect, it } from 'vitest'
import {
  inferLineTypeFromDescription,
  firstDescriptionWord,
} from '../../shared/line-item-type-from-description'

describe('inferLineTypeFromDescription', () => {
  it('reads the first word only', () => {
    expect(firstDescriptionWord('  Replace R/S mirror')).toBe('Replace')
    expect(firstDescriptionWord('"Install" new filter')).toBe('Install')
  })

  it('maps install/replace verbs to part', () => {
    expect(inferLineTypeFromDescription('replace right side mirror')).toBe('part')
    expect(inferLineTypeFromDescription('Install new filter')).toBe('part')
    expect(inferLineTypeFromDescription('SWAP battery')).toBe('part')
  })

  it('maps service/repair verbs to labor', () => {
    expect(inferLineTypeFromDescription('service engine')).toBe('labor')
    expect(inferLineTypeFromDescription('Repair brake line')).toBe('labor')
    expect(inferLineTypeFromDescription('diagnose electrical fault')).toBe('labor')
  })

  it('returns null when the first word does not match', () => {
    expect(inferLineTypeFromDescription('shop supplies')).toBeNull()
    expect(inferLineTypeFromDescription('')).toBeNull()
  })

  it('overrides regardless of prior type intent', () => {
    expect(inferLineTypeFromDescription('Replace tire')).toBe('part')
    expect(inferLineTypeFromDescription('Service call')).toBe('labor')
  })

  it('uses custom verb lists from workspace settings', () => {
    const custom = {
      part: ['Fabricate'],
      labor: ['Wash', 'Steam'],
      fee: ['Transport'],
    }
    expect(inferLineTypeFromDescription('Wash engine bay', custom)).toBe('labor')
    expect(inferLineTypeFromDescription('Steam clean interior', custom)).toBe('labor')
    expect(inferLineTypeFromDescription('Transport vehicle', custom)).toBe('fee')
    expect(inferLineTypeFromDescription('Fabricate bracket', custom)).toBe('part')
  })
})
