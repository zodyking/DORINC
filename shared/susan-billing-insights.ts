import { AI_ASSISTANT_NAME } from './ai-assistant'
import { resolveOpenRouterMonthlySpend } from './billing-openrouter-spend'
import type { BillingDashboardPayload } from './validators/billing-integrations'

export interface SusanBillingInsight {
  id: string
  tone: 'ok' | 'warn' | 'action'
  title: string
  detail: string
  href?: string
  ctaLabel?: string
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

/**
 * Client + server friendly action cards for Billing — reconciliation and ops bill pay.
 */
export function buildSusanBillingInsights(
  dashboard: BillingDashboardPayload,
  opts: {
    outstandingCount?: number
    overdueCount?: number
    outstandingTotal?: string | number | null
  } = {},
): SusanBillingInsight[] {
  const insights: SusanBillingInsight[] = []
  const overdueCount = opts.overdueCount ?? 0
  const outstandingCount = opts.outstandingCount ?? 0

  if (overdueCount > 0) {
    insights.push({
      id: 'reconcile-overdue',
      tone: 'action',
      title: 'Reconcile overdue invoices',
      detail: `${overdueCount} customer invoice${overdueCount === 1 ? '' : 's'} past due${opts.outstandingTotal != null ? ` (${money(Number(opts.outstandingTotal))})` : ''}. Confirm payments or follow up.`,
      href: '/invoices/reconcile',
      ctaLabel: 'Reconcile invoices',
    })
  }
  else if (outstandingCount > 0) {
    insights.push({
      id: 'review-outstanding',
      tone: 'warn',
      title: 'Review open balances',
      detail: `${outstandingCount} sent invoice${outstandingCount === 1 ? '' : 's'} still have a balance. Keep receivables current.`,
      href: '/invoices/reconcile',
      ctaLabel: 'Reconcile invoices',
    })
  }
  else {
    insights.push({
      id: 'receivables-clear',
      tone: 'ok',
      title: 'Receivables look clear',
      detail: 'No outstanding customer balances right now. Nice work keeping collections smooth.',
      href: '/invoices',
      ctaLabel: 'View invoices',
    })
  }

  if (dashboard.configured.vultr) {
    const balance = dashboard.vultr.accountBalance
    if (balance != null && balance < 0) {
      insights.push({
        id: 'pay-vultr',
        tone: 'action',
        title: 'Pay hosting bill',
        detail: `Vultr balance is ${money(balance)}. Pay outstanding hosting charges so servers stay online.`,
        href: 'https://my.vultr.com/billing/',
        ctaLabel: 'Pay Vultr',
      })
    }
  }

  if (dashboard.configured.cloudflare) {
    const dueSoon = dashboard.cloudflare.domains.filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30)
    if (dueSoon.length) {
      const cost = dueSoon.reduce((sum, d) => sum + (d.renewalCost || 0), 0)
      insights.push({
        id: 'renew-domains',
        tone: 'warn',
        title: 'Domain renewals coming up',
        detail: `${dueSoon.length} domain${dueSoon.length === 1 ? '' : 's'} renew within 30 days (${money(cost)}). Confirm auto-renew or pay manually.`,
        href: 'https://dash.cloudflare.com/',
        ctaLabel: 'Open Cloudflare',
      })
    }
  }

  if (dashboard.configured.openrouter) {
    const remaining = dashboard.openrouter.remainingCredits ?? dashboard.openrouter.limitRemaining
    const monthly = resolveOpenRouterMonthlySpend(
      dashboard.openrouter.usageMonthly,
      dashboard.openrouter.internalMonthlyUsd,
    )
    if (remaining != null && remaining < 5) {
      insights.push({
        id: 'topup-susan',
        tone: 'action',
        title: `Top up ${AI_ASSISTANT_NAME}`,
        detail: `OpenRouter credit is low (${money(remaining)}). Add funds so ${AI_ASSISTANT_NAME} can keep helping with extractions and help chat.`,
        href: 'https://openrouter.ai/settings/credits',
        ctaLabel: 'Add credit',
      })
    }
    else if (monthly != null && monthly > 0) {
      insights.push({
        id: 'susan-usage',
        tone: 'ok',
        title: `${AI_ASSISTANT_NAME} usage this month`,
        detail: `${money(monthly)} spent on AI features. Review the usage history below if anything looks off.`,
      })
    }
  }

  const yearly = dashboard.totals.estimatedYearlyUsd
  if (yearly > 0 && (dashboard.configured.vultr || dashboard.configured.cloudflare || dashboard.configured.openrouter)) {
    insights.push({
      id: 'year-outlook',
      tone: 'ok',
      title: 'Year outlook',
      detail: `Projected ops spend this year is about ${money(yearly)} across hosting, domains, and ${AI_ASSISTANT_NAME}.`,
    })
  }

  return insights.slice(0, 5)
}
