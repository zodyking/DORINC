import { describe, expect, it } from 'vitest'
import { entityPathForMessageLink } from '../../app/utils/messages-ui'

describe('entityPathForMessageLink', () => {
  it('routes staff without invoice edit access to pdf view', () => {
    expect(entityPathForMessageLink('invoice', 'inv-1', { can: () => false }))
      .toBe('/invoices/inv-1?view=pdf&ref=message')
  })

  it('routes staff with invoice edit access to the editor', () => {
    expect(entityPathForMessageLink('invoice', 'inv-1', {
      can: key => key === 'invoices.update.all' || key === 'invoices.create.all',
    })).toBe('/invoices/inv-1/edit?ref=message')
  })
})
