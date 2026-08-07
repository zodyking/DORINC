import { describe, expect, it } from 'vitest'
import { AI_ASSISTANT_NAME, AI_ASSISTANT_TITLE } from '../../shared/ai-assistant'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import {
  buildSusanDailyActions,
  formatSummaryVehicleLabel,
  moneyLabel,
} from '../../server/services/daily-summary.service'
import { parseSusanInsightResponse } from '../../server/services/daily-summary-susan.service'
import {
  createDailySummarySession,
  listSusanSteps,
  updateDailySummarySessionReport,
} from '../../server/services/daily-summary-session.service'
import type { DailySummaryReport } from '../../server/services/daily-summary.service'
import { buildDailySummaryEmail } from '../../server/mail/templates/system'
import { modelForFeature } from '../../server/services/ai-provider.service'
import type { AiProviderSettingsView } from '../../server/services/ai-provider.service'

function emptyBilling(overrides: Partial<BillingDashboardPayload> = {}): BillingDashboardPayload {
  return {
    configured: { vultr: false, cloudflare: false, openrouter: false },
    vultr: {
      configured: false,
      currency: 'USD',
      monthToDateUsage: null,
      accountBalance: null,
      planCostMonthly: null,
      monitoredInstances: [],
      invoices: [],
      hasPortalCredentials: false,
      error: null,
      lastUpdated: new Date().toISOString(),
    },
    cloudflare: {
      configured: false,
      domains: [],
      hasPortalCredentials: false,
      error: null,
      lastUpdated: new Date().toISOString(),
    },
    openrouter: {
      configured: false,
      totalCredits: null,
      totalUsage: null,
      remainingCredits: null,
      usageMonthly: null,
      usageDaily: null,
      limit: null,
      limitRemaining: null,
      internalMonthlyUsd: null,
      creditsNote: null,
      usageHistory: [],
      currency: 'USD',
      hasPortalCredentials: false,
      error: null,
      lastUpdated: new Date().toISOString(),
    },
    totals: {
      currency: 'USD',
      estimatedMonthlyUsd: 0,
      estimatedYearlyUsd: 0,
      breakdown: { vultrUsd: 0, cloudflareUsd: 0, openrouterUsd: 0 },
      breakdownYearly: { vultrUsd: 0, cloudflareUsd: 0, openrouterUsd: 0 },
    },
    outlook: { currency: 'USD', points: [] },
    lastRefreshed: new Date().toISOString(),
    ...overrides,
  }
}

describe('daily summary + Susan', () => {
  it('names the assistant Susan / Susan AI Assistant', () => {
    expect(AI_ASSISTANT_NAME).toBe('Susan')
    expect(AI_ASSISTANT_TITLE).toBe('Susan AI Assistant')
  })

  it('formats money with dollar sign and commas', () => {
    expect(moneyLabel(228187)).toBe('$228,187.00')
    expect(moneyLabel('1500.5')).toBe('$1,500.50')
    expect(moneyLabel(0.0042)).toBe('$0.0042')
  })

  it('formats vehicle as (type) #unit, else year make model', () => {
    expect(formatSummaryVehicleLabel({
      unitType: 'bus',
      busNumber: '12',
    })).toBe('(Bus) #12')
    expect(formatSummaryVehicleLabel({
      unitType: 'truck',
      year: 2020,
      make: 'Ford',
      model: 'F-550',
    })).toBe('2020 Ford F-550')
  })

  it('parses Susan JSON and plain-text insight responses', () => {
    expect(parseSusanInsightResponse(
      '{"insight":"There are 2 overdue invoices totaling $900.00 — follow up today."}',
      'fallback',
    )).toBe('There are 2 overdue invoices totaling $900.00. follow up today.')

    expect(parseSusanInsightResponse(
      'Cash looks tight on overdue work. Chase the oldest balances first.',
      'fallback',
    )).toBe('Cash looks tight on overdue work. Chase the oldest balances first.')

    expect(parseSusanInsightResponse('nope', 'fallback note')).toBe('fallback note')
  })

  it('uses the platform help model for daily_summary feature', () => {
    const settings = {
      id: '00000000-0000-0000-0000-000000000001',
      provider: 'openrouter',
      enabled: true,
      hasApiKey: true,
      defaultModel: 'openai/gpt-4o-mini',
      serviceLogExtractionModel: null,
      invoiceDescriptionModel: null,
      platformHelpModel: 'google/gemini-2.0-flash',
      serviceLogExtractionEnabled: true,
      invoiceDescriptionEnabled: true,
      platformHelpEnabled: true,
      dailySpendCapUsd: null,
      monthlySpendCapUsd: null,
      updatedAt: new Date(),
    } satisfies AiProviderSettingsView

    expect(modelForFeature(settings, 'daily_summary')).toBe('google/gemini-2.0-flash')
  })

  it('builds Susan section insights without em dashes', () => {
    const billing = emptyBilling({
      configured: { vultr: true, cloudflare: false, openrouter: true },
      vultr: {
        ...emptyBilling().vultr,
        configured: true,
        accountBalance: -42.5,
      },
      openrouter: {
        ...emptyBilling().openrouter,
        configured: true,
        remainingCredits: 2,
        usageMonthly: 12,
      },
      totals: {
        currency: 'USD',
        estimatedMonthlyUsd: 100,
        estimatedYearlyUsd: 1200,
        breakdown: { vultrUsd: 80, cloudflareUsd: 0, openrouterUsd: 12 },
        breakdownYearly: { vultrUsd: 960, cloudflareUsd: 0, openrouterUsd: 144 },
      },
    })

    const actions = buildSusanDailyActions({
      invoiceStats: {
        draftCount: 1,
        pendingManagerApprovalCount: 2,
        outstandingCount: 3,
        outstandingTotal: '1500.00',
        overdueCount: 2,
        overdueTotal: '900.00',
        paidThisMonthTotal: '400.00',
      },
      outstandingInvoices: [{
        id: '1',
        invoiceNumber: 'INV-000001',
        customerName: 'Acme',
        vehicleLabel: '(Bus) #12',
        invoiceDate: '2026-07-01',
        dueDate: '2026-07-15',
        balanceDue: '500.00',
        total: '500.00',
        overdue: true,
      }],
      billing,
    })

    expect(actions.some(a => /overdue/i.test(a))).toBe(true)
    expect(actions.some(a => /Vultr/i.test(a))).toBe(true)
    expect(actions.every(a => !a.includes('—'))).toBe(true)
  })

  it('renders mobile-friendly section cards with large Susan AI Assistant notes', () => {
    const mail = buildDailySummaryEmail({
      reportDateLabel: 'Aug 7, 2026',
      recipientName: 'Alex',
      invoiceStats: {
        draftCount: 0,
        pendingManagerApprovalCount: 0,
        outstandingCount: 1,
        outstandingTotal: '250.00',
        overdueCount: 1,
        overdueTotal: '250.00',
        paidThisMonthTotal: '0',
      },
      outstandingInvoices: [],
      billing: emptyBilling({ configured: { vultr: true, cloudflare: false, openrouter: true } }),
      susanEnabled: true,
      susanGenerated: 2,
      sections: [
        {
          id: 'invoices',
          title: 'Outstanding invoices',
          stats: [
            { label: 'Open', value: '1' },
            { label: 'Balance', value: '$228,187.00' },
          ],
          table: {
            headers: ['Invoice', 'Customer', 'Vehicle', 'Due', 'Balance'],
            rows: Array.from({ length: 10 }, (_, i) => [
              `INV-${i}`,
              'City Transit',
              '(Bus) #12',
              '2026-07-20 (overdue)',
              '$1,370.00',
            ]),
          },
          insight: 'There are overdue invoices totaling $228,187.00. Worth a follow-up today.',
        },
        {
          id: 'susan',
          title: 'Susan AI Assistant usage today',
          stats: [
            { label: 'Calls', value: '6' },
            { label: 'Spend', value: '$0.21' },
          ],
          table: null,
          insight: 'Susan wrote six digest notes today for about $0.21.',
        },
      ],
      appUrl: 'https://app.example.com',
    })

    expect(mail.html).toContain('Susan AI Assistant')
    expect(mail.html).toContain('font-size:22px')
    expect(mail.html).toContain('font-size:18px')
    expect(mail.html).toContain('font-size:16px')
    expect(mail.html).toContain('font-size:15px')
    expect(mail.html).toContain('$228,187.00')
    expect(mail.html).toContain('+ 2 more in the app')
    expect(mail.html).toContain('border-left:4px solid')
    expect(mail.html).toContain('wrote a note under each section')
    expect(mail.text).toContain('Susan AI Assistant:')
  })

  it('lists progressive Susan steps one section at a time from a session', () => {
    const draft = {
      reportDate: '2026-08-07',
      reportDateLabel: 'Aug 7, 2026',
      invoiceStats: {
        draftCount: 0,
        pendingManagerApprovalCount: 0,
        outstandingCount: 0,
        outstandingTotal: '0',
        overdueCount: 0,
        overdueTotal: '0',
        paidThisMonthTotal: '0',
      },
      outstandingInvoices: [],
      billing: emptyBilling(),
      sections: [
        {
          id: 'invoices',
          title: 'Outstanding invoices',
          stats: [],
          table: null,
          insight: 'draft a',
        },
        {
          id: 'susan',
          title: 'Susan AI Assistant usage today',
          stats: [],
          table: null,
          insight: 'draft b',
        },
      ],
      susanEnabled: true,
      susanGenerated: 0,
      susanFailed: 0,
      susanSkippedReason: null,
    } satisfies DailySummaryReport

    expect(listSusanSteps(draft)).toEqual([
      { id: 'invoices', title: 'Outstanding invoices' },
      { id: 'susan', title: 'Susan AI Assistant usage today' },
    ])

    const session = createDailySummarySession(
      { id: 'u1', name: 'Alex', email: 'alex@example.com' },
      draft,
    )
    const updated = updateDailySummarySessionReport(session.id, {
      ...draft,
      susanGenerated: 1,
      sections: draft.sections.map(s => (
        s.id === 'invoices' ? { ...s, insight: 'live note' } : s
      )),
    })
    expect(updated?.report.susanGenerated).toBe(1)
    expect(updated?.report.sections[0]?.insight).toBe('live note')
  })

  it('surfaces a drafted-copy banner when Susan could not run', () => {
    const mail = buildDailySummaryEmail({
      reportDateLabel: 'Aug 7, 2026',
      invoiceStats: {
        draftCount: 0,
        pendingManagerApprovalCount: 0,
        outstandingCount: 0,
        outstandingTotal: '0',
        overdueCount: 0,
        overdueTotal: '0',
        paidThisMonthTotal: '0',
      },
      sections: [{
        id: 'invoices',
        title: 'Outstanding invoices',
        stats: [{ label: 'Open', value: '0' }],
        table: null,
        insight: 'Receivables look clear today.',
      }],
      susanGenerated: 0,
      susanSkippedReason: 'AI is disabled in Control Panel → Susan',
      billing: emptyBilling(),
      appUrl: 'https://app.example.com',
    })

    expect(mail.html).toContain('notes used drafted copy')
    expect(mail.html).toContain('AI is disabled in Control Panel')
  })
})
