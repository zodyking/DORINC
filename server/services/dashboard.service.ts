import { and, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, sum } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLogs } from '../db/schema/audit'
import { invoices, formatInvoiceNumber } from '../db/schema/invoices'
import { serviceLogs } from '../db/schema/service-logs'
import { SERVICE_LOG_REVIEW_QUEUE_STATUSES } from './service-logs.service'
import { countPendingPortalRequests } from './portal-request-review.service'
import { vehicles } from '../db/schema/vehicles'
import { customers } from '../db/schema/customers'
import { getInvoiceListStats } from './invoices.service'
import type { AccountType, PermissionKey } from '../../shared/permissions/keys'

export type DashboardView = 'billing' | 'mechanic' | 'auditor'

export interface DashboardCta {
  label: string
  href: string
}

export interface DashboardBillingKpis {
  outstandingTotal: string
  outstandingCount: number
  paidThisMonthTotal: string
  paidThisMonthDelta: string | null
  overdueTotal: string
  overdueCount: number
  avgDaysToPay: number | null
}

export interface DashboardNeedsAttentionItem {
  id: string
  invoiceNumberFormatted: string
  customerName: string
  status: string
  total: string
  sublabel: string
}

export interface DashboardActivityItem {
  id: string
  title: string
  detail: string
  hot: boolean
  createdAt: string
}

export interface DashboardReviewQueue {
  serviceLogs: number
  portalRequests: number
  aiExtractions: number
  managerApprovals: number
  total: number
}

export interface DashboardMechanicKpis {
  logsThisMonth: number
  awaitingReview: number
  fleetVehicles: number
  customerCount: number
  lastUploadLabel: string | null
}

export interface DashboardMechanicLogItem {
  id: string
  logNumberFormatted: string
  title: string
  detail: string
  hot: boolean
}

export interface DashboardAuditorKpis {
  invoiceCount: number
  sentCount: number
  paidCount: number
  outstandingTotal: string
  paidThisMonthTotal: string
}

export interface DashboardPayload {
  view: DashboardView
  greeting: string
  subtext: string
  attentionCount: number
  primaryCta: DashboardCta
  secondaryCta: DashboardCta
  billing?: {
    kpis: DashboardBillingKpis
    needsAttention: DashboardNeedsAttentionItem[]
    recentActivity: DashboardActivityItem[]
    reviewQueue: DashboardReviewQueue
  }
  mechanic?: {
    kpis: DashboardMechanicKpis
    recentLogs: DashboardMechanicLogItem[]
  }
  auditor?: {
    kpis: DashboardAuditorKpis
    recentInvoices: DashboardNeedsAttentionItem[]
    recentAudit: DashboardActivityItem[]
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function greetingForHour(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name.split(/\s+/)[0] || name
  return `Good ${part}, ${first}`
}

function formatDateLong(d = new Date()): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function resolveView(accountType: AccountType, permissions: PermissionKey[]): DashboardView {
  if (accountType === 'external_auditor') return 'auditor'
  const canReadInvoices = permissions.includes('invoices.read.all')
  if (accountType === 'mechanic' && !canReadInvoices) return 'mechanic'
  return 'billing'
}

async function avgDaysToPay(db: Db): Promise<number | null> {
  const [row] = await db.select({
    avg: sql<string>`avg(extract(epoch from (${invoices.paidAt} - ${invoices.invoiceDate}::timestamp)) / 86400)`,
  })
    .from(invoices)
    .where(and(
      eq(invoices.status, 'paid'),
      isNull(invoices.archivedAt),
      sql`${invoices.paidAt} is not null`,
    ))

  if (!row?.avg) return null
  const n = Number.parseFloat(row.avg)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

async function paidThisMonthDelta(db: Db): Promise<string | null> {
  const today = todayIsoDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const prevMonthDate = new Date(`${monthStart}T12:00:00Z`)
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1)
  const prevStart = prevMonthDate.toISOString().slice(0, 7) + '-01'
  const prevEnd = monthStart

  const base = [isNull(invoices.archivedAt), eq(invoices.status, 'paid')]

  const [current] = await db.select({ total: sum(invoices.amountPaid) })
    .from(invoices)
    .where(and(...base, sql`${invoices.paidAt} >= ${monthStart}`))

  const [previous] = await db.select({ total: sum(invoices.amountPaid) })
    .from(invoices)
    .where(and(...base, sql`${invoices.paidAt} >= ${prevStart}`, sql`${invoices.paidAt} < ${prevEnd}`))

  const cur = Number.parseFloat(current?.total ?? '0')
  const prev = Number.parseFloat(previous?.total ?? '0')
  if (!prev) return null
  const pct = ((cur - prev) / prev) * 100
  const sign = pct >= 0 ? '▲' : '▼'
  const prevMonth = prevMonthDate.toLocaleDateString('en-US', { month: 'long' })
  return `${sign} ${Math.abs(pct).toFixed(1)}% vs ${prevMonth}`
}

async function listNeedsAttention(db: Db, limit = 8): Promise<DashboardNeedsAttentionItem[]> {
  const today = todayIsoDate()
  const rows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    status: invoices.status,
    dueDate: invoices.dueDate,
    total: invoices.total,
    balanceDue: invoices.balanceDue,
    invoiceDate: invoices.invoiceDate,
    creationSource: invoices.creationSource,
    serviceLogId: invoices.serviceLogId,
    customerName: customers.displayName,
  })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(
      isNull(invoices.archivedAt),
      or(
        and(eq(invoices.status, 'sent'), lt(invoices.dueDate, today), gt(invoices.balanceDue, '0')),
        eq(invoices.status, 'draft'),
        eq(invoices.status, 'pending_manager_approval'),
      ),
    ))
    .orderBy(desc(invoices.updatedAt))
    .limit(limit)

  return rows.map((row) => {
    const overdue = row.status === 'sent' && row.dueDate && row.dueDate < today
    let sublabel = ''
    if (overdue && row.dueDate) {
      const due = new Date(`${row.dueDate}T12:00:00`)
      const days = Math.floor((Date.now() - due.getTime()) / 86400000)
      sublabel = `Due ${row.dueDate.slice(5).replace('-', ' ')} · ${days} days late`
    }
    else if (row.status === 'draft') {
      sublabel = row.creationSource === 'service_log' && row.serviceLogId
        ? 'From service log'
        : `Draft since ${row.invoiceDate}`
    }
    else if (row.status === 'pending_manager_approval') {
      sublabel = 'Awaiting manager approval'
    }

    return {
      id: row.id,
      invoiceNumberFormatted: formatInvoiceNumber(row.invoiceNumber),
      customerName: row.customerName,
      status: overdue ? 'overdue' : row.status,
      total: row.total,
      sublabel,
    }
  })
}

async function listRecentActivity(db: Db, limit = 6): Promise<DashboardActivityItem[]> {
  const rows = await db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    afterData: auditLogs.afterData,
    createdAt: auditLogs.createdAt,
  })
    .from(auditLogs)
    .where(or(
      ilike(auditLogs.action, 'invoice.%'),
      ilike(auditLogs.action, 'service_log.%'),
      ilike(auditLogs.action, 'vehicle.%'),
      ilike(auditLogs.action, 'backup.%'),
      ilike(auditLogs.action, 'pdf.%'),
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  return rows.map((row) => {
    const data = row.afterData as Record<string, unknown> | null
    const hot = row.action.includes('paid') || row.action.includes('payment')
    return {
      id: row.id,
      title: activityTitle(row.action, data),
      detail: activityDetail(row.action, data, row.createdAt),
      hot,
      createdAt: row.createdAt.toISOString(),
    }
  })
}

function activityTitle(action: string, data: Record<string, unknown> | null): string {
  if (action === 'invoice.mark_paid') {
    const num = data?.invoiceNumberFormatted ?? data?.invoiceNumber ?? 'invoice'
    const amt = data?.amountPaid ?? data?.amount ?? ''
    return `Payment received — ${num}${amt ? ` · ${amt}` : ''}`
  }
  if (action.includes('pdf')) return `PDF generated — ${data?.invoiceNumberFormatted ?? 'invoice'}`
  if (action.includes('service_log')) return `Service log uploaded`
  if (action.includes('vehicle')) return `Vehicle updated`
  if (action.includes('backup.completed')) return 'Encrypted backup completed'
  return action.replace(/\./g, ' ')
}

function activityDetail(action: string, data: Record<string, unknown> | null, at: Date): string {
  const when = at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  if (action === 'invoice.mark_paid') {
    const customer = data?.customerName ?? 'Customer'
    const method = data?.paymentMethod ?? 'payment'
    return `${when} · ${customer} · ${method}`
  }
  if (action.includes('backup')) return `${when} · manual encrypted archive`
  return when
}

async function reviewQueueCounts(db: Db): Promise<DashboardReviewQueue> {
  const [serviceLogCount] = await db.select({ value: count() })
    .from(serviceLogs)
    .where(and(isNull(serviceLogs.archivedAt), inArray(serviceLogs.status, SERVICE_LOG_REVIEW_QUEUE_STATUSES)))

  const [managerApprovalCount] = await db.select({ value: count() })
    .from(invoices)
    .where(and(isNull(invoices.archivedAt), eq(invoices.status, 'pending_manager_approval')))

  const serviceLogsN = Number(serviceLogCount?.value ?? 0)
  const portalRequestsN = await countPendingPortalRequests(db)
  const managerApprovalsN = Number(managerApprovalCount?.value ?? 0)
  return {
    serviceLogs: serviceLogsN,
    portalRequests: portalRequestsN,
    aiExtractions: 0,
    managerApprovals: managerApprovalsN,
    total: serviceLogsN + portalRequestsN + managerApprovalsN,
  }
}

async function mechanicDashboard(db: Db, userId: string): Promise<{
  kpis: DashboardMechanicKpis
  recentLogs: DashboardMechanicLogItem[]
  attentionCount: number
}> {
  const today = todayIsoDate()
  const monthStart = `${today.slice(0, 7)}-01`

  const [logsMonth] = await db.select({ value: count() })
    .from(serviceLogs)
    .where(and(eq(serviceLogs.submittedBy, userId), sql`${serviceLogs.serviceDate} >= ${monthStart}`))

  const [awaiting] = await db.select({ value: count() })
    .from(serviceLogs)
    .where(and(
      eq(serviceLogs.submittedBy, userId),
      isNull(serviceLogs.archivedAt),
      inArray(serviceLogs.status, SERVICE_LOG_REVIEW_QUEUE_STATUSES),
    ))

  const [fleet] = await db.select({ value: count() })
    .from(vehicles)
    .where(isNull(vehicles.archivedAt))

  const [custCount] = await db.select({ value: count() })
    .from(customers)
    .where(isNull(customers.archivedAt))

  const recent = await db.select({
    id: serviceLogs.id,
    logNumber: serviceLogs.logNumber,
    status: serviceLogs.status,
    complaint: serviceLogs.complaint,
    serviceDate: serviceLogs.serviceDate,
    customerName: customers.displayName,
    busNumber: vehicles.busNumber,
  })
    .from(serviceLogs)
    .innerJoin(customers, eq(serviceLogs.customerId, customers.id))
    .innerJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
    .where(eq(serviceLogs.submittedBy, userId))
    .orderBy(desc(serviceLogs.createdAt))
    .limit(5)

  const last = recent[0]
  const lastUploadLabel = last
    ? `${last.serviceDate}${last.busNumber ? ` · #${last.busNumber}` : ''}`
    : null

  const recentLogs: DashboardMechanicLogItem[] = recent.map((row) => {
    const hot = SERVICE_LOG_REVIEW_QUEUE_STATUSES.includes(row.status as typeof SERVICE_LOG_REVIEW_QUEUE_STATUSES[number])
    const title = `SL-${String(row.logNumber).padStart(4, '0')}${row.busNumber ? ` — #${row.busNumber}` : ''}${row.complaint ? ` · ${row.complaint.slice(0, 40)}` : ''}`
    return {
      id: row.id,
      logNumberFormatted: `SL-${String(row.logNumber).padStart(4, '0')}`,
      title,
      detail: `${row.serviceDate} · ${row.customerName}${hot ? ' · awaiting review' : ''}`,
      hot,
    }
  })

  return {
    kpis: {
      logsThisMonth: Number(logsMonth?.value ?? 0),
      awaitingReview: Number(awaiting?.value ?? 0),
      fleetVehicles: Number(fleet?.value ?? 0),
      customerCount: Number(custCount?.value ?? 0),
      lastUploadLabel,
    },
    recentLogs,
    attentionCount: Number(awaiting?.value ?? 0),
  }
}

async function auditorDashboard(db: Db): Promise<{
  kpis: DashboardAuditorKpis
  recentInvoices: DashboardNeedsAttentionItem[]
  recentAudit: DashboardActivityItem[]
}> {
  const stats = await getInvoiceListStats(db)
  const recentInvoices = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    status: invoices.status,
    dueDate: invoices.dueDate,
    total: invoices.total,
    balanceDue: invoices.balanceDue,
    invoiceDate: invoices.invoiceDate,
    creationSource: invoices.creationSource,
    serviceLogId: invoices.serviceLogId,
    customerName: customers.displayName,
  })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(
      isNull(invoices.archivedAt),
      inArray(invoices.status, ['sent', 'paid', 'approved']),
    ))
    .orderBy(desc(invoices.invoiceDate))
    .limit(8)

  const recentAudit = await listRecentActivity(db, 8)

  return {
    kpis: {
      invoiceCount: stats.total,
      sentCount: stats.sentCount,
      paidCount: stats.paidCount,
      outstandingTotal: stats.outstandingTotal,
      paidThisMonthTotal: stats.paidThisMonthTotal,
    },
    recentInvoices: recentInvoices.map(row => ({
      id: row.id,
      invoiceNumberFormatted: formatInvoiceNumber(row.invoiceNumber),
      customerName: row.customerName,
      status: row.status,
      total: row.total,
      sublabel: row.invoiceDate,
    })),
    recentAudit,
  }
}

export async function getDashboard(
  db: Db,
  user: { id: string, name: string, accountType: AccountType },
  permissions: PermissionKey[],
): Promise<DashboardPayload> {
  const view = resolveView(user.accountType, permissions)
  const dateLabel = formatDateLong()

  if (view === 'auditor') {
    const audit = await auditorDashboard(db)
    return {
      view,
      greeting: greetingForHour(user.name),
      subtext: `${dateLabel} · Read-only auditor access`,
      attentionCount: 0,
      primaryCta: { label: 'View invoices', href: '/invoices' },
      secondaryCta: { label: 'System logs', href: '/system-logs' },
      auditor: audit,
    }
  }

  if (view === 'mechanic') {
    const mech = await mechanicDashboard(db, user.id)
    return {
      view,
      greeting: greetingForHour(user.name),
      subtext: `${dateLabel} · ${mech.attentionCount} log${mech.attentionCount === 1 ? '' : 's'} awaiting review`,
      attentionCount: mech.attentionCount,
      primaryCta: { label: '+ New Service Log', href: '/service-logs/new' },
      secondaryCta: { label: 'My service logs', href: '/service-logs' },
      mechanic: {
        kpis: mech.kpis,
        recentLogs: mech.recentLogs,
      },
    }
  }

  const [stats, needsAttention, recentActivity, reviewQueue, avgDays, paidDelta] = await Promise.all([
    getInvoiceListStats(db),
    listNeedsAttention(db),
    listRecentActivity(db),
    reviewQueueCounts(db),
    avgDaysToPay(db),
    paidThisMonthDelta(db),
  ])

  const attentionCount = needsAttention.length + reviewQueue.total

  return {
    view: 'billing',
    greeting: greetingForHour(user.name),
    subtext: `${dateLabel} · ${attentionCount} item${attentionCount === 1 ? '' : 's'} need your attention`,
    attentionCount,
    primaryCta: { label: '+ New Invoice', href: '/invoices/new' },
    secondaryCta: {
      label: reviewQueue.total ? `Review queue · ${reviewQueue.total}` : 'Review queue',
      href: reviewQueue.managerApprovals
        ? '/invoices?status=pending_manager_approval'
        : '/service-logs?queue=review',
    },
    billing: {
      kpis: {
        outstandingTotal: stats.outstandingTotal,
        outstandingCount: stats.outstandingCount,
        paidThisMonthTotal: stats.paidThisMonthTotal,
        paidThisMonthDelta: paidDelta,
        overdueTotal: stats.overdueTotal,
        overdueCount: stats.overdueCount,
        avgDaysToPay: avgDays,
      },
      needsAttention,
      recentActivity,
      reviewQueue,
    },
  }
}
