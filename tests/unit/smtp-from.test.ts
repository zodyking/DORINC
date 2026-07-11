import { describe, expect, it } from 'vitest'
import { formatSmtpFromHeader, parseSmtpFromHeader } from '../../shared/format/smtp-from'

describe('smtp-from helpers', () => {
  it('parses quoted name and email', () => {
    expect(parseSmtpFromHeader('"Devon Onsite Repairs Inc" <accounting@devononsiterepairs.com>')).toEqual({
      fromName: 'Devon Onsite Repairs Inc',
      fromAddress: 'accounting@devononsiterepairs.com',
    })
  })

  it('formats from name and address', () => {
    expect(formatSmtpFromHeader('Devon Onsite Repairs Inc', 'accounting@devononsiterepairs.com'))
      .toBe('"Devon Onsite Repairs Inc" <accounting@devononsiterepairs.com>')
  })
})
