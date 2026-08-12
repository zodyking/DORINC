import { describe, expect, it } from 'vitest'
import {
  parseEntityLookupArgs,
  parseInvoiceLookupArgs,
  parseSearchCatalogArgs,
  SUSAN_HELP_TOOLS,
} from '../../shared/ai-tools'
import { executeSusanHelpTool } from '../../server/services/ai-tools.service'
import { __entityToolTestUtils } from '../../server/services/ai-entity-tools.service'
import { susanHasPermission, type SusanAuthContext } from '../../server/services/susan-auth.service'

describe('Susan entity tool schemas', () => {
  it('registers all five help tools', () => {
    const names = SUSAN_HELP_TOOLS.map(t => t.function.name)
    expect(names).toEqual([
      'get_app_knowledge',
      'lookup_invoice',
      'lookup_service_log',
      'lookup_customer',
      'search_catalog',
    ])
  })

  it('parses entity lookup and catalog args', () => {
    expect(parseEntityLookupArgs({ id: '  abc  ', query: 'INV-1', limit: 3 })).toEqual({
      id: 'abc',
      query: 'INV-1',
      limit: 3,
    })
    expect(parseSearchCatalogArgs({ query: 'oil', itemType: 'part', limit: 2 })).toEqual({
      query: 'oil',
      itemType: 'part',
      limit: 2,
    })
    expect(parseInvoiceLookupArgs({ query: 'oldest', sort: 'oldest' })).toMatchObject({
      query: 'oldest',
      sort: 'oldest',
    })
  })

  it('validates uuid helper and limits', () => {
    expect(__entityToolTestUtils.isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(__entityToolTestUtils.isUuid('not-a-uuid')).toBe(false)
    expect(__entityToolTestUtils.clampLimit(99)).toBe(8)
    expect(__entityToolTestUtils.clampLimit(0)).toBe(1)
  })
})

describe('Susan permission helper', () => {
  const auth = (grants: string[]): SusanAuthContext => ({
    user: {
      id: 'u1',
      accountType: 'viewer',
      isActive: true,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
      name: 'Test User',
    },
    roleGrants: grants as SusanAuthContext['roleGrants'],
    overrides: { allow: [], deny: [] },
  })

  it('allows invoices.read.all when granted', () => {
    expect(susanHasPermission(auth(['invoices.read.all']), 'invoices.read.all')).toBe(true)
    expect(susanHasPermission(auth(['customers.read.all']), 'invoices.read.all')).toBe(false)
  })

  it('enforces service_logs.read.own ownership', () => {
    const mechanic = auth(['service_logs.read.own'])
    expect(susanHasPermission(mechanic, 'service_logs.read.own', { ownsRecord: true })).toBe(true)
    expect(susanHasPermission(mechanic, 'service_logs.read.own', { ownsRecord: false })).toBe(false)
  })
})

describe('executeSusanHelpTool entity dispatch', () => {
  it('requires db/userId for lookup tools', async () => {
    for (const name of ['lookup_invoice', 'lookup_service_log', 'lookup_customer', 'search_catalog'] as const) {
      const result = await executeSusanHelpTool({
        id: 'c1',
        name,
        arguments: '{"query":"acme"}',
      })
      expect(result.ok).toBe(false)
      expect(result.content).toMatch(/authenticated staff/i)
    }
  })

  it('still runs get_app_knowledge without db', async () => {
    const result = await executeSusanHelpTool({
      id: 'c2',
      name: 'get_app_knowledge',
      arguments: JSON.stringify({ query: 'invoices', detail: 'summary' }),
    })
    expect(result.ok).toBe(true)
    expect(result.content.toLowerCase()).toContain('invoice')
  })
})
