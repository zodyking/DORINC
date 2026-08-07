import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { resolveOpenRouterMonthlySpend } from '../../shared/billing-openrouter-spend'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import type { Db } from '../db/client'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { vehicles } from '../db/schema/vehicles'
import { buildDailySummaryEmail } from '../mail/templates/system'
import { getAppUrl } from './app-config.service'
import { buildBillingDashboard } from './billing-dashboard.service'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { enqueueJob } from './jobs.service'
import { listManagersAndAdmins, uniqueEmails } from './notification-recipients.service'
import {
  getNotificationSettings,
  isNotificationEnabled,
} from './workspace-settings.service'

const LAST_SENT_SETTING_KEY = 'system.daily_summary_last_sent'

export interface DailySummaryInvoiceRow {
  id: string
  invoiceNumber: string
  customerName: string
  vehicleLabel: string
  invoiceDate: string
  dueDate: string | null
  balanceDue: string
  total: string
  overdue: boolean
}

export interface DailySummaryInvoiceStats {
  draftCount: number
  pendingManagerApprovalCount: number
  outstandingCount: number
  outstandingTotal: string
  overdueCount: number
  overdueTotal: string
  paidThisMonthTotal: string
}

export interface DailySummaryReport {
  reportDate: string
  reportDateLabel: string
  invoiceStats: DailySummaryInvoiceStats
  outstandingInvoices: DailySummaryInvoiceRow[]
  billing: BillingDashboardPayload
  susanActions: string[]
  susanEnabled: boolean
}

function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function formatReportDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function vehicleLabelFromRow(opts: {
  busNumber: string | null
  make: string | null
  model: string | null
  snapshot: {
    busNumber?: string | null
    unitTag?: string | null
    year?: number | string | null
    make?: string | null
    model?: string | null
  } | null
}): string {
  const snap = opts.snapshot
  const unit = opts.busNumber || snap?.busNumber || snap?.unitTag || ''
  const make = opts.make || snap?.make || ''
  const model = opts.model || snap?.model || ''
  const year = snap?.year != null && String(snap.year).trim() ? String(snap.year) : ''
  const ymm = [year, make, model].filter(Boolean).join(' ')
  if (unit && ymm) return `${unit} · ${ymm}`
  return unit || ymm || '—'
}

function moneyLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function buildSusanDailyActions(input: {
  invoiceStats: DailySummaryInvoiceStats
  outstandingInvoices: DailySummaryInvoiceRow[]
  billing: BillingDashboardPayload
}): string[] {
  const actions: string[] = []
  const { invoiceStats, outstandingInvoices, billing } = input

  if (invoiceStats.overdueCount > 0) {
    actions.push(
      `Reconcile ${invoiceStats.overdueCount} overdue invoice${invoiceStats.overdueCount === 1 ? '' : 's'} totaling ${moneyLabel(invoiceStats.overdueTotal)} — follow up or mark paid.`,
    )
  }
  else if (invoiceStats.outstandingCount > 0) {
    actions.push(
      `Review ${invoiceStats.outstandingCount} open invoice${invoiceStats.outstandingCount === 1 ? '' : 's'} (${moneyLabel(invoiceStats.outstandingTotal)}) for payment status.`,
    )
  }
  else {
    actions.push('No customer balances outstanding — receivables look clear today.')
  }

  if (invoiceStats.pendingManagerApprovalCount > 0) {
    actions.push(
      `Approve or return ${invoiceStats.pendingManagerApprovalCount} invoice${invoiceStats.pendingManagerApprovalCount === 1 ? '' : 's'} waiting on manager approval.`,
    )
  }

  if (billing.configured.vultr) {
    const balance = billing.vultr.accountBalance
    if (balance != null && balance < 0) {
      actions.push(`Pay Vultr — account balance is ${moneyLabel(balance)}. Keep hosting uninterrupted.`)
    }
    else if ((billing.vultr.invoices?.length ?? 0) > 0) {
      const latest = billing.vultr.invoices[0]!
      actions.push(`Check Vultr billing history — latest charge ${moneyLabel(latest.amount)} on ${latest.date}.`)
    }
  }

  if (billing.configured.cloudflare) {
    const dueSoon = billing.cloudflare.domains.filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30)
    if (dueSoon.length) {
      const cost = dueSoon.reduce((sum, d) => sum + (d.renewalCost || 0), 0)
      actions.push(
        `Confirm ${dueSoon.length} domain renewal${dueSoon.length === 1 ? '' : 's'} due within 30 days (${moneyLabel(cost)}).`,
      )
    }
  }

  if (billing.configured.openrouter) {
    const remaining = billing.openrouter.remainingCredits ?? billing.openrouter.limitRemaining
    const monthly = resolveOpenRouterMonthlySpend(
      billing.openrouter.usageMonthly,
      billing.openrouter.internalMonthlyUsd,
    )
    if (remaining != null && remaining < 5) {
      actions.push(`Top up ${AI_ASSISTANT_NAME}'s OpenRouter credit — about ${moneyLabel(remaining)} left.`)
    }
    else if (monthly != null && monthly > 0) {
      actions.push(`${AI_ASSISTANT_NAME} used ${moneyLabel(monthly)} this month — keep an eye on the spend cap.`)
    }
  }

  if (outstandingInvoices.filter(r => r.overdue).length >= 3) {
    actions.push('Prioritize the oldest overdue rows in the invoice table before end of day.')
  }

  return actions.slice(0, 6)
}

export async function loadDailySummaryInvoiceStats(db: Db): Promise<DailySummaryInvoiceStats> {
  const today = todayIsoDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const [row] = await db.select({
    draftCount: sql<number>`count(*) filter (where ${invoices.status} in ('draft', 'pending_manager_approval'))`,
    pendingManagerApprovalCount: sql<number>`count(*) filter (where ${invoices.status} = 'pending_manager_approval')`,
    outstandingCount: sql<number>`count(*) filter (
      where ${invoices.status} = 'sent' and ${invoices.balanceDue} > 0
    )`,
    outstandingTotal: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
      where ${invoices.status} = 'sent' and ${invoices.balanceDue} > 0
    ), 0)`,
    overdueCount: sql<number>`count(*) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.dueDate} < ${today}
        and ${invoices.balanceDue} > 0
    )`,
    overdueTotal: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
      where ${invoices.status} = 'sent'
        and ${invoices.dueDate} < ${today}
        and ${invoices.balanceDue} > 0
    ), 0)`,
    paidThisMonthTotal: sql<string>`coalesce(sum(${invoices.amountPaid}) filter (
      where ${invoices.status} = 'paid'
        and ${invoices.paidAt} >= ${monthStart}::timestamptz
    ), 0)`,
  })
    .from(invoices)
    .where(isNull(invoices.archivedAt))

  return {
    draftCount: Number(row?.draftCount ?? 0),
    pendingManagerApprovalCount: Number(row?.pendingManagerApprovalCount ?? 0),
    outstandingCount: Number(row?.outstandingCount ?? 0),
    outstandingTotal: String(row?.outstandingTotal ?? '0'),
    overdueCount: Number(row?.overdueCount ?? 0),
    overdueTotal: String(row?.overdueTotal ?? '0'),
    paidThisMonthTotal: String(row?.paidThisMonthTotal ?? '0'),
  }
}

export async function listOutstandingInvoicesForSummary(
  db: Db,
  limit = 40,
): Promise<DailySummaryInvoiceRow[]> {
  const today = todayIsoDate()
  const rows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    invoiceDate: invoices.invoiceDate,
    dueDate: invoices.dueDate,
    balanceDue: invoices.balanceDue,
    total: invoices.total,
    customerSnapshot: invoices.customerSnapshot,
    vehicleSnapshot: invoices.vehicleSnapshot,
    customerName: customers.displayName,
    busNumber: vehicles.busNumber,
    make: vehicles.make,
    model: vehicles.model,
  })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(vehicles, eq(invoices.vehicleId, vehicles.id))
    .where(and(
      isNull(invoices.archivedAt),
      eq(invoices.status, 'sent'),
      gt(invoices.balanceDue, '0'),
    ))
    .orderBy(
      sql`case when ${invoices.dueDate} is null then 1 else 0 end`,
      asc(invoices.dueDate),
      asc(invoices.invoiceNumber),
    )
    .limit(limit)

  return rows.map((row) => {
    const dueDate = row.dueDate
    const overdue = Boolean(dueDate && dueDate < today)
    const customerName = row.customerName
      || row.customerSnapshot?.displayName
      || 'Unknown customer'
    return {
      id: row.id,
      invoiceNumber: formatInvoiceNumber(row.invoiceNumber),
      customerName,
      vehicleLabel: vehicleLabelFromRow({
        busNumber: row.busNumber,
        make: row.make,
        model: row.model,
        snapshot: row.vehicleSnapshot,
      }),
      invoiceDate: row.invoiceDate,
      dueDate,
      balanceDue: String(row.balanceDue ?? '0'),
      total: String(row.total ?? '0'),
      overdue,
    }
  })
}

export async function buildDailySummaryReport(db: Db, now = new Date()): Promise<DailySummaryReport> {
  const reportDate = todayIsoDate(now)
  const [invoiceStats, outstandingInvoices, billing] = await Promise.all([
    loadDailySummaryInvoiceStats(db),
    listOutstandingInvoicesForSummary(db),
    buildBillingDashboard(db),
  ])

  const susanActions = buildSusanDailyActions({ invoiceStats, outstandingInvoices, billing })
  return {
    reportDate,
    reportDateLabel: formatReportDateLabel(reportDate),
    invoiceStats,
    outstandingInvoices,
    billing,
    susanActions,
    susanEnabled: billing.configured.openrouter,
  }
}

async function readLastSentDate(db: Db): Promise<string | null> {
  const { appSettings } = await import('../db/schema/settings')
  const [row] = await db.select()
    .from(appSettings)
    .where(eq(appSettings.key, LAST_SENT_SETTING_KEY))
    .limit(1)
  const value = row?.value as { date?: string } | null
  return value?.date?.trim() || null
}

async function writeLastSentDate(db: Db, date: string): Promise<void> {
  const { appSettings } = await import('../db/schema/settings')
  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, LAST_SENT_SETTING_KEY))
    .limit(1)
  if (existing) {
    await db.update(appSettings)
      .set({ value: { date }, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id))
  }
  else {
    await db.insert(appSettings).values({
      key: LAST_SENT_SETTING_KEY,
      value: { date },
    })
  }
}

export async function sendDailySummaryReport(
  db: Db,
  opts: { force?: boolean } = {},
): Promise<{ sent: number, skipped: string | null, reportDate: string }> {
  const settings = await getNotificationSettings(db)
  if (!settings.dailySummaryReport && !opts.force) {
    return { sent: 0, skipped: 'disabled', reportDate: todayIsoDate() }
  }

  const report = await buildDailySummaryReport(db)
  if (!opts.force) {
    const lastSent = await readLastSentDate(db)
    if (lastSent === report.reportDate) {
      return { sent: 0, skipped: 'already_sent_today', reportDate: report.reportDate }
    }
  }

  const recipients = await listManagersAndAdmins(db)
  const emails = uniqueEmails(recipients)
  if (!emails.length) {
    return { sent: 0, skipped: 'no_recipients', reportDate: report.reportDate }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const templateOverride = await getActiveEmailTemplateContent(db, 'daily_summary_report')
  const byEmail = new Map(recipients.map(r => [r.email.trim().toLowerCase(), r]))

  let sent = 0
  for (const email of emails) {
    const recipient = byEmail.get(email.toLowerCase())
    const mail = buildDailySummaryEmail({
      reportDateLabel: report.reportDateLabel,
      recipientName: recipient?.name?.split(/\s+/)[0] || undefined,
      invoiceStats: report.invoiceStats,
      outstandingInvoices: report.outstandingInvoices,
      billing: report.billing,
      susanActions: report.susanActions,
      appUrl,
      brand,
      templateOverride,
    })
    await enqueueJob(db, 'email_send', {
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      notificationKind: 'daily_summary_report',
    })
    sent += 1
  }

  await writeLastSentDate(db, report.reportDate)
  return { sent, skipped: null, reportDate: report.reportDate }
}

/** Called from worker ticks — respects enabled flag + UTC send hour + once/day. */
export async function maybeSendScheduledDailySummary(
  db: Db,
  now = new Date(),
): Promise<{ sent: number, skipped: string | null, reportDate: string } | null> {
  if (!(await isNotificationEnabled(db, 'dailySummaryReport'))) {
    return null
  }

  const settings = await getNotificationSettings(db)
  const hour = settings.dailySummarySendHourUtc
  if (now.getUTCHours() !== hour) {
    return null
  }

  const reportDate = todayIsoDate(now)
  const lastSent = await readLastSentDate(db)
  if (lastSent === reportDate) {
    return { sent: 0, skipped: 'already_sent_today', reportDate }
  }

  return sendDailySummaryReport(db)
}

/** Worker entry: accept a pg Pool and run through drizzle. */
export async function maybeSendScheduledDailySummaryFromPool(
  pool: Pool,
  now = new Date(),
): Promise<{ sent: number, skipped: string | null, reportDate: string } | null> {
  const db = drizzle({ client: pool }) as unknown as Db
  return maybeSendScheduledDailySummary(db, now)
}

export async function sendDailySummaryReportFromPool(
  pool: Pool,
  opts: { force?: boolean } = {},
): Promise<{ sent: number, skipped: string | null, reportDate: string }> {
  const db = drizzle({ client: pool }) as unknown as Db
  return sendDailySummaryReport(db, opts)
}
