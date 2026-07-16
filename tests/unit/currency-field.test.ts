import { describe, expect, it } from 'vitest'
import {
  appendCurrencyDigit,
  backspaceCurrency,
  centsToCurrency,
  currencyToCents,
  normalizeCurrencyDisplay,
  parseCurrencyInput,
} from '../../app/utils/currency-field'

describe('currency-field', () => {
  it('normalizes display values', () => {
    expect(normalizeCurrencyDisplay('145')).toBe('145.00')
    expect(normalizeCurrencyDisplay('145.5')).toBe('145.50')
    expect(normalizeCurrencyDisplay('')).toBe('0.00')
    expect(normalizeCurrencyDisplay('-5')).toBe('0.00')
  })

  it('appends digits cents-first', () => {
    expect(appendCurrencyDigit('0.00', '1')).toBe('0.01')
    expect(appendCurrencyDigit('0.01', '4')).toBe('0.14')
    expect(appendCurrencyDigit('0.14', '5')).toBe('1.45')
    expect(appendCurrencyDigit('1.45', '0')).toBe('14.50')
    expect(appendCurrencyDigit('10000.00', '0')).toBe('100000.00')
  })

  it('backspaces one cent at a time', () => {
    expect(backspaceCurrency('1.45')).toBe('0.14')
    expect(backspaceCurrency('0.14')).toBe('0.01')
    expect(backspaceCurrency('0.01')).toBe('0.00')
  })

  it('parses pasted digit strings', () => {
    expect(parseCurrencyInput('14500')).toBe('145.00')
    expect(parseCurrencyInput('$1,234.56')).toBe('1234.56')
    expect(parseCurrencyInput('')).toBe('0.00')
  })

  it('converts between cents and currency', () => {
    expect(currencyToCents('100000.00')).toBe(10000000)
    expect(centsToCurrency(10000000)).toBe('100000.00')
  })
})
