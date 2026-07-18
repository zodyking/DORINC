import { describe, expect, it } from 'vitest'
import { formatMoneyForDisplay } from '../../shared/money'

describe('formatMoneyForDisplay', () => {
  it('adds a dollar sign to raw decimal amounts', () => {
    expect(formatMoneyForDisplay('326.61')).toBe('$326.61')
    expect(formatMoneyForDisplay('4280.00')).toBe('$4280.00')
  })

  it('leaves already formatted amounts unchanged', () => {
    expect(formatMoneyForDisplay('$100.00')).toBe('$100.00')
  })

  it('returns null for empty values', () => {
    expect(formatMoneyForDisplay(null)).toBeNull()
    expect(formatMoneyForDisplay('')).toBeNull()
  })
})
