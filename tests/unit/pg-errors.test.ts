import { describe, expect, it } from 'vitest'
import { isPgUniqueViolation } from '../../server/utils/pg-errors'

describe('pg-errors', () => {
  it('detects unique constraint violations', () => {
    const err = {
      cause: {
        code: '23505',
        constraint: 'invoices_invoice_number_unique',
      },
    }
    expect(isPgUniqueViolation(err)).toBe(true)
    expect(isPgUniqueViolation(err, 'invoices_invoice_number_unique')).toBe(true)
    expect(isPgUniqueViolation(err, 'other_constraint')).toBe(false)
  })

  it('ignores non-unique errors', () => {
    expect(isPgUniqueViolation({ cause: { code: '23503' } })).toBe(false)
    expect(isPgUniqueViolation(new Error('nope'))).toBe(false)
  })
})
