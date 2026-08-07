import { describe, expect, it } from 'vitest'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { buildSusanBillingInsights } from '../../shared/susan-billing-insights'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import { buildSusanDailyActions } from '../../server/services/daily-summary.service'
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

  it('builds actionable Susan recommendations from overdue invoices and Vultr balance', () => {
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
          vehicleLabel: '12 · Ford',
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
    expect(actions.some(a => a.includes(AI_ASSISTANT_NAME))).toBe(true)
  })

  it('renders outstanding invoice table HTML in the daily summary email', () => {
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
        vehicleLabel: 'Bus 12 · Blue Bird',
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
      susanActions: ['Reconcile overdue invoices'],
      appUrl: 'https://app.example.com',
    })

    expect(mail.subject).toContain('Daily Summary')
    expect(mail.html).toContain('INV-000042')
    expect(mail.html).toContain('City Transit')
    expect(mail.html).toContain('Bus 12')
    expect(mail.html).toContain('Outstanding invoices')
    expect(mail.html).toContain('Year outlook')
    expect(mail.html).toContain('Susan')
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
