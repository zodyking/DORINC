import { describe, expect, it } from 'vitest'
import {
  extractInvoiceNumber,
  extractServiceLogNumber,
  inferCustomerRankMetric,
  inferInvoiceSort,
  inferInvoiceStatus,
  inferServiceLogStatus,
  parseInvoiceLookupStatus,
  refersToCurrentRecord,
  residualInvoiceSearchQuery,
  stripInvoiceNumberLabel,
  stripServiceLogNumberLabel,
} from '../../shared/susan-entity-query'
import { parseInvoiceLookupArgs } from '../../shared/ai-tools'
import { filterSusanHelpToolsForAuth, type SusanAuthContext } from '../../server/services/susan-auth.service'
import { helpEntityFromRoute } from '../../app/utils/platform-help-ui'

describe('susan entity query helpers', () => {
  it('extracts INV-000713 and invoice 713 phrases', () => {
    expect(extractInvoiceNumber('INV-000713')).toBe(713)
    expect(extractInvoiceNumber('inv 713')).toBe(713)
    expect(extractInvoiceNumber('whats the total of INV-000713')).toBe(713)
    expect(extractInvoiceNumber('whats the total of invoice 713')).toBe(713)
    expect(extractInvoiceNumber('invoice #713')).toBe(713)
    expect(extractInvoiceNumber('713')).toBe(713)
    expect(extractInvoiceNumber('Acme Transit')).toBeNull()
  })

  it('extracts SL numbers from phrases', () => {
    expect(extractServiceLogNumber('SL-0713')).toBe(713)
    expect(extractServiceLogNumber('sl-42')).toBe(42)
    expect(extractServiceLogNumber('status of service log 9 please')).toBe(9)
  })

  it('strips labels for ILIKE', () => {
    expect(stripInvoiceNumberLabel('INV-000713')).toBe('713')
    expect(stripServiceLogNumberLabel('SL-0713')).toBe('713')
  })

  it('infers unpaid/overdue/stats status phrases', () => {
    expect(inferInvoiceStatus('unpaid invoices')).toBe('unpaid')
    expect(inferInvoiceStatus('how manny invoices are unpaid')).toBe('unpaid')
    expect(inferInvoiceStatus('how many overdue invoices')).toBe('overdue')
    expect(inferInvoiceStatus('invoice stats')).toBe('stats')
    expect(inferInvoiceStatus('INV-000713')).toBeNull()
  })

  it('infers invoice sort for oldest/newest/largest lists', () => {
    expect(inferInvoiceSort('Whats our oldest invoices?')).toBe('oldest')
    expect(inferInvoiceSort('newest invoices')).toBe('newest')
    expect(inferInvoiceSort('largest invoices')).toBe('amount_high')
    expect(inferInvoiceSort('smallest invoices')).toBe('amount_low')
    expect(inferInvoiceStatus('Whats our oldest invoices?')).toBeNull()
  })

  it('infers customer ranking metrics', () => {
    expect(inferCustomerRankMetric('Whos our top paying customer?')).toBe('lifetime_billed')
    expect(inferCustomerRankMetric('highest open balance')).toBe('open_balance')
    expect(inferCustomerRankMetric('most paid customers')).toBe('amount_paid')
  })

  it('keeps residual customer text after stripping status filler', () => {
    expect(residualInvoiceSearchQuery('unpaid invoices for Acme Transit')).toMatch(/acme transit/i)
    expect(residualInvoiceSearchQuery('how many unpaid invoices')).toBe('')
    expect(residualInvoiceSearchQuery('Whats our oldest invoices?')).toBe('')
  })

  it('detects current-record phrasing', () => {
    expect(refersToCurrentRecord('')).toBe(true)
    expect(refersToCurrentRecord('this invoice')).toBe(true)
    expect(refersToCurrentRecord("what's the balance")).toBe(true)
    expect(refersToCurrentRecord('INV-000713')).toBe(false)
    expect(refersToCurrentRecord('how many unpaid')).toBe(false)
  })

  it('infers service log review queue', () => {
    expect(inferServiceLogStatus('review queue')).toBe('review')
    expect(inferServiceLogStatus('needs info')).toBe('needs_info')
    expect(inferServiceLogStatus('SL-12')).toBeNull()
  })

  it('parses lookup args status', () => {
    expect(parseInvoiceLookupStatus('open')).toBe('unpaid')
    expect(parseInvoiceLookupArgs({ query: 'INV-000713', status: 'unpaid' })).toMatchObject({
      query: 'INV-000713',
      status: 'unpaid',
    })
  })
})

describe('help route entity binding', () => {
  it('extracts invoice/customer/service log uuids from paths', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(helpEntityFromRoute(`/invoices/${id}`)).toEqual({ entityType: 'invoice', entityId: id })
    expect(helpEntityFromRoute(`/invoices/${id}/edit`)).toEqual({ entityType: 'invoice', entityId: id })
    expect(helpEntityFromRoute(`/service-logs/${id}`)).toEqual({ entityType: 'service_log', entityId: id })
    expect(helpEntityFromRoute(`/customers/${id}`)).toEqual({ entityType: 'customer', entityId: id })
    expect(helpEntityFromRoute('/invoices/new')).toEqual({})
  })
})

describe('permission-filtered Susan tools', () => {
  const auth = (grants: string[]): SusanAuthContext => ({
    user: {
      id: 'u1',
      accountType: 'mechanic',
      isActive: true,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
      name: 'Mech',
    },
    roleGrants: grants as SusanAuthContext['roleGrants'],
    overrides: { allow: [], deny: [] },
  })

  it('hides invoice/catalog tools for mechanics without those reads', () => {
    const tools = filterSusanHelpToolsForAuth(auth([
      'ai.help.all',
      'service_logs.read.own',
      'customers.read.all',
    ]))
    const names = tools.map(t => t.function.name)
    expect(names).toContain('get_app_knowledge')
    expect(names).toContain('lookup_service_log')
    expect(names).toContain('lookup_customer')
    expect(names).toContain('rank_customers')
    expect(names).not.toContain('lookup_invoice')
    expect(names).not.toContain('lookup_vehicle')
    expect(names).not.toContain('search_catalog')
    expect(names).not.toContain('ar_aging')
    expect(names).not.toContain('revenue_summary')
  })

  it('exposes ranking and report tools when invoices/reports are granted', () => {
    const tools = filterSusanHelpToolsForAuth(auth([
      'ai.help.all',
      'invoices.read.all',
      'customers.read.all',
      'vehicles.read.all',
      'reports.read.all',
    ]))
    const names = tools.map(t => t.function.name)
    expect(names).toContain('lookup_invoice')
    expect(names).toContain('lookup_vehicle')
    expect(names).toContain('rank_customers')
    expect(names).toContain('ar_aging')
    expect(names).toContain('revenue_summary')
  })
})
