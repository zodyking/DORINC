import { and, asc, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
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

function moneyLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'n/a'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
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
  let invoiceInsight = 'Receivables look clear today. No customer balances need follow up.'
  if (invoiceStats.overdueCount > 0) {
    invoiceInsight = `${invoiceStats.overdueCount} overdue invoice${invoiceStats.overdueCount === 1 ? '' : 's'} totaling ${moneyLabel(invoiceStats.overdueTotal)}. Follow up or mark paid before end of day.`
  }
  else if (invoiceStats.outstandingCount > 0) {
    invoiceInsight = `${invoiceStats.outstandingCount} open invoice${invoiceStats.outstandingCount === 1 ? '' : 's'} still carry a balance of ${moneyLabel(invoiceStats.outstandingTotal)}. A quick reconciliation keeps cash flow tidy.`
  }
  if (invoiceStats.pendingManagerApprovalCount > 0) {
    invoiceInsight += ` Also, ${invoiceStats.pendingManagerApprovalCount} await manager approval.`
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
  const susanConfigured = billing.configured.openrouter
  let aiInsight = susanConfigured
    ? 'Quiet day for AI usage so far.'
    : `${AI_ASSISTANT_NAME} is not connected for billing yet. Enable OpenRouter when you want usage tracked.`
  if (susanConfigured && aiToday.calls > 0) {
    aiInsight = `${AI_ASSISTANT_NAME} handled ${aiToday.calls} call${aiToday.calls === 1 ? '' : 's'} today using ${formatTokens(aiToday.tokens)} tokens (${moneyLabel(aiToday.costUsd)}).`
    const remaining = billing.openrouter.remainingCredits ?? billing.openrouter.limitRemaining
    if (remaining != null && remaining < 5) {
      aiInsight += ` Credit is low at ${moneyLabel(remaining)}. Top up soon so help stays available.`
    }
  }
  else if (susanConfigured) {
    const monthly = resolveOpenRouterMonthlySpend(
      billing.openrouter.usageMonthly,
      billing.openrouter.internalMonthlyUsd,
    )
    if (monthly != null && monthly > 0) {
      aiInsight = `No usage yet today. Month to date sits at ${moneyLabel(monthly)}.`
    }
  }

  sections.push({
    id: 'susan',
    title: `${AI_ASSISTANT_NAME} usage today`,
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
  })

  // 3. Customer inquiries
  let inquiryInsight = 'No customer emails arrived today.'
  if (inquiries.received > 0) {
    inquiryInsight = `${inquiries.received} customer email${inquiries.received === 1 ? '' : 's'} came in. ${inquiries.resolved} resolved, ${inquiries.open} still open.`
    if (inquiries.open > 0) {
      inquiryInsight += ' Assign a reply so nothing sits overnight.'
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
  let deletionInsight = 'Deletion queue is clear.'
  if (deletions.pending > 0) {
    deletionInsight = `${deletions.pending} deletion request${deletions.pending === 1 ? '' : 's'} waiting for review.`
  }
  else if (deletions.approvedToday || deletions.rejectedToday) {
    deletionInsight = `Reviewed ${deletions.approvedToday + deletions.rejectedToday} request${deletions.approvedToday + deletions.rejectedToday === 1 ? '' : 's'} today (${deletions.approvedToday} approved, ${deletions.rejectedToday} denied).`
  }
  else if (deletions.submittedToday > 0) {
    deletionInsight = `${deletions.submittedToday} new request${deletions.submittedToday === 1 ? '' : 's'} submitted today and already cleared.`
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
  let backupInsight = 'Backups are not set up yet. Enable a nightly schedule or run a manual backup.'
  if (backup.status === 'healthy') {
    backupInsight = `Backups look healthy. Last successful run was ${formatWhen(backup.lastRun?.finishedAt ?? backup.lastRun?.createdAt)}.`
    if (backup.driveConnected) backupInsight += ' Offsite Google Drive copy is connected.'
  }
  else if (backup.status === 'error') {
    backupInsight = `Last backup failed. ${backup.message.replace(/—/g, '.').replace(/\s+/g, ' ').trim()}`
  }
  else if (backupSetup) {
    backupInsight = backup.message.replace(/—/g, '.').replace(/\s+/g, ' ').trim()
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
  let diskInsight = `Database is using ${formatBytes(disk.usedBytes)}.`
  if (disk.dailyGrowthBytes != null) {
    diskInsight += ` Growth averages about ${formatBytes(disk.dailyGrowthBytes)} per day.`
  }
  if (disk.freeBytes != null && disk.daysUntilFull != null) {
    diskInsight += ` At that pace, roughly ${disk.daysUntilFull} day${disk.daysUntilFull === 1 ? '' : 's'} until the volume is full.`
  }
  else if (disk.daysUntilFull != null && disk.freeBytes == null) {
    diskInsight += ` At that pace, the database would double in about ${disk.daysUntilFull} day${disk.daysUntilFull === 1 ? '' : 's'}.`
  }
  else if (disk.dailyGrowthBytes == null) {
    diskInsight += ' Not enough history yet to project fill date.'
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

    let billingInsight = `Year outlook sits near ${moneyLabel(billing.totals.estimatedYearlyUsd)} across enabled providers.`
    if (billing.configured.vultr && billing.vultr.accountBalance != null && billing.vultr.accountBalance < 0) {
      billingInsight = `Vultr balance is ${moneyLabel(billing.vultr.accountBalance)}. Pay hosting so servers stay online.`
    }
    else if (billing.configured.cloudflare) {
      const dueSoon = billing.cloudflare.domains.filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30)
      if (dueSoon.length) {
        const cost = dueSoon.reduce((sum, d) => sum + (d.renewalCost || 0), 0)
        billingInsight = `${dueSoon.length} domain renewal${dueSoon.length === 1 ? '' : 's'} due within 30 days (${moneyLabel(cost)}). Confirm auto renew or pay manually.`
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

export async function buildDailySummaryReport(db: Db, now = new Date()): Promise<DailySummaryReport> {
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

export async function sendDailySummaryReport(
  db: Db,
  opts: {
    force?: boolean
    delivery?: 'direct' | 'queue'
    /** Manual test sends only to the current admin. Scheduled sends go to managers/admins. */
    recipientsMode?: 'actor' | 'managers'
    actor?: { id: string, name: string, email: string } | null
  } = {},
): Promise<DailySummarySendResult> {
  const delivery = opts.delivery ?? (opts.force ? 'direct' : 'queue')
  const recipientsMode = opts.recipientsMode ?? (opts.force ? 'actor' : 'managers')
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
    }
  }

  const report = await buildDailySummaryReport(db)
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
      }
    }
  }

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
    }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const templateOverride = await getActiveEmailTemplateContent(db, 'daily_summary_report')
  const byEmail = new Map(recipients.map(r => [r.email.trim().toLowerCase(), r]))

  let sent = 0
  let delivered = 0
  let failed = 0
  const errors: string[] = []

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
  }
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
