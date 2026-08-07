import { and, asc, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { AI_ASSISTANT_NAME, AI_ASSISTANT_TITLE } from '../../shared/ai-assistant'
import { resolveOpenRouterMonthlySpend } from '../../shared/billing-openrouter-spend'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import type { Db } from '../db/client'
import { aiUsageLogs } from '../db/schema/ai'
import { customers } from '../db/schema/customers'
import { entityDeletionRequests } from '../db/schema/deletion-requests'
import { emailMessageMeta, emailThreads } from '../db/schema/email-inbox'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { messages } from '../db/schema/messages'
import { users } from '../db/schema/auth'
import { vehicles } from '../db/schema/vehicles'
import { sendBrandedMail } from '../mail/branded-mail'
import { buildDailySummaryEmail } from '../mail/templates/system'
import { getAppUrl } from './app-config.service'
import { getBackupHealth } from './backups.service'
import { buildBillingDashboard } from './billing-dashboard.service'
import { applySusanDailyInsights } from './daily-summary-susan.service'
import { getDatabaseSizeMetrics } from './database-size.service'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { enqueueJob } from './jobs.service'
import {
  listManagersAndAdmins,
  type StaffNotifyRecipient,
  uniqueEmails,
} from './notification-recipients.service'
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

export interface DailySummaryStat {
  label: string
  value: string
}

export interface DailySummaryTable {
  headers: string[]
  rows: string[][]
}

export interface DailySummarySection {
  id: string
  title: string
  stats: DailySummaryStat[]
  table: DailySummaryTable | null
  insight: string
}

export interface DailySummaryReport {
  reportDate: string
  reportDateLabel: string
  invoiceStats: DailySummaryInvoiceStats
  outstandingInvoices: DailySummaryInvoiceRow[]
  billing: BillingDashboardPayload
  sections: DailySummarySection[]
  susanEnabled: boolean
  susanGenerated: number
  susanFailed: number
  susanSkippedReason: string | null
}

export interface DailySummarySendResult {
  sent: number
  delivered: number
  failed: number
  skipped: string | null
  reportDate: string
  recipients: string[]
  errors: string[]
  delivery: 'direct' | 'queue'
  susanGenerated: number
  susanFailed: number
  susanSkippedReason: string | null
}

function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
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

function titleCase(value: string): string {
  return String(value || '')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Vehicle cell: "(Type) #Unit" or year/make/model when no unit number. */
export function formatSummaryVehicleLabel(opts: {
  unitType?: string | null
  busNumber?: string | null
  unitTag?: string | null
  year?: number | string | null
  make?: string | null
  model?: string | null
  snapshot?: {
    unitType?: string | null
    busNumber?: string | null
    unitTag?: string | null
    year?: number | string | null
    make?: string | null
    model?: string | null
  } | null
}): string {
  const snap = opts.snapshot
  const unitType = opts.unitType || snap?.unitType || 'vehicle'
  const unit = (opts.busNumber || snap?.busNumber || opts.unitTag || snap?.unitTag || '').trim()
  if (unit) return `(${titleCase(unitType)}) #${unit}`

  const year = opts.year ?? snap?.year
  const make = opts.make || snap?.make || ''
  const model = opts.model || snap?.model || ''
  const ymm = [year != null && String(year).trim() ? String(year) : '', make, model].filter(Boolean).join(' ')
  return ymm || 'n/a'
}

/** USD with $ and thousands separators; keeps sub-cent AI costs readable. */
export function moneyLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'n/a'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('$')) return trimmed
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) return String(value)
  const abs = Math.abs(n)
  const maxFraction = abs > 0 && abs < 0.01 ? 4 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFraction,
  }).format(n)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'n/a'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

function formatWhen(value: Date | string | null | undefined): string {
  if (!value) return 'Never'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'
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
    unitTag: vehicles.unitTag,
    unitType: vehicles.unitType,
    year: vehicles.year,
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
      vehicleLabel: formatSummaryVehicleLabel({
        unitType: row.unitType,
        busNumber: row.busNumber,
        unitTag: row.unitTag,
        year: row.year,
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

async function loadBillingForSummary(db: Db): Promise<BillingDashboardPayload> {
  try {
    return await Promise.race([
      buildBillingDashboard(db),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Billing dashboard timed out')), 12_000)
      }),
    ])
  }
  catch (err) {
    console.warn('[daily-summary] billing snapshot unavailable:', err instanceof Error ? err.message : err)
    const nowIso = new Date().toISOString()
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
        error: err instanceof Error ? err.message : 'Billing unavailable',
        lastUpdated: nowIso,
      },
      cloudflare: {
        configured: false,
        domains: [],
        hasPortalCredentials: false,
        error: null,
        lastUpdated: nowIso,
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
        lastUpdated: nowIso,
      },
      totals: {
        currency: 'USD',
        estimatedMonthlyUsd: 0,
        estimatedYearlyUsd: 0,
        breakdown: { vultrUsd: 0, cloudflareUsd: 0, openrouterUsd: 0 },
        breakdownYearly: { vultrUsd: 0, cloudflareUsd: 0, openrouterUsd: 0 },
      },
      outlook: { currency: 'USD', points: [] },
      lastRefreshed: nowIso,
    }
  }
}

async function loadAiUsageToday(db: Db, day = new Date()) {
  const dayStart = startOfUtcDay(day)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const [row] = await db.select({
    costUsd: sql<string>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)`,
    tokens: sql<string>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)`,
    calls: sql<number>`count(*)`,
  })
    .from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, dayStart),
      lt(aiUsageLogs.createdAt, dayEnd),
    ))

  return {
    costUsd: Number(row?.costUsd ?? 0),
    tokens: Number(row?.tokens ?? 0),
    calls: Number(row?.calls ?? 0),
  }
}

async function loadCustomerInquiriesToday(db: Db, day = new Date()) {
  const dayStart = startOfUtcDay(day)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const inbound = await db.select({
    conversationId: emailThreads.conversationId,
    subject: emailThreads.subject,
    counterpartEmail: emailThreads.counterpartEmail,
    counterpartName: emailThreads.counterpartName,
    customerName: customers.displayName,
    messageId: messages.id,
    createdAt: messages.createdAt,
  })
    .from(messages)
    .innerJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .innerJoin(emailThreads, eq(emailThreads.conversationId, messages.conversationId))
    .leftJoin(customers, eq(emailThreads.customerId, customers.id))
    .where(and(
      eq(emailMessageMeta.direction, 'inbound'),
      gte(messages.createdAt, dayStart),
      lt(messages.createdAt, dayEnd),
    ))
    .orderBy(desc(messages.createdAt))
    .limit(40)

  const byConversation = new Map<string, typeof inbound[number]>()
  for (const row of inbound) {
    if (!byConversation.has(row.conversationId)) byConversation.set(row.conversationId, row)
  }

  const items: Array<{
    subject: string
    from: string
    status: string
    resolvedBy: string
  }> = []

  for (const row of byConversation.values()) {
    const [reply] = await db.select({
      senderName: users.name,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .innerJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
      .leftJoin(users, eq(users.id, emailMessageMeta.sentByUserId))
      .where(and(
        eq(messages.conversationId, row.conversationId),
        eq(emailMessageMeta.direction, 'outbound'),
        gte(messages.createdAt, row.createdAt),
      ))
      .orderBy(asc(messages.createdAt))
      .limit(1)

    const from = row.customerName || row.counterpartName || row.counterpartEmail
    items.push({
      subject: row.subject || '(no subject)',
      from,
      status: reply ? 'Resolved' : 'Open',
      resolvedBy: reply?.senderName?.trim() || (reply ? 'Staff' : 'Pending'),
    })
  }

  const resolved = items.filter(i => i.status === 'Resolved').length
  return {
    received: items.length,
    resolved,
    open: items.length - resolved,
    items: items.slice(0, 12),
  }
}

async function loadDeletionSummary(db: Db, day = new Date()) {
  const dayStart = startOfUtcDay(day)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const [counts] = await db.select({
    pending: sql<number>`count(*) filter (where ${entityDeletionRequests.status} = 'pending')`,
    approvedToday: sql<number>`count(*) filter (
      where ${entityDeletionRequests.status} = 'approved'
        and ${entityDeletionRequests.reviewedAt} >= ${dayStart}
        and ${entityDeletionRequests.reviewedAt} < ${dayEnd}
    )`,
    rejectedToday: sql<number>`count(*) filter (
      where ${entityDeletionRequests.status} = 'rejected'
        and ${entityDeletionRequests.reviewedAt} >= ${dayStart}
        and ${entityDeletionRequests.reviewedAt} < ${dayEnd}
    )`,
    submittedToday: sql<number>`count(*) filter (
      where ${entityDeletionRequests.createdAt} >= ${dayStart}
        and ${entityDeletionRequests.createdAt} < ${dayEnd}
    )`,
  }).from(entityDeletionRequests)

  const pendingRows = await db.select({
    entityLabel: entityDeletionRequests.entityLabel,
    entityType: entityDeletionRequests.entityType,
    submitterName: users.name,
    createdAt: entityDeletionRequests.createdAt,
  })
    .from(entityDeletionRequests)
    .leftJoin(users, eq(users.id, entityDeletionRequests.submittedBy))
    .where(eq(entityDeletionRequests.status, 'pending'))
    .orderBy(desc(entityDeletionRequests.createdAt))
    .limit(8)

  return {
    pending: Number(counts?.pending ?? 0),
    approvedToday: Number(counts?.approvedToday ?? 0),
    rejectedToday: Number(counts?.rejectedToday ?? 0),
    submittedToday: Number(counts?.submittedToday ?? 0),
    pendingRows,
  }
}

function estimateDaysUntilFull(opts: {
  usedBytes: number
  capacityBytes: number | null
  change7dBytes: number | null
}): { freeBytes: number | null, daysUntilFull: number | null, dailyGrowthBytes: number | null } {
  const dailyGrowth = opts.change7dBytes != null
    ? opts.change7dBytes / 7
    : null
  const freeBytes = opts.capacityBytes != null
    ? Math.max(0, opts.capacityBytes - opts.usedBytes)
    : null

  let daysUntilFull: number | null = null
  if (freeBytes != null && dailyGrowth != null && dailyGrowth > 0) {
    daysUntilFull = Math.max(1, Math.round(freeBytes / dailyGrowth))
  }
  else if (dailyGrowth != null && dailyGrowth > 0 && opts.capacityBytes == null) {
    // No host capacity known: estimate days until DB doubles from current size.
    daysUntilFull = Math.max(1, Math.round(opts.usedBytes / dailyGrowth))
  }

  return {
    freeBytes,
    daysUntilFull,
    dailyGrowthBytes: dailyGrowth != null && dailyGrowth > 0 ? dailyGrowth : null,
  }
}

export function buildSusanUsageSection(
  aiToday: { costUsd: number, tokens: number, calls: number },
  billing: BillingDashboardPayload,
): DailySummarySection {
  const susanConfigured = billing.configured.openrouter
  let aiInsight = susanConfigured
    ? `${AI_ASSISTANT_NAME} has been quiet so far today.`
    : `${AI_ASSISTANT_TITLE} is not connected yet. Add an OpenRouter key when you want usage tracked.`
  if (susanConfigured && aiToday.calls > 0) {
    aiInsight = `${AI_ASSISTANT_NAME} ran ${aiToday.calls} call${aiToday.calls === 1 ? '' : 's'} today for ${formatTokens(aiToday.tokens)} tokens (${moneyLabel(aiToday.costUsd)}).`
    const remaining = billing.openrouter.remainingCredits ?? billing.openrouter.limitRemaining
    if (remaining != null && remaining < 5) {
      aiInsight += ` Credit is getting low at ${moneyLabel(remaining)}, so a top-up soon would help.`
    }
  }
  else if (susanConfigured) {
    const monthly = resolveOpenRouterMonthlySpend(
      billing.openrouter.usageMonthly,
      billing.openrouter.internalMonthlyUsd,
    )
    if (monthly != null && monthly > 0) {
      aiInsight = `${AI_ASSISTANT_NAME} has not been used yet today. Month to date is ${moneyLabel(monthly)}.`
    }
  }

  return {
    id: 'susan',
    title: `${AI_ASSISTANT_TITLE} usage today`,
    stats: [
      { label: 'Calls', value: String(aiToday.calls) },
      { label: 'Tokens', value: formatTokens(aiToday.tokens) },
      { label: 'Spend', value: moneyLabel(aiToday.costUsd) },
      {
        label: 'Credit left',
        value: susanConfigured
          ? moneyLabel(billing.openrouter.remainingCredits ?? billing.openrouter.limitRemaining)
          : 'Not configured',
      },
    ],
    table: null,
    insight: aiInsight,
  }
}

function buildSections(input: {
  invoiceStats: DailySummaryInvoiceStats
  outstandingInvoices: DailySummaryInvoiceRow[]
  billing: BillingDashboardPayload
  aiToday: { costUsd: number, tokens: number, calls: number }
  inquiries: Awaited<ReturnType<typeof loadCustomerInquiriesToday>>
  deletions: Awaited<ReturnType<typeof loadDeletionSummary>>
  backup: Awaited<ReturnType<typeof getBackupHealth>>
  disk: {
    usedBytes: number
    freeBytes: number | null
    capacityBytes: number | null
    dailyGrowthBytes: number | null
    daysUntilFull: number | null
    change7dPercent: number | null
  }
}): DailySummarySection[] {
  const {
    invoiceStats,
    outstandingInvoices,
    billing,
    aiToday,
    inquiries,
    deletions,
    backup,
    disk,
  } = input

  const sections: DailySummarySection[] = []

  // 1. Outstanding invoices
  let invoiceInsight = 'Receivables look clear today. Nothing outstanding needs a chase right now.'
  if (invoiceStats.overdueCount > 0) {
    invoiceInsight = `There are ${invoiceStats.overdueCount} overdue invoice${invoiceStats.overdueCount === 1 ? '' : 's'} totaling ${moneyLabel(invoiceStats.overdueTotal)}. Worth a follow-up or payment update before the day wraps.`
  }
  else if (invoiceStats.outstandingCount > 0) {
    invoiceInsight = `${invoiceStats.outstandingCount} open invoice${invoiceStats.outstandingCount === 1 ? '' : 's'} still show a balance of ${moneyLabel(invoiceStats.outstandingTotal)}. A quick reconcile pass will keep cash flow steady.`
  }
  if (invoiceStats.pendingManagerApprovalCount > 0) {
    invoiceInsight += ` ${invoiceStats.pendingManagerApprovalCount} still need manager approval.`
  }

  sections.push({
    id: 'invoices',
    title: 'Outstanding invoices',
    stats: [
      { label: 'Open', value: String(invoiceStats.outstandingCount) },
      { label: 'Balance', value: moneyLabel(invoiceStats.outstandingTotal) },
      { label: 'Overdue', value: String(invoiceStats.overdueCount) },
      { label: 'Paid this month', value: moneyLabel(invoiceStats.paidThisMonthTotal) },
    ],
    table: {
      headers: ['Invoice', 'Customer', 'Vehicle', 'Due', 'Balance'],
      rows: outstandingInvoices.length
        ? outstandingInvoices.map(row => [
            row.invoiceNumber,
            row.customerName,
            row.vehicleLabel,
            row.overdue ? `${row.dueDate || 'n/a'} (overdue)` : (row.dueDate || 'n/a'),
            moneyLabel(row.balanceDue),
          ])
        : [['No outstanding customer invoices.', '', '', '', '']],
    },
    insight: invoiceInsight,
  })

  // 2. Susan AI usage today
  sections.push(buildSusanUsageSection(aiToday, billing))

  // 3. Customer inquiries
  let inquiryInsight = 'Inbox was quiet today. No new customer emails came in.'
  if (inquiries.received > 0) {
    inquiryInsight = `${inquiries.received} customer email${inquiries.received === 1 ? '' : 's'} came in today. ${inquiries.resolved} already handled, ${inquiries.open} still open.`
    if (inquiries.open > 0) {
      inquiryInsight += ' A reply before end of day keeps things from stacking up.'
    }
  }

  sections.push({
    id: 'inquiries',
    title: 'Customer inquiries',
    stats: [
      { label: 'Received today', value: String(inquiries.received) },
      { label: 'Resolved', value: String(inquiries.resolved) },
      { label: 'Open', value: String(inquiries.open) },
    ],
    table: inquiries.items.length
      ? {
          headers: ['From', 'Subject', 'Status', 'Resolved by'],
          rows: inquiries.items.map(i => [i.from, i.subject, i.status, i.resolvedBy]),
        }
      : null,
    insight: inquiryInsight,
  })

  // 4. Deletion requests
  let deletionInsight = 'No deletion requests need attention right now.'
  if (deletions.pending > 0) {
    deletionInsight = `${deletions.pending} deletion request${deletions.pending === 1 ? '' : 's'} still waiting on a review decision.`
  }
  else if (deletions.approvedToday || deletions.rejectedToday) {
    deletionInsight = `You cleared ${deletions.approvedToday + deletions.rejectedToday} request${deletions.approvedToday + deletions.rejectedToday === 1 ? '' : 's'} today (${deletions.approvedToday} approved, ${deletions.rejectedToday} denied).`
  }
  else if (deletions.submittedToday > 0) {
    deletionInsight = `${deletions.submittedToday} new request${deletions.submittedToday === 1 ? '' : 's'} came in today and already got cleared.`
  }

  sections.push({
    id: 'deletions',
    title: 'Deletion requests',
    stats: [
      { label: 'Pending', value: String(deletions.pending) },
      { label: 'Submitted today', value: String(deletions.submittedToday) },
      { label: 'Approved today', value: String(deletions.approvedToday) },
      { label: 'Denied today', value: String(deletions.rejectedToday) },
    ],
    table: deletions.pendingRows.length
      ? {
          headers: ['Item', 'Type', 'Submitted by'],
          rows: deletions.pendingRows.map(r => [
            r.entityLabel || 'Untitled',
            titleCase(r.entityType),
            r.submitterName || 'Unknown',
          ]),
        }
      : null,
    insight: deletionInsight,
  })

  // 5. Backup
  const backupSetup = backup.scheduleEnabled || backup.driveConnected || Boolean(backup.lastRun)
  let backupInsight = 'Online backup is not set up yet. Turn on a nightly schedule or run a manual backup when you can.'
  if (backup.status === 'healthy') {
    backupInsight = `Backups look solid. Last successful run was ${formatWhen(backup.lastRun?.finishedAt ?? backup.lastRun?.createdAt)}.`
    if (backup.driveConnected) backupInsight += ' Google Drive offsite copy is connected.'
  }
  else if (backup.status === 'error') {
    backupInsight = `The latest backup failed. ${backup.message.replace(/—/g, '. ').replace(/\s+/g, ' ').trim()}`
  }
  else if (backupSetup) {
    backupInsight = backup.message.replace(/—/g, '. ').replace(/\s+/g, ' ').trim()
  }

  sections.push({
    id: 'backup',
    title: 'Online backup',
    stats: [
      { label: 'Status', value: titleCase(backup.status.replace(/_/g, ' ')) },
      { label: 'Schedule', value: backup.scheduleEnabled ? backup.scheduleLabel : 'Off' },
      { label: 'Google Drive', value: backup.driveConnected ? (backup.driveAccountEmail || 'Connected') : 'Not connected' },
      { label: 'Last backup', value: formatWhen(backup.lastRun?.finishedAt ?? backup.lastRun?.createdAt) },
    ],
    table: null,
    insight: backupInsight,
  })

  // 6. Disk / database storage
  let diskInsight = `The database is using ${formatBytes(disk.usedBytes)} right now.`
  if (disk.dailyGrowthBytes != null) {
    diskInsight += ` It has been growing about ${formatBytes(disk.dailyGrowthBytes)} per day.`
  }
  if (disk.freeBytes != null && disk.daysUntilFull != null) {
    diskInsight += ` At that pace you have roughly ${disk.daysUntilFull} day${disk.daysUntilFull === 1 ? '' : 's'} before the volume fills up.`
  }
  else if (disk.daysUntilFull != null && disk.freeBytes == null) {
    diskInsight += ` At that pace the database would about double in ${disk.daysUntilFull} day${disk.daysUntilFull === 1 ? '' : 's'}.`
  }
  else if (disk.dailyGrowthBytes == null) {
    diskInsight += ' There is not enough history yet to estimate when it will fill.'
  }

  sections.push({
    id: 'disk',
    title: 'Disk and database space',
    stats: [
      { label: 'Database used', value: formatBytes(disk.usedBytes) },
      { label: 'Free (est.)', value: disk.freeBytes != null ? formatBytes(disk.freeBytes) : 'Unknown' },
      { label: 'Capacity (est.)', value: disk.capacityBytes != null ? formatBytes(disk.capacityBytes) : 'Unknown' },
      {
        label: 'Days until full',
        value: disk.daysUntilFull != null ? `~${disk.daysUntilFull}` : 'n/a',
      },
    ],
    table: null,
    insight: diskInsight,
  })

  // 7. Ops billing (when configured)
  const hasBilling = billing.configured.vultr || billing.configured.cloudflare || billing.configured.openrouter
  if (hasBilling) {
    const billingStats: DailySummaryStat[] = [
      { label: 'Est. monthly', value: moneyLabel(billing.totals.estimatedMonthlyUsd) },
      { label: 'Est. yearly', value: moneyLabel(billing.totals.estimatedYearlyUsd) },
    ]
    if (billing.configured.vultr) {
      billingStats.push(
        { label: 'Hosting / mo', value: moneyLabel(billing.totals.breakdown.vultrUsd) },
        { label: 'Vultr balance', value: moneyLabel(billing.vultr.accountBalance) },
      )
    }
    if (billing.configured.cloudflare) {
      const dueSoon = billing.cloudflare.domains.filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30).length
      billingStats.push(
        { label: 'Domains', value: String(billing.cloudflare.domains.length) },
        { label: 'Renewals ≤30d', value: String(dueSoon) },
      )
    }

    let billingInsight = `Ops spend looks like about ${moneyLabel(billing.totals.estimatedYearlyUsd)} for the year across the connected providers.`
    if (billing.configured.vultr && billing.vultr.accountBalance != null && billing.vultr.accountBalance < 0) {
      billingInsight = `Vultr balance is ${moneyLabel(billing.vultr.accountBalance)}. Top that up soon so hosting stays online.`
    }
    else if (billing.configured.cloudflare) {
      const dueSoon = billing.cloudflare.domains.filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30)
      if (dueSoon.length) {
        const cost = dueSoon.reduce((sum, d) => sum + (d.renewalCost || 0), 0)
        billingInsight = `${dueSoon.length} domain renewal${dueSoon.length === 1 ? '' : 's'} come due within 30 days (${moneyLabel(cost)}). Confirm auto-renew or pay those manually.`
      }
    }

    sections.push({
      id: 'billing',
      title: 'Operations billing',
      stats: billingStats,
      table: null,
      insight: billingInsight,
    })
  }

  return sections
}

/** Build the digest stats/tables with draft Susan copy (no OpenRouter calls). */
export async function buildDailySummaryReportDraft(
  db: Db,
  now = new Date(),
): Promise<DailySummaryReport> {
  const reportDate = todayIsoDate(now)
  const [
    invoiceStats,
    outstandingInvoices,
    billing,
    aiToday,
    inquiries,
    deletions,
    backup,
    dbSize,
  ] = await Promise.all([
    loadDailySummaryInvoiceStats(db),
    listOutstandingInvoicesForSummary(db),
    loadBillingForSummary(db),
    loadAiUsageToday(db, now),
    loadCustomerInquiriesToday(db, now).catch((err) => {
      console.warn('[daily-summary] inquiries unavailable:', err instanceof Error ? err.message : err)
      return { received: 0, resolved: 0, open: 0, items: [] as Array<{ subject: string, from: string, status: string, resolvedBy: string }> }
    }),
    loadDeletionSummary(db, now).catch((err) => {
      console.warn('[daily-summary] deletions unavailable:', err instanceof Error ? err.message : err)
      return { pending: 0, approvedToday: 0, rejectedToday: 0, submittedToday: 0, pendingRows: [] as Array<{ entityLabel: string | null, entityType: string, submitterName: string | null, createdAt: Date }> }
    }),
    getBackupHealth(db),
    getDatabaseSizeMetrics(db),
  ])

  const capacityBytes = billing.vultr.monitoredInstances.reduce((sum, row) => {
    return sum + (typeof row.diskGb === 'number' && row.diskGb > 0 ? row.diskGb * 1024 ** 3 : 0)
  }, 0) || null

  const diskEst = estimateDaysUntilFull({
    usedBytes: dbSize.currentBytes,
    capacityBytes,
    change7dBytes: dbSize.change7dBytes,
  })

  const sections = buildSections({
    invoiceStats,
    outstandingInvoices,
    billing,
    aiToday,
    inquiries,
    deletions,
    backup,
    disk: {
      usedBytes: dbSize.currentBytes,
      freeBytes: diskEst.freeBytes,
      capacityBytes,
      dailyGrowthBytes: diskEst.dailyGrowthBytes,
      daysUntilFull: diskEst.daysUntilFull,
      change7dPercent: dbSize.change7dPercent,
    },
  })

  return {
    reportDate,
    reportDateLabel: formatReportDateLabel(reportDate),
    invoiceStats,
    outstandingInvoices,
    billing,
    sections,
    susanEnabled: billing.configured.openrouter,
    susanGenerated: 0,
    susanFailed: 0,
    susanSkippedReason: null,
  }
}

export async function enrichDailySummaryReportWithSusan(
  db: Db,
  draft: DailySummaryReport,
  opts: { createdBy?: string | null, now?: Date } = {},
): Promise<DailySummaryReport> {
  const now = opts.now ?? new Date()
  const enriched = await applySusanDailyInsights(db, draft.sections, {
    createdBy: opts.createdBy,
    refreshSusanSection: async () => {
      const aiAfter = await loadAiUsageToday(db, now)
      return buildSusanUsageSection(aiAfter, draft.billing)
    },
  }).catch((err) => {
    console.warn('[daily-summary] Susan enrichment unavailable:', err instanceof Error ? err.message : err)
    return {
      sections: draft.sections,
      generated: 0,
      failed: 0,
      skippedReason: err instanceof Error ? err.message : 'Susan enrichment failed',
      lastError: err instanceof Error ? err.message : 'Susan enrichment failed',
    }
  })

  const sections = enriched.sections as DailySummarySection[]
  if (enriched.generated > 0) {
    const aiFinal = await loadAiUsageToday(db, now)
    const susanIdx = sections.findIndex(s => s.id === 'susan')
    if (susanIdx >= 0) {
      sections[susanIdx] = {
        ...buildSusanUsageSection(aiFinal, draft.billing),
        insight: sections[susanIdx]!.insight,
      }
    }
  }

  return {
    ...draft,
    sections,
    susanEnabled: enriched.generated > 0 || draft.billing.configured.openrouter,
    susanGenerated: enriched.generated,
    susanFailed: enriched.failed,
    susanSkippedReason: enriched.skippedReason,
  }
}

export async function buildDailySummaryReport(
  db: Db,
  now = new Date(),
  opts: { createdBy?: string | null } = {},
): Promise<DailySummaryReport> {
  const draft = await buildDailySummaryReportDraft(db, now)
  return enrichDailySummaryReportWithSusan(db, draft, { createdBy: opts.createdBy, now })
}

export async function refreshSusanUsageSectionInReport(
  db: Db,
  report: DailySummaryReport,
  now = new Date(),
): Promise<DailySummaryReport> {
  const aiToday = await loadAiUsageToday(db, now)
  const previous = report.sections.find(s => s.id === 'susan')
  const refreshed = buildSusanUsageSection(aiToday, report.billing)
  return {
    ...report,
    sections: report.sections.map(section => (
      section.id === 'susan'
        ? { ...refreshed, insight: previous?.insight || refreshed.insight }
        : section
    )),
  }
}

/** @deprecated Kept for older unit tests that assert action strings. */
export function buildSusanDailyActions(input: {
  invoiceStats: DailySummaryInvoiceStats
  outstandingInvoices: DailySummaryInvoiceRow[]
  billing: BillingDashboardPayload
}): string[] {
  const sections = buildSections({
    invoiceStats: input.invoiceStats,
    outstandingInvoices: input.outstandingInvoices,
    billing: input.billing,
    aiToday: { costUsd: 0, tokens: 0, calls: 0 },
    inquiries: { received: 0, resolved: 0, open: 0, items: [] },
    deletions: { pending: 0, approvedToday: 0, rejectedToday: 0, submittedToday: 0, pendingRows: [] },
    backup: {
      status: 'not_configured',
      message: 'No encrypted backups yet.',
      lastRun: null,
      scheduleEnabled: false,
      scheduleLabel: 'Nightly',
      driveConnected: false,
      driveAccountEmail: null,
    },
    disk: {
      usedBytes: 0,
      freeBytes: null,
      capacityBytes: null,
      dailyGrowthBytes: null,
      daysUntilFull: null,
      change7dPercent: null,
    },
  })
  return sections.map(s => s.insight).filter(Boolean)
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

function mergeRecipients(
  primary: StaffNotifyRecipient[],
  extra?: { id: string, name: string, email: string } | null,
): StaffNotifyRecipient[] {
  const byId = new Map<string, StaffNotifyRecipient>()
  for (const row of primary) byId.set(row.id, row)
  if (extra?.email?.trim()) {
    byId.set(extra.id, {
      id: extra.id,
      name: extra.name,
      email: extra.email.trim(),
    })
  }
  return [...byId.values()]
}

export async function deliverDailySummaryReport(
  db: Db,
  report: DailySummaryReport,
  opts: {
    force?: boolean
    delivery?: 'direct' | 'queue'
    recipientsMode?: 'actor' | 'managers'
    actor?: { id: string, name: string, email: string } | null
  } = {},
): Promise<DailySummarySendResult> {
  const delivery = opts.delivery ?? (opts.force ? 'direct' : 'queue')
  const recipientsMode = opts.recipientsMode ?? (opts.force ? 'actor' : 'managers')

  const recipients: StaffNotifyRecipient[] = recipientsMode === 'actor'
    ? (opts.actor?.email?.trim()
        ? [{
            id: opts.actor.id,
            name: opts.actor.name,
            email: opts.actor.email.trim(),
          }]
        : [])
    : mergeRecipients(await listManagersAndAdmins(db), null)

  if (recipientsMode === 'actor' && !recipients.length) {
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 'no_recipients',
      reportDate: report.reportDate,
      recipients: [],
      errors: ['Your account has no email address to receive the test summary.'],
      delivery,
      susanGenerated: report.susanGenerated,
      susanFailed: report.susanFailed,
      susanSkippedReason: report.susanSkippedReason,
    }
  }

  const emails = uniqueEmails(recipients)
  if (!emails.length) {
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 'no_recipients',
      reportDate: report.reportDate,
      recipients: [],
      errors: ['No active Admin/Manager accounts with email addresses were found.'],
      delivery,
      susanGenerated: report.susanGenerated,
      susanFailed: report.susanFailed,
      susanSkippedReason: report.susanSkippedReason,
    }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const templateOverrideRaw = await getActiveEmailTemplateContent(db, 'daily_summary_report')
  const templateOverride = templateOverrideRaw
    ? { ...templateOverrideRaw, htmlSource: '' }
    : null
  const byEmail = new Map(recipients.map(r => [r.email.trim().toLowerCase(), r]))

  let sent = 0
  let delivered = 0
  let failed = 0
  const errors: string[] = []
  if (report.susanSkippedReason) {
    errors.push(`Susan AI Assistant: ${report.susanSkippedReason}`)
  }
  else if (report.susanFailed > 0) {
    errors.push(`Susan AI Assistant: ${report.susanFailed} section note${report.susanFailed === 1 ? '' : 's'} failed`)
  }

  for (const email of emails) {
    const recipient = byEmail.get(email.toLowerCase())
    const mail = buildDailySummaryEmail({
      reportDateLabel: report.reportDateLabel,
      recipientName: recipient?.name?.split(/\s+/)[0] || undefined,
      invoiceStats: report.invoiceStats,
      outstandingInvoices: report.outstandingInvoices,
      billing: report.billing,
      sections: report.sections,
      susanEnabled: report.susanEnabled,
      susanGenerated: report.susanGenerated,
      susanSkippedReason: report.susanSkippedReason,
      appUrl,
      brand,
      templateOverride,
    })

    if (delivery === 'direct') {
      try {
        const result = await sendBrandedMail(db, {
          to: email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }, brand)
        sent += 1
        if (result.delivered) delivered += 1
        else {
          failed += 1
          errors.push(`${email}: SMTP accepted the message but reported not delivered (check SMTP config)`)
        }
      }
      catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : 'Send failed'
        errors.push(`${email}: ${message}`)
      }
    }
    else {
      await enqueueJob(db, 'email_send', {
        to: email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        notificationKind: 'daily_summary_report',
      })
      sent += 1
    }
  }

  if (delivery === 'direct' && delivered === 0 && failed > 0) {
    throw new Error(errors[0] || 'Daily summary email could not be delivered via SMTP')
  }

  if (sent > 0 && recipientsMode === 'managers') {
    await writeLastSentDate(db, report.reportDate)
  }

  return {
    sent,
    delivered,
    failed,
    skipped: null,
    reportDate: report.reportDate,
    recipients: emails,
    errors,
    delivery,
    susanGenerated: report.susanGenerated,
    susanFailed: report.susanFailed,
    susanSkippedReason: report.susanSkippedReason,
  }
}

export async function sendDailySummaryReport(
  db: Db,
  opts: {
    force?: boolean
    delivery?: 'direct' | 'queue'
    /** Manual test sends only to the current admin. Scheduled sends go to managers/admins. */
    recipientsMode?: 'actor' | 'managers'
    actor?: { id: string, name: string, email: string } | null
    /** Optional prebuilt report (progressive UI). Otherwise builds + enriches Susan notes first. */
    report?: DailySummaryReport | null
  } = {},
): Promise<DailySummarySendResult> {
  const delivery = opts.delivery ?? (opts.force ? 'direct' : 'queue')
  const emptySusan = {
    susanGenerated: 0,
    susanFailed: 0,
    susanSkippedReason: null as string | null,
  }
  const settings = await getNotificationSettings(db)
  if (!settings.dailySummaryReport && !opts.force) {
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 'disabled',
      reportDate: todayIsoDate(),
      recipients: [],
      errors: [],
      delivery,
      ...emptySusan,
    }
  }

  const report = opts.report ?? await buildDailySummaryReport(db, new Date(), {
    createdBy: opts.actor?.id ?? null,
  })

  if (!opts.force) {
    const lastSent = await readLastSentDate(db)
    if (lastSent === report.reportDate) {
      return {
        sent: 0,
        delivered: 0,
        failed: 0,
        skipped: 'already_sent_today',
        reportDate: report.reportDate,
        recipients: [],
        errors: [],
        delivery,
        susanGenerated: report.susanGenerated,
        susanFailed: report.susanFailed,
        susanSkippedReason: report.susanSkippedReason,
      }
    }
  }

  return deliverDailySummaryReport(db, report, {
    force: opts.force,
    delivery,
    recipientsMode: opts.recipientsMode,
    actor: opts.actor,
  })
}

export async function maybeSendScheduledDailySummary(
  db: Db,
  now = new Date(),
): Promise<DailySummarySendResult | null> {
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
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 'already_sent_today',
      reportDate,
      recipients: [],
      errors: [],
      delivery: 'queue',
    }
  }

  return sendDailySummaryReport(db, { delivery: 'queue', recipientsMode: 'managers' })
}

export async function maybeSendScheduledDailySummaryFromPool(
  pool: Pool,
  now = new Date(),
): Promise<DailySummarySendResult | null> {
  const db = drizzle({ client: pool }) as unknown as Db
  return maybeSendScheduledDailySummary(db, now)
}

export async function sendDailySummaryReportFromPool(
  pool: Pool,
  opts: {
    force?: boolean
    delivery?: 'direct' | 'queue'
    recipientsMode?: 'actor' | 'managers'
  } = {},
): Promise<DailySummarySendResult> {
  const db = drizzle({ client: pool }) as unknown as Db
  return sendDailySummaryReport(db, opts)
}
