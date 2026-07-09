import { and, count, desc, eq, gt, gte, isNull, lte, or, sql, sum } from 'drizzle-orm'
import type { Db } from '../db/client'
import { invoices, formatInvoiceNumber } from '../db/schema/invoices'
import { customers } from '../db/schema/customers'
import { serviceLogs } from '../db/schema/service-logs'
import { users } from '../db/schema/auth'

export interface ReportsDateRange {
  from: string
  to: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultRange(): ReportsDateRange {
  const to = todayIso()
  const fromDate = new Date()
  fromDate.setMonth(fromDate.getMonth() - 11)
  fromDate.setDate(1)
  return { from: fromDate.toISOString().slice(0, 10), to }
}

export interface RevenueReportRow {
  period: string
  invoicedTotal: string
  collectedTotal: string
  invoiceCount: number
}

export interface RevenueReport {
  range: ReportsDateRange
  summary: {
    invoicedTotal: string
    collectedTotal: string
    outstandingTotal: string
    invoiceCount: number
    paidCount: number
  }
  monthly: RevenueReportRow[]
}

export async function getRevenueReport(db: Db, range?: Partial<ReportsDateRange>): Promise<RevenueReport> {
  const resolved = { ...defaultRange(), ...range }
  const base = and(
    isNull(invoices.archivedAt),
    gte(invoices.invoiceDate, resolved.from),
    lte(invoices.invoiceDate, resolved.to),
    or(
      eq(invoices.status, 'sent'),
      eq(invoices.status, 'paid'),
      eq(invoices.status, 'approved'),
    ),
  )

  const [summaryRow] = await db.select({
    invoicedTotal: sum(invoices.total),
    collectedTotal: sum(invoices.amountPaid),
    outstandingTotal: sum(invoices.balanceDue),
    invoiceCount: count(),
  }).from(invoices).where(base)

  const [paidCountRow] = await db.select({ value: count() })
    .from(invoices)
    .where(and(base, eq(invoices.status, 'paid')))

  const monthlyRows = await db.select({
    period: sql<string>`to_char(${invoices.invoiceDate}::date, 'YYYY-MM')`,
    invoicedTotal: sum(invoices.total),
    collectedTotal: sum(invoices.amountPaid),
    invoiceCount: count(),
  })
    .from(invoices)
    .where(base)
    .groupBy(sql`to_char(${invoices.invoiceDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.invoiceDate}::date, 'YYYY-MM')`)

  return {
    range: resolved,
    summary: {
      invoicedTotal: summaryRow?.invoicedTotal ?? '0',
      collectedTotal: summaryRow?.collectedTotal ?? '0',
      outstandingTotal: summaryRow?.outstandingTotal ?? '0',
      invoiceCount: Number(summaryRow?.invoiceCount ?? 0),
      paidCount: Number(paidCountRow?.value ?? 0),
    },
    monthly: monthlyRows.map(row => ({
      period: row.period,
      invoicedTotal: row.invoicedTotal ?? '0',
      collectedTotal: row.collectedTotal ?? '0',
      invoiceCount: Number(row.invoiceCount ?? 0),
    })),
  }
}

export interface AgingBucket {
  key: string
  label: string
  total: string
  count: number
  invoices: Array<{
    id: string
    invoiceNumberFormatted: string
    customerName: string
    dueDate: string | null
    daysPastDue: number
    balanceDue: string
    status: string
  }>
}

export interface AgingReport {
  asOf: string
  buckets: AgingBucket[]
  grandTotal: string
  grandCount: number
}

function agingBucketKey(daysPastDue: number): { key: string, label: string } {
  if (daysPastDue <= 0) return { key: 'current', label: 'Current' }
  if (daysPastDue <= 30) return { key: '1_30', label: '1–30 days' }
  if (daysPastDue <= 60) return { key: '31_60', label: '31–60 days' }
  if (daysPastDue <= 90) return { key: '61_90', label: '61–90 days' }
  return { key: '90_plus', label: '90+ days' }
}

export async function getAgingReport(db: Db): Promise<AgingReport> {
  const today = todayIso()
  const rows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    status: invoices.status,
    dueDate: invoices.dueDate,
    balanceDue: invoices.balanceDue,
    customerName: customers.displayName,
  })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(
      isNull(invoices.archivedAt),
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'approved')),
      gt(invoices.balanceDue, '0'),
    ))
    .orderBy(desc(invoices.dueDate))

  const bucketDefs: Array<{ key: string, label: string }> = [
    { key: 'current', label: 'Current' },
    { key: '1_30', label: '1–30 days' },
    { key: '31_60', label: '31–60 days' },
    { key: '61_90', label: '61–90 days' },
    { key: '90_plus', label: '90+ days' },
  ]

  const bucketMap = new Map<string, AgingBucket>()
  for (const def of bucketDefs) {
    bucketMap.set(def.key, { ...def, total: '0', count: 0, invoices: [] })
  }

  let grandTotal = 0
  for (const row of rows) {
    const due = row.dueDate ?? today
    const daysPastDue = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000)
    const { key } = agingBucketKey(daysPastDue)
    const bucket = bucketMap.get(key)!
    bucket.invoices.push({
      id: row.id,
      invoiceNumberFormatted: formatInvoiceNumber(row.invoiceNumber),
      customerName: row.customerName,
      dueDate: row.dueDate,
      daysPastDue: Math.max(0, daysPastDue),
      balanceDue: row.balanceDue,
      status: row.status,
    })
    bucket.count += 1
    grandTotal += Number.parseFloat(row.balanceDue)
    bucket.total = (Number.parseFloat(bucket.total) + Number.parseFloat(row.balanceDue)).toFixed(2)
  }

  const buckets = bucketDefs.map(def => bucketMap.get(def.key)!)

  return {
    asOf: today,
    buckets,
    grandTotal: grandTotal.toFixed(2),
    grandCount: rows.length,
  }
}

export interface MechanicProductivityRow {
  mechanicId: string
  mechanicName: string
  logsSubmitted: number
  logsConverted: number
  logsAwaitingReview: number
  conversionRate: number | null
}

export interface MechanicProductivityReport {
  range: ReportsDateRange
  mechanics: MechanicProductivityRow[]
  totals: {
    logsSubmitted: number
    logsConverted: number
    logsAwaitingReview: number
  }
}

const REVIEW_STATUSES = ['ready_for_review', 'in_review', 'needs_info'] as const

export async function getMechanicProductivityReport(
  db: Db,
  range?: Partial<ReportsDateRange>,
): Promise<MechanicProductivityReport> {
  const resolved = { ...defaultRange(), ...range }
  const base = and(
    isNull(serviceLogs.archivedAt),
    gte(serviceLogs.serviceDate, resolved.from),
    lte(serviceLogs.serviceDate, resolved.to),
  )

  const rows = await db.select({
    mechanicId: serviceLogs.submittedBy,
    mechanicName: users.name,
    status: serviceLogs.status,
    value: count(),
  })
    .from(serviceLogs)
    .innerJoin(users, eq(users.id, serviceLogs.submittedBy))
    .where(base)
    .groupBy(serviceLogs.submittedBy, users.name, serviceLogs.status)

  const byMechanic = new Map<string, MechanicProductivityRow>()

  for (const row of rows) {
    let entry = byMechanic.get(row.mechanicId)
    if (!entry) {
      entry = {
        mechanicId: row.mechanicId,
        mechanicName: row.mechanicName,
        logsSubmitted: 0,
        logsConverted: 0,
        logsAwaitingReview: 0,
        conversionRate: null,
      }
      byMechanic.set(row.mechanicId, entry)
    }
    const n = Number(row.value ?? 0)
    entry.logsSubmitted += n
    if (row.status === 'converted_to_invoice') entry.logsConverted += n
    if ((REVIEW_STATUSES as readonly string[]).includes(row.status)) entry.logsAwaitingReview += n
  }

  const mechanics = [...byMechanic.values()]
    .map(m => ({
      ...m,
      conversionRate: m.logsSubmitted > 0
        ? Math.round((m.logsConverted / m.logsSubmitted) * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.logsSubmitted - a.logsSubmitted)

  return {
    range: resolved,
    mechanics,
    totals: {
      logsSubmitted: mechanics.reduce((s, m) => s + m.logsSubmitted, 0),
      logsConverted: mechanics.reduce((s, m) => s + m.logsConverted, 0),
      logsAwaitingReview: mechanics.reduce((s, m) => s + m.logsAwaitingReview, 0),
    },
  }
}
