import { describe, expect, it } from 'vitest'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { buildSusanBillingInsights } from '../../shared/susan-billing-insights'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import {
  buildSusanDailyActions,
  formatSummaryVehicleLabel,
} from '../../server/services/daily-summary.service'
import { buildDailySummaryEmail } from '../../server/mail/templates/system'

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
  it('names the assistant Susan', () => {
    expect(AI_ASSISTANT_NAME).toBe('Susan')
  })

  it('formats vehicle as (type) #unit, else year make model', () => {
    expect(formatSummaryVehicleLabel({
      unitType: 'bus',
      busNumber: '12',
      year: 2018,
      make: 'Blue Bird',
      model: 'Vision',
    })).toBe('(Bus) #12')

    expect(formatSummaryVehicleLabel({
      unitType: 'van',
      unitTag: 'V-9',
    })).toBe('(Van) #V-9')

    expect(formatSummaryVehicleLabel({
      unitType: 'truck',
      year: 2020,
      make: 'Ford',
      model: 'F-550',
    })).toBe('2020 Ford F-550')
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
      outstandingInvoices: [
        {
          id: '1',
          invoiceNumber: 'INV-000001',
          customerName: 'Acme',
          vehicleLabel: '(Bus) #12',
          invoiceDate: '2026-07-01',
          dueDate: '2026-07-15',
          balanceDue: '500.00',
          total: '500.00',
          overdue: true,
        },
      ],
      billing,
    })

    expect(actions.some(a => /overdue/i.test(a))).toBe(true)
    expect(actions.some(a => /Vultr/i.test(a))).toBe(true)
    expect(actions.some(a => /manager approval/i.test(a))).toBe(true)
    expect(actions.every(a => !a.includes('—'))).toBe(true)
  })

  it('renders section stats, tables, and alternating Susan quotes', () => {
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
      outstandingInvoices: [{
        invoiceNumber: 'INV-000042',
        customerName: 'City Transit',
        vehicleLabel: '(Bus) #12',
        invoiceDate: '2026-07-01',
        dueDate: '2026-07-20',
        balanceDue: '250.00',
        total: '250.00',
        overdue: true,
      }],
      billing: emptyBilling({
        configured: { vultr: true, cloudflare: false, openrouter: true },
        totals: {
          currency: 'USD',
          estimatedMonthlyUsd: 90,
          estimatedYearlyUsd: 1080,
          breakdown: { vultrUsd: 80, cloudflareUsd: 0, openrouterUsd: 10 },
          breakdownYearly: { vultrUsd: 960, cloudflareUsd: 0, openrouterUsd: 120 },
        },
      }),
      susanEnabled: true,
      sections: [
        {
          id: 'invoices',
          title: 'Outstanding invoices',
          stats: [
            { label: 'Open', value: '1' },
            { label: 'Balance', value: '$250.00' },
          ],
          table: {
            headers: ['Invoice', 'Customer', 'Vehicle', 'Due', 'Balance'],
            rows: [['INV-000042', 'City Transit', '(Bus) #12', '2026-07-20 (overdue)', '$250.00']],
          },
          insight: '1 overdue invoice totaling $250.00. Follow up or mark paid before end of day.',
        },
        {
          id: 'susan',
          title: 'Susan usage today',
          stats: [
            { label: 'Tokens', value: '12,400' },
            { label: 'Spend', value: '$1.25' },
          ],
          table: null,
          insight: 'Susan handled 3 calls today using 12,400 tokens ($1.25).',
        },
        {
          id: 'inquiries',
          title: 'Customer inquiries',
          stats: [{ label: 'Received today', value: '2' }],
          table: {
            headers: ['From', 'Subject', 'Status', 'Resolved by'],
            rows: [['Acme', 'Quote request', 'Resolved', 'Jordan']],
          },
          insight: '2 customer emails came in. 1 resolved, 1 still open.',
        },
      ],
      appUrl: 'https://app.example.com',
    })

    expect(mail.subject).toBe('Daily Summary: Aug 7, 2026')
    expect(mail.subject).not.toContain('—')
    expect(mail.html).toContain('INV-000042')
    expect(mail.html).toContain('City Transit')
    expect(mail.html).toContain('(Bus) #12')
    expect(mail.html).toContain('Outstanding invoices')
    expect(mail.html).toContain('Susan usage today')
    expect(mail.html).toContain('Customer inquiries')
    expect(mail.html).toContain('12,400')
    expect(mail.html).toContain('$1.25')
    expect(mail.html).toContain('Jordan')
    expect(mail.html).toContain('&ldquo;')
    expect(mail.html).toContain('font-style:italic')
    expect(mail.html).toContain('font-weight:700')
    expect(mail.html).toContain('align="right"')
    expect(mail.html).toContain('align="left"')
    expect(mail.text).toContain('Susan: "')
    expect(mail.text).toContain('INV-000042')
  })

  it('builds billing-page Susan insights with reconcile CTA', () => {
    const insights = buildSusanBillingInsights(emptyBilling(), {
      overdueCount: 2,
      outstandingCount: 2,
      outstandingTotal: '800',
    })
    expect(insights[0]?.href).toBe('/invoices/reconcile')
    expect(insights[0]?.ctaLabel).toMatch(/Reconcile/i)
  })
})
