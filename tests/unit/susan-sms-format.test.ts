import { describe, expect, it } from 'vitest'
import {
  formatSusanSmsChoiceList,
  formatSusanSmsCustomerCard,
  formatSusanSmsInvoiceCard,
  formatSmsMoney,
  matchSusanSmsPickOption,
  rankSmsNameMatch,
} from '../../shared/susan-sms-format'
import {
  classifySusanSmsTurn,
  formatSusanSmsMenu,
  isSusanSmsMenuPhrase,
  SUSAN_SMS_MENU_ACTIONS,
  type SusanSmsPendingAction,
} from '../../shared/susan-sms-actions'

describe('Susan SMS lookup formatting', () => {
  it('formats an invoice card without ids or camelCase', () => {
    const text = formatSusanSmsInvoiceCard({
      invoiceNumberFormatted: 'INV-000658',
      status: 'sent',
      customerName: 'Tomer Dvora',
      invoiceDate: '2026-03-12',
      dueDate: '2026-03-26',
      total: '12400',
      amountPaid: '0',
      balanceDue: '12400',
      lineItems: [
        { description: 'Alternator', lineAmount: '450' },
        { description: 'Labor', lineAmount: '180' },
      ],
    })
    expect(text).toContain('INV-000658 · Sent')
    expect(text).toContain('Tomer Dvora')
    expect(text).toContain('Total $12,400.00')
    expect(text).toContain('1) Alternator — $450.00')
    expect(text).not.toMatch(/invoiceDate|balanceDue|id:/)
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(text).toContain('\n\n')
  })

  it('formats a customer card as short labeled blocks', () => {
    const text = formatSusanSmsCustomerCard({
      displayName: 'Tomer Dvora',
      accountKind: 'fleet',
      email: 'rswimmer@tomerdvora.org',
      cityState: 'Brooklyn, NY',
      openBalance: '52205',
      openInvoiceCount: 19,
      invoiceCount: 147,
      paymentTerms: 'due_on_receipt',
    })
    expect(text).toContain('Tomer Dvora')
    expect(text).toContain('Fleet · Brooklyn, NY')
    expect(text).toContain('Open $52,205.00')
    expect(text).toContain('19 unpaid invoices')
    expect(text).toContain('Due on receipt')
    expect(text).not.toMatch(/accountKind|portalEnabled|openBalance=/)
  })

  it('puts a blank line between numbered choices', () => {
    const text = formatSusanSmsChoiceList('I found 2 invoices. Which one?', [
      { n: 1, id: 'a', label: 'INV-000710\nTomer Dvora · $1,850.00 · Sent' },
      { n: 2, id: 'b', label: 'INV-000658\nTomer Dvora · $12,400.00 · Sent' },
    ])
    expect(text).toContain('1) INV-000710\nTomer Dvora · $1,850.00 · Sent')
    expect(text).toMatch(/Sent\n\n2\) INV-000658/)
    expect(text).toMatch(/Text Back to go back/i)
    expect(text).not.toMatch(/\bCANCEL\b/i)
  })

  it('ranks partial names and matches pick options by name', () => {
    expect(rankSmsNameMatch('tomer', 'Tomer Dvora')).toBeGreaterThan(rankSmsNameMatch('tomer', 'Acme Transit'))
    const hit = matchSusanSmsPickOption([
      { n: 1, id: 'a', label: 'Tomer Dvora\nFleet', extra: { name: 'Tomer Dvora' } },
      { n: 2, id: 'b', label: 'Acme Transit\nFleet', extra: { name: 'Acme Transit' } },
    ], 'tomer')
    expect(hit).toMatchObject({ id: 'a' })
    expect(formatSmsMoney('1850')).toBe('$1,850.00')
  })
})

describe('Susan SMS menu phrases and abort words', () => {
  it('opens the menu on Menu, Text Menu, Help, and Actions', () => {
    expect(isSusanSmsMenuPhrase('Menu')).toBe(true)
    expect(isSusanSmsMenuPhrase('text menu')).toBe(true)
    expect(isSusanSmsMenuPhrase('HELP')).toBe(true)
    expect(isSusanSmsMenuPhrase('Actions')).toBe(true)
    expect(classifySusanSmsTurn('Text Menu', null).type).toBe('menu')
    expect(classifySusanSmsTurn('help me create an invoice', null).type).toBe('ai')
  })

  it('uses Back instead of Cancel/Stop so carriers do not unsubscribe', () => {
    const wizard: SusanSmsPendingAction = {
      kind: 'wizard',
      action: 'lookup_invoice',
      step: 'pick',
      data: {},
      startedAt: new Date().toISOString(),
    }
    expect(classifySusanSmsTurn('Back', wizard).type).toBe('cancel')
    expect(classifySusanSmsTurn('0', wizard).type).toBe('cancel')
    expect(classifySusanSmsTurn('Cancel', wizard).type).toBe('carrier')
    expect(classifySusanSmsTurn('STOP', wizard).type).toBe('carrier')
    expect(classifySusanSmsTurn('Start', wizard).type).toBe('carrier')
    const menu = formatSusanSmsMenu(SUSAN_SMS_MENU_ACTIONS, 'Alex')
    expect(menu).toContain('1) Send / resend invoice')
    expect(menu).toContain('\n\n2) Send estimate')
    expect(menu).toMatch(/Text Menu anytime/)
    expect(menu).toMatch(/Text Back to go back/)
    expect(menu).not.toMatch(/\bCANCEL\b/)
    expect(menu).not.toMatch(/\bSTOP\b/)
  })
})
