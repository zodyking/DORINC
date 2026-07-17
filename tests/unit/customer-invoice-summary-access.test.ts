import { describe, expect, it } from 'vitest'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'

describe('customer invoice summary access', () => {
  it('mechanics can read customers but not open invoice pages', () => {
    const mechanicPerms = ACCOUNT_TYPE_BUNDLES.mechanic
    expect(mechanicPerms).toContain('customers.read.all')
    expect(mechanicPerms).not.toContain('invoices.read.all')
    expect(mechanicPerms).not.toContain('invoices.create.all')
  })

  it('viewers can read both customers and invoices', () => {
    const viewerPerms = ACCOUNT_TYPE_BUNDLES.viewer
    expect(viewerPerms).toContain('customers.read.all')
    expect(viewerPerms).toContain('invoices.read.all')
  })
})
