import { describe, expect, it } from 'vitest'
import {
  classifySusanSmsTurn,
  formatSusanSmsMenu,
  inferSusanSmsActionIntent,
  isPendingActionExpired,
  looksLikeEmail,
  parseSendEmailArgs,
  parseSendInvoiceArgs,
  parseSusanSmsPendingAction,
  visibleSusanSmsMenuActions,
  type SusanSmsPendingAction,
  SUSAN_SMS_MENU_ACTIONS,
} from '../../shared/susan-sms-actions'
import { SUSAN_HELP_TOOLS, SUSAN_SMS_ACTION_TOOLS } from '../../shared/ai-tools'

describe('Susan SMS action menu catalog', () => {
  it('lists the basic send + lookup actions', () => {
    expect(SUSAN_SMS_MENU_ACTIONS.map(a => a.id)).toEqual([
      'send_invoice',
      'send_estimate',
      'send_email',
      'lookup_invoice',
      'lookup_customer',
      'lookup_service_log',
      'search_catalog',
    ])
  })

  it('filters menu items by permission', () => {
    const visible = visibleSusanSmsMenuActions(key => key === 'invoices.send.all' || key === 'invoices.read.all')
    expect(visible.map(a => a.id)).toEqual(['send_invoice', 'lookup_invoice'])
  })

  it('formats a numbered menu', () => {
    const text = formatSusanSmsMenu(SUSAN_SMS_MENU_ACTIONS, 'Alex')
    expect(text).toContain('Hi Alex')
    expect(text).toContain('1 Send / resend invoice')
    expect(text).toContain('3 Email someone')
    expect(text).toMatch(/Text MENU/i)
  })
})

describe('Susan SMS turn classifier', () => {
  const confirm: SusanSmsPendingAction = {
    kind: 'confirm',
    tool: 'send_invoice',
    args: { invoiceId: 'inv-1' },
    preview: 'I will send INV-1',
    startedAt: new Date().toISOString(),
  }
  const wizard: SusanSmsPendingAction = {
    kind: 'wizard',
    action: 'send_invoice',
    step: 'await_query',
    data: {},
    startedAt: new Date().toISOString(),
  }

  it('opens the menu on MENU/help (exact), not on how-to questions', () => {
    expect(classifySusanSmsTurn('menu', null).type).toBe('menu')
    expect(classifySusanSmsTurn('HELP', null).type).toBe('menu')
    expect(classifySusanSmsTurn('what can you do', null).type).toBe('menu')
    expect(classifySusanSmsTurn('help me create an invoice', null).type).toBe('ai')
  })

  it('treats YES/NO as confirm/reject only while a send is pending', () => {
    expect(classifySusanSmsTurn('yes', confirm).type).toBe('confirm')
    expect(classifySusanSmsTurn('NO', confirm).type).toBe('reject')
    expect(classifySusanSmsTurn('yes', null).type).toBe('ai')
    expect(classifySusanSmsTurn('maybe later', confirm).type).toBe('confirm_needed')
  })

  it('routes wizard replies and menu numbers', () => {
    expect(classifySusanSmsTurn('INV-000713', wizard).type).toBe('wizard_input')
    expect(classifySusanSmsTurn('1', null)).toEqual({ type: 'number', n: 1 })
    expect(classifySusanSmsTurn('3.', null)).toEqual({ type: 'number', n: 3 })
    expect(classifySusanSmsTurn('cancel', wizard).type).toBe('cancel')
  })
})

describe('Susan SMS natural-language send intents', () => {
  it('maps send/resend invoice, send estimate, and email phrases', () => {
    expect(inferSusanSmsActionIntent('send invoice 713')).toEqual({ action: 'send_invoice', query: '713' })
    expect(inferSusanSmsActionIntent('resend invoice INV-000713')).toEqual({
      action: 'send_invoice',
      query: 'INV-000713',
    })
    expect(inferSusanSmsActionIntent('send estimate EST-000042')).toEqual({
      action: 'send_estimate',
      query: 'EST-000042',
    })
    expect(inferSusanSmsActionIntent('email jane@fleet.com')).toEqual({
      action: 'send_email',
      query: 'jane@fleet.com',
    })
    expect(inferSusanSmsActionIntent('how do I send an invoice')).toBeNull()
  })
})

describe('Susan SMS pending action parse + expiry', () => {
  it('round-trips a confirm payload and rejects junk', () => {
    const pending: SusanSmsPendingAction = {
      kind: 'confirm',
      tool: 'send_email',
      args: { toEmail: 'a@b.com', subject: 'Hi', body: 'Hello' },
      preview: 'preview',
      startedAt: '2026-08-19T00:00:00.000Z',
    }
    expect(parseSusanSmsPendingAction(pending)).toEqual(pending)
    expect(parseSusanSmsPendingAction({ kind: 'confirm', tool: 'nope' })).toBeNull()
  })

  it('expires pending actions after the TTL', () => {
    const startedAt = new Date('2026-08-19T00:00:00.000Z').toISOString()
    const pending: SusanSmsPendingAction = {
      kind: 'wizard',
      action: 'send_invoice',
      step: 'await_query',
      data: {},
      startedAt,
    }
    expect(isPendingActionExpired(pending, Date.parse(startedAt) + 60_000)).toBe(false)
    expect(isPendingActionExpired(pending, Date.parse(startedAt) + 16 * 60 * 1000)).toBe(true)
  })
})

describe('Susan SMS arg parsers', () => {
  it('parses send invoice/email args and email-looking text', () => {
    expect(parseSendInvoiceArgs({ invoiceId: '  abc  ', query: '713' })).toEqual({
      invoiceId: 'abc',
      query: '713',
      recipientEmail: undefined,
    })
    expect(parseSendEmailArgs({ toEmail: 'a@b.com', subject: 'Hi', body: 'Hello' })).toMatchObject({
      toEmail: 'a@b.com',
      subject: 'Hi',
      body: 'Hello',
    })
    expect(looksLikeEmail('jane@fleet.com')).toBe(true)
    expect(looksLikeEmail('not-an-email')).toBe(false)
  })
})

describe('Susan SMS action tool schemas', () => {
  it('keeps web help tools read-only and registers SMS action tools separately', () => {
    expect(SUSAN_HELP_TOOLS.map(t => t.function.name)).toEqual([
      'get_app_knowledge',
      'lookup_invoice',
      'lookup_service_log',
      'lookup_customer',
      'search_catalog',
    ])
    expect(SUSAN_SMS_ACTION_TOOLS.map(t => t.function.name)).toEqual([
      'list_sms_actions',
      'send_invoice',
      'send_estimate',
      'send_email',
    ])
  })
})
