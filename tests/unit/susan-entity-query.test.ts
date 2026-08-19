import { describe, expect, it } from 'vitest'
import {
  extractInvoiceNumber,
  extractServiceLogNumber,
  extractEstimateNumber,
  inferInvoiceStatus,
  inferInvoiceSort,
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

  it('extracts EST numbers from phrases', () => {
    expect(extractEstimateNumber('EST-000042')).toBe(42)
    expect(extractEstimateNumber('est 42')).toBe(42)
    expect(extractEstimateNumber('estimate #9')).toBe(9)
    expect(extractEstimateNumber('Acme Transit')).toBeNull()
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

  it('keeps residual customer text after stripping status filler', () => {
    expect(residualInvoiceSearchQuery('unpaid invoices for Acme Transit')).toMatch(/acme transit/i)
    expect(residualInvoiceSearchQuery('how many unpaid invoices')).toBe('')
    expect(residualInvoiceSearchQuery('whats our oldest invoice')).toBe('')
  })

  it('infers oldest/newest invoice sort', () => {
    expect(inferInvoiceSort('whats our oldest invoice')).toBe('oldest')
    expect(inferInvoiceSort('newest invoice')).toBe('newest')
    expect(inferInvoiceSort('INV-000713')).toBeNull()
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
    expect(names).not.toContain('lookup_invoice')
    expect(names).not.toContain('search_catalog')
    expect(names).not.toContain('send_invoice')
  })

  it('adds SMS action tools only on the sms channel', () => {
    const grants = [
      'ai.help.all',
      'invoices.read.all',
      'invoices.send.all',
      'estimates.manage.all',
      'messages.send.own',
      'customers.read.all',
      'catalog.read.all',
      'service_logs.read.all',
    ]
    const web = filterSusanHelpToolsForAuth(auth(grants)).map(t => t.function.name)
    const sms = filterSusanHelpToolsForAuth(auth(grants), { channel: 'sms' }).map(t => t.function.name)
    expect(web).not.toContain('send_invoice')
    expect(web).not.toContain('list_sms_actions')
    expect(sms).toContain('list_sms_actions')
    expect(sms).toContain('send_invoice')
    expect(sms).toContain('send_estimate')
    expect(sms).toContain('send_email')
  })
})
