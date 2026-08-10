import { and, asc, count, desc, eq, gte, inArray, ne } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { useDb, usePool, type Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { entityDeletionRequests, type DeletionEntityType } from '../db/schema/deletion-requests'
import { workerJobs } from '../db/schema/jobs'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { serviceLogs } from '../db/schema/service-logs'
import { customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'
import { conversations } from '../db/schema/messages'
import {
  AI_ADMINISTRATOR_DISPLAY_NAME,
  AI_ASSISTANT_NAME,
  SUSAN_SYSTEM_EMAIL,
} from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import { signatureAccountTypeLabel } from '../../shared/format/account-type-label'
import { parseOpenRouterJson, openRouterChat } from './ai-openrouter.service'
import {
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
  clampAiAdminReviewWaitMinutes,
  DEFAULT_AI_ADMIN_REVIEW_WAIT_MINUTES,
  getAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
} from './ai-provider.service'
import { logAiUsage } from './ai-jobs.service'
import { enqueueJob } from './jobs.service'
import {
  approveDeletionRequest,
  DeletionRequestsServiceError,
  rejectDeletionRequest,
} from './deletion-requests.service'
import { hashPassword } from '../auth/password'
import { writeAudit } from './audit.service'

export const DELETION_REASON_WEAK_MESSAGE
  = 'Explain why this record should be deleted — a short phrase like "test system" is not enough'

export { SUSAN_SYSTEM_EMAIL }

/** @deprecated Use configured `aiAdministratorReviewWaitMinutes` (default 5). */
export const AI_ADMIN_REVIEW_DELAY_MS = DEFAULT_AI_ADMIN_REVIEW_WAIT_MINUTES * 60_000

/** How far back Susan loads prior requests as review context (not an auto-reject window). */
export const SIMILAR_DELETION_REQUEST_LOOKBACK_MS = 60 * 60 * 1000

/** Earliest time Susan may review a request opened at `createdAt`. */
export function aiAdminReviewRunAfter(
  createdAt: Date | string | number,
  waitMinutes: number,
  now: Date = new Date(),
): Date {
  const opened = new Date(createdAt)
  const waitMs = clampAiAdminReviewWaitMinutes(waitMinutes) * 60_000
  const target = new Date(opened.getTime() + waitMs)
  return target.getTime() > now.getTime() ? target : now
}

export async function getAiAdministratorReviewWaitMinutes(db: Db): Promise<number> {
  const settings = await getAiProviderSettings(db)
  return clampAiAdminReviewWaitMinutes(settings.aiAdministratorReviewWaitMinutes)
}

export class AiAdministratorServiceError extends Error {
  constructor(
    public code: 'NOT_CONFIGURED' | 'FEATURE_DISABLED' | 'WEAK_REASON' | 'REVIEW_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'AiAdministratorServiceError'
  }
}

export async function isAiAdministratorEnabled(db: Db): Promise<boolean> {
  const settings = await getAiProviderSettings(db)
  return settings.enabled && settings.aiAdministratorEnabled && settings.hasApiKey
}

/** Normalize deletion reasons for similarity checks. */
export function normalizeDeletionReasonForCompare(reason: string): string {
  return String(reason || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when two deletion reasons are the same or near-duplicates. */
export function deletionReasonsLookSimilar(a: string, b: string): boolean {
  const na = normalizeDeletionReasonForCompare(a)
  const nb = normalizeDeletionReasonForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 12 && nb.length >= 12 && (na.includes(nb) || nb.includes(na))) return true

  const stop = new Set([
    'the', 'and', 'for', 'this', 'that', 'with', 'from', 'into', 'a', 'an', 'of', 'to', 'in', 'on',
    'please', 'pls', 'just', 'record', 'delete', 'deleted', 'deletion', 'remove', 'removed',
  ])
  const tokens = (value: string) => new Set(
    value.split(' ').filter(w => w.length > 2 && !stop.has(w)),
  )
  const ta = tokens(na)
  const tb = tokens(nb)
  if (ta.size === 0 || tb.size === 0) return false
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter += 1
  const union = ta.size + tb.size - inter
  return union > 0 && inter / union >= 0.72
}

/** Cheap local filter before spending tokens. */
export function looksLikeWeakDeletionReason(reason: string): boolean {
  const text = reason.trim().toLowerCase()
  if (text.length < 12) return true

  const compact = text.replace(/\s+/g, '')
  if (compact.length < 10) return true

  // Keyboard spam / filler
  if (/^(.)\1{7,}$/.test(compact)) return true
  if (/^(..)\1{4,}$/.test(compact)) return true
  if (/^(asdf+|qwer+|zxcv+|test+|abc+|xxx+|yyy+|zzz+|1234+|0000+)/.test(compact)) return true

  const words = text.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length <= 2 && text.length < 36) return true

  const filler = new Set([
    'test', 'testing', 'tests', 'tested', 'asdf', 'qwer', 'delete', 'deleted', 'deletion',
    'remove', 'removed', 'please', 'pls', 'thanks', 'thank', 'you', 'need', 'want', 'just',
    'because', 'reason', 'blah', 'stuff', 'thing', 'things', 'idk', 'whatever', 'none',
    'n/a', 'na', 'system', 'systems', 'app', 'application', 'feature', 'features', 'software',
    'platform', 'portal', 'site', 'check', 'checking', 'try', 'trying', 'demo', 'sample',
  ])
  const meaningful = words.filter(w => !filler.has(w) && w.length > 2)
  if (meaningful.length === 0) return true
  if (words.length >= 2 && meaningful.length <= 1 && text.length < 48) return true

  // "test system" / "testing the app" without explaining the purpose.
  const mentionsTesting = /\b(test|tests|testing|tested|demo|sample)\b/.test(text)
  if (mentionsTesting) {
    const explainsPurpose = /\b(ensur(e|ed|ing)|verif(y|ied|ying)|confirm(ed|ing)?|because|so that|in order|mistake|mistaken|accident|accidental|wrong|duplicate|training|practice|sandbox|cleanup|clean up|created by|should not|shouldn'?t|no longer|obsolete|invalid)\b/.test(text)
    if (!explainsPurpose && text.length < 80) return true
  }

  return false
}

async function prepareAdministratorClient(db: Db): Promise<{
  apiKey: string
  model: string
} | null> {
  const settings = await getAiProviderSettings(db)
  if (!settings.enabled || !settings.aiAdministratorEnabled || !settings.hasApiKey) {
    return null
  }
  try {
    await assertSpendCapAllowsRequest(db)
  }
  catch (err) {
    if (err instanceof AiSpendCapExceededError) return null
    throw err
  }
  const apiKey = await getDecryptedApiKey(db)
  if (!apiKey) return null
  const model = modelForFeature(settings, 'ai_administrator')
  if (!model?.trim()) return null
  return { apiKey, model }
}

type SubmitterContext = {
  id: string
  name: string | null
  accountTypeKey: string
  accountTypeLabel: string
}

async function loadSubmitterContext(db: Db, submitterId: string): Promise<SubmitterContext | null> {
  const [row] = await db.select({
    id: users.id,
    name: users.name,
    accountTypeKey: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, submitterId))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    accountTypeKey: row.accountTypeKey,
    accountTypeLabel: signatureAccountTypeLabel(row.accountTypeKey),
  }
}

type PriorDeletionRequest = {
  id: string
  entityType: DeletionEntityType
  entityId: string
  entityLabel: string
  status: string
  reason: string
  createdAt: Date
}

async function loadSubmitterDeletionHistory(
  db: Db,
  submitterId: string,
  opts: { excludeRequestId?: string | null } = {},
): Promise<PriorDeletionRequest[]> {
  const since = new Date(Date.now() - SIMILAR_DELETION_REQUEST_LOOKBACK_MS)
  const conditions = [
    eq(entityDeletionRequests.submittedBy, submitterId),
    gte(entityDeletionRequests.createdAt, since),
  ]
  if (opts.excludeRequestId) {
    conditions.push(ne(entityDeletionRequests.id, opts.excludeRequestId))
  }

  const rows = await db.select({
    id: entityDeletionRequests.id,
    entityType: entityDeletionRequests.entityType,
    entityId: entityDeletionRequests.entityId,
    entityLabel: entityDeletionRequests.entityLabel,
    status: entityDeletionRequests.status,
    reason: entityDeletionRequests.reason,
    createdAt: entityDeletionRequests.createdAt,
  })
    .from(entityDeletionRequests)
    .where(and(...conditions))
    .orderBy(desc(entityDeletionRequests.createdAt))
    .limit(25)

  return rows.map(row => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
  }))
}

/** Deterministic repeat/similar match from the same submitter (context only — not an auto-reject). */
export function findSimilarDeletionRequest(
  current: {
    entityType: DeletionEntityType
    entityId: string
    reason: string
  },
  history: Array<{
    id: string
    entityType: DeletionEntityType
    entityId: string
    entityLabel: string
    status: string
    reason: string
  }>,
): { id: string, entityLabel: string, status: string, reason: string, kind: 'same_record' | 'similar_reason' } | null {
  for (const prior of history) {
    if (prior.entityType === current.entityType && prior.entityId === current.entityId) {
      return {
        id: prior.id,
        entityLabel: prior.entityLabel,
        status: prior.status,
        reason: prior.reason,
        kind: 'same_record',
      }
    }
  }
  for (const prior of history) {
    if (prior.entityType !== current.entityType) continue
    if (deletionReasonsLookSimilar(current.reason, prior.reason)) {
      return {
        id: prior.id,
        entityLabel: prior.entityLabel,
        status: prior.status,
        reason: prior.reason,
        kind: 'similar_reason',
      }
    }
  }
  return null
}

/**
 * Hard declines based on record state — not on whether the user asked before.
 * Sent / paid / billing-linked records must not be auto-deleted.
 */
export function hardDeclineDeletionContext(ctx: Record<string, unknown> | null | undefined): string | null {
  if (!ctx || ctx.missing === true) return null
  if (ctx.paid === true) {
    return 'Rejected — this record has payment activity and should not be deleted.'
  }
  if (ctx.sentToCustomer === true) {
    return 'Rejected — this invoice was already sent to the customer. Edit or void it instead of deleting.'
  }
  if (ctx.linkedToInvoice === true) {
    return 'Rejected — this service log is linked to an invoice/billing record and should not be deleted.'
  }
  return null
}

/**
 * Gate vague / filler deletion reasons when AI Administrator is enabled.
 * Local heuristic catches obvious filler; Susan confirms borderline cases.
 * If AI is off/unavailable after the heuristic passes, submit proceeds.
 */
export async function assertDeletionReasonAcceptable(
  db: Db,
  reason: string,
  context: {
    entityType: DeletionEntityType
    entityLabel?: string | null
    submitterId?: string | null
    accountTypeKey?: string | null
  },
): Promise<void> {
  if (!(await isAiAdministratorEnabled(db))) return

  const trimmed = reason.trim()
  if (looksLikeWeakDeletionReason(trimmed)) {
    throw new AiAdministratorServiceError('WEAK_REASON', DELETION_REASON_WEAK_MESSAGE)
  }

  const submitter = context.submitterId
    ? await loadSubmitterContext(db, context.submitterId)
    : null
  const accountTypeKey = submitter?.accountTypeKey || context.accountTypeKey || null
  const accountTypeLabel = submitter
    ? submitter.accountTypeLabel
    : (accountTypeKey ? signatureAccountTypeLabel(accountTypeKey) : null)

  const client = await prepareAdministratorClient(db)
  if (!client) return

  const system = [
    `You are ${AI_ASSISTANT_NAME}, AI Administrator for ${BRAND_NAME}.`,
    'Decide if a staff deletion-request reason shows a real understanding of why the record should be deleted.',
    'Reject keyboard spam, nonsense, jokes, and vague filler such as "delete please", "test test test", or "test system".',
    'Require the why: what went wrong / why it exists / what cleanup goal is — not just that they were testing.',
    'Accept clear reasons even when concise (duplicate draft, wrong customer, created by mistake, training leftover that should be removed, etc.).',
    'Weigh the submitter account type with the reason (e.g. mechanic training mistakes vs admin cleanup vs accountant billing records).',
    'Return JSON only: { "ok": boolean, "reason": "short note" }.',
  ].join(' ')

  const user = [
    `Entity type: ${context.entityType}`,
    context.entityLabel ? `Entity: ${context.entityLabel}` : null,
    accountTypeKey ? `Submitter account type: ${accountTypeLabel} (${accountTypeKey})` : null,
    `Submitted reason: ${trimmed}`,
  ].filter(Boolean).join('\n')

  try {
    const result = await openRouterChat(client.apiKey, client.model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 'ai_administrator', { responseFormat: 'json', temperature: 0.1, maxTokens: 200 })

    await logAiUsage(db, {
      featureType: 'ai_administrator',
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    })

    const parsed = parseOpenRouterJson(result.content) as { ok?: unknown }
    if (parsed.ok === false) {
      throw new AiAdministratorServiceError('WEAK_REASON', DELETION_REASON_WEAK_MESSAGE)
    }
  }
  catch (err) {
    if (err instanceof AiAdministratorServiceError) throw err
    // AI outage: heuristic already passed — allow submit.
    console.warn('[ai-administrator] reason gate AI failed:', (err as Error).message)
  }
}

export async function ensureSusanSystemUser(db: Db): Promise<string> {
  const [existing] = await db.select({
    id: users.id,
    name: users.name,
    silentDeveloperMode: users.silentDeveloperMode,
  })
    .from(users)
    .where(eq(users.email, SUSAN_SYSTEM_EMAIL))
    .limit(1)
  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {}
    if (existing.silentDeveloperMode) patch.silentDeveloperMode = false
    if (existing.name !== AI_ADMINISTRATOR_DISPLAY_NAME) patch.name = AI_ADMINISTRATOR_DISPLAY_NAME
    if (Object.keys(patch).length) {
      await db.update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
    }
    return existing.id
  }

  const [adminType] = await db.select({ id: accountTypes.id })
    .from(accountTypes)
    .where(eq(accountTypes.key, 'admin'))
    .limit(1)
  if (!adminType) {
    throw new AiAdministratorServiceError('NOT_CONFIGURED', 'Admin account type missing for Susan system user')
  }

  const passwordHash = await hashPassword(`susan-system-${randomUUID()}`)
  try {
    const [created] = await db.insert(users).values({
      name: AI_ADMINISTRATOR_DISPLAY_NAME,
      email: SUSAN_SYSTEM_EMAIL,
      passwordHash,
      accountTypeId: adminType.id,
      isActive: false,
      disabledAt: new Date(),
      disabledReason: 'System account for Susan AI Administrator',
      approvedAt: new Date(),
      emailVerifiedAt: new Date(),
      teamChatEnabled: false,
      messageEmailNotify: false,
      // Must stay false — silent mode would suppress workflow side-effects in some paths.
      silentDeveloperMode: false,
    }).returning({ id: users.id })
    return created!.id
  }
  catch {
    const [again] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, SUSAN_SYSTEM_EMAIL))
      .limit(1)
    if (again) return again.id
    throw new AiAdministratorServiceError('NOT_CONFIGURED', 'Could not create Susan system user')
  }
}

async function loadEntityContext(db: Db, entityType: DeletionEntityType, entityId: string) {
  switch (entityType) {
    case 'invoice': {
      const [row] = await db.select({
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        sentAt: invoices.sentAt,
        paidAt: invoices.paidAt,
        customerName: customers.displayName,
        serviceLogId: invoices.serviceLogId,
      }).from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(eq(invoices.id, entityId))
        .limit(1)
      if (!row) return { missing: true }
      return {
        kind: 'invoice',
        label: formatInvoiceNumber(row.invoiceNumber),
        status: row.status,
        total: row.total,
        amountPaid: row.amountPaid,
        sentToCustomer: Boolean(row.sentAt) || ['sent', 'paid'].includes(row.status),
        paid: row.status === 'paid' || Number(row.amountPaid || 0) > 0,
        customerName: row.customerName,
        linkedServiceLog: Boolean(row.serviceLogId),
        canEditInstead: ['draft', 'pending_manager_approval', 'sent'].includes(row.status),
      }
    }
    case 'service_log': {
      const [row] = await db.select({
        logNumber: serviceLogs.logNumber,
        status: serviceLogs.status,
        invoiceId: serviceLogs.invoiceId,
        customerName: customers.displayName,
      }).from(serviceLogs)
        .leftJoin(customers, eq(serviceLogs.customerId, customers.id))
        .where(eq(serviceLogs.id, entityId))
        .limit(1)
      if (!row) return { missing: true }
      return {
        kind: 'service_log',
        label: `SL-${String(row.logNumber).padStart(4, '0')}`,
        status: row.status,
        linkedToInvoice: Boolean(row.invoiceId),
        customerName: row.customerName,
        canEditInstead: !row.invoiceId,
      }
    }
    case 'customer': {
      const [row] = await db.select({
        displayName: customers.displayName,
      }).from(customers).where(eq(customers.id, entityId)).limit(1)
      if (!row) return { missing: true }
      const [vehicleCountRow] = await db.select({ value: count() })
        .from(vehicles)
        .where(eq(vehicles.customerId, entityId))
      const [invoiceCountRow] = await db.select({ value: count() })
        .from(invoices)
        .where(eq(invoices.customerId, entityId))
      const vehicleCount = Number(vehicleCountRow?.value ?? 0)
      const invoiceCount = Number(invoiceCountRow?.value ?? 0)
      return {
        kind: 'customer',
        label: row.displayName,
        vehicleCount,
        invoiceCount,
        inUse: vehicleCount > 0 || invoiceCount > 0,
        canEditInstead: true,
      }
    }
    case 'vehicle': {
      const [row] = await db.select({
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
        make: vehicles.make,
        model: vehicles.model,
        customerName: customers.displayName,
      }).from(vehicles)
        .leftJoin(customers, eq(vehicles.customerId, customers.id))
        .where(eq(vehicles.id, entityId))
        .limit(1)
      if (!row) return { missing: true }
      const [logCountRow] = await db.select({ value: count() })
        .from(serviceLogs)
        .where(eq(serviceLogs.vehicleId, entityId))
      const serviceLogCount = Number(logCountRow?.value ?? 0)
      const tag = row.busNumber || row.unitTag || 'Vehicle'
      return {
        kind: 'vehicle',
        label: [tag, [row.make, row.model].filter(Boolean).join(' ')].filter(Boolean).join(' — '),
        customerName: row.customerName,
        serviceLogCount,
        inUse: serviceLogCount > 0,
        canEditInstead: true,
      }
    }
    case 'conversation': {
      const [row] = await db.select({
        type: conversations.type,
        title: conversations.title,
        isSystem: conversations.isSystem,
      }).from(conversations).where(eq(conversations.id, entityId)).limit(1)
      if (!row) return { missing: true }
      return {
        kind: 'conversation',
        label: row.title || `${row.type} conversation`,
        type: row.type,
        isSystem: row.isSystem,
        canEditInstead: false,
      }
    }
  }
}

/** Retryable soft-skips must not be marked done (they left the request pending). */
export function isRetryableSusanSkip(
  decision: 'approve' | 'reject' | 'skipped',
  note: string | null | undefined,
): boolean {
  if (decision !== 'skipped') return false
  const n = String(note || '').toLowerCase()
  if (n.includes('already decided') || n.includes('not found')) return false
  return true
}

async function logSusanDeletionAudit(input: {
  action: string
  entityType: string
  entityId?: string | null
  afterData?: Record<string, unknown>
  susanId?: string
}): Promise<void> {
  try {
    const susanId = input.susanId || await ensureSusanSystemUser(useDb())
    await writeAudit(null, {
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      afterData: {
        via: 'ai_administrator',
        ...(input.afterData || {}),
      },
      actor: {
        id: susanId,
        name: AI_ADMINISTRATOR_DISPLAY_NAME,
        email: SUSAN_SYSTEM_EMAIL,
        accountType: 'admin',
      },
      permissionKey: 'deletion_requests.review.all',
      riskLevel: 'sensitive',
    })
  }
  catch (err) {
    console.warn('[ai-administrator] system log write failed:', (err as Error).message)
  }
}

export async function enqueueDeletionRequestAiReview(
  db: Db,
  requestId: string,
  opts: { runAfter?: Date } = {},
) {
  if (!(await isAiAdministratorEnabled(db))) {
    console.info('[ai-administrator] skip enqueue — feature disabled or AI not configured', requestId)
    await logSusanDeletionAudit({
      action: 'deletion_requests.ai_review.trigger_skipped',
      entityType: 'deletion_request',
      entityId: requestId,
      afterData: { requestId, reason: 'AI Administrator disabled or not configured' },
    })
    return null
  }
  let runAfter = opts.runAfter
  let waitMinutes: number | null = null
  if (!runAfter) {
    waitMinutes = await getAiAdministratorReviewWaitMinutes(db)
    const [request] = await db.select({ createdAt: entityDeletionRequests.createdAt })
      .from(entityDeletionRequests)
      .where(eq(entityDeletionRequests.id, requestId))
      .limit(1)
    runAfter = aiAdminReviewRunAfter(request?.createdAt ?? new Date(), waitMinutes)
  }
  const job = await enqueueJob(db, 'deletion_request_ai_review', { requestId }, 3, { runAfter })
  console.info(
    '[ai-administrator] enqueued deletion review',
    requestId,
    'runAfter=',
    runAfter.toISOString(),
    'waitMinutes=',
    waitMinutes,
    'job=',
    job.id,
  )
  await logSusanDeletionAudit({
    action: 'deletion_requests.ai_review.trigger',
    entityType: 'deletion_request',
    entityId: requestId,
    afterData: {
      requestId,
      jobId: job.id,
      runAfter: runAfter.toISOString(),
      waitMinutes,
    },
  })
  return job
}

/** Pure helper — pending ids (oldest first) that lack a blocking review job. */
export function pendingDeletionIdsNeedingReview(
  pendingIdsOldestFirst: string[],
  blockedJobRequestIds: Iterable<string>,
): string[] {
  const blocked = new Set(
    [...blockedJobRequestIds].map(id => String(id || '').trim()).filter(Boolean),
  )
  return pendingIdsOldestFirst
    .map(id => String(id || '').trim())
    .filter(id => id && !blocked.has(id))
}

/**
 * Re-queue Susan reviews for open deletion requests that have no queued/processing job.
 * Used on app start, AI settings save, and worker ticks so reviews don't go dormant after
 * restarts or settings changes.
 */
export async function catchUpPendingDeletionRequestAiReviews(
  db: Db,
  opts: { limit?: number, ignoreCooldown?: boolean } = {},
): Promise<{
  enqueued: number
  skipped: number
  pending: number
}> {
  const limit = opts.limit ?? 50
  // ignoreCooldown kept for API compatibility; catch-up only blocks active jobs now.
  void opts.ignoreCooldown

  if (!(await isAiAdministratorEnabled(db))) {
    return { enqueued: 0, skipped: 0, pending: 0 }
  }

  const pending = await db.select({
    id: entityDeletionRequests.id,
    createdAt: entityDeletionRequests.createdAt,
  })
    .from(entityDeletionRequests)
    .where(eq(entityDeletionRequests.status, 'pending'))
    .orderBy(asc(entityDeletionRequests.createdAt))
    .limit(limit)

  if (!pending.length) return { enqueued: 0, skipped: 0, pending: 0 }

  // Only block on live jobs — retryable skips must not freeze the queue.
  const blockingJobs = await db.select({ payload: workerJobs.payload })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'deletion_request_ai_review'),
      inArray(workerJobs.status, ['queued', 'processing']),
    ))

  const blockedIds = blockingJobs.map((job) => {
    const payload = job.payload as { requestId?: unknown } | null
    return String(payload?.requestId || '')
  })

  const needing = pendingDeletionIdsNeedingReview(
    pending.map(row => row.id),
    blockedIds,
  )
  const waitMinutes = await getAiAdministratorReviewWaitMinutes(db)
  const byId = new Map(pending.map(row => [row.id, row.createdAt]))

  let enqueued = 0
  for (const requestId of needing) {
    // Respect platform wait from when the request was opened so humans can act first.
    const runAfter = aiAdminReviewRunAfter(byId.get(requestId) ?? new Date(), waitMinutes)
    const job = await enqueueDeletionRequestAiReview(db, requestId, { runAfter })
    if (job) enqueued += 1
  }

  const skipped = pending.length - needing.length
  if (enqueued) {
    console.info(
      `[ai-administrator] catch-up enqueued=${enqueued} skippedBlocked=${skipped} pendingScanned=${pending.length}`,
    )
  }
  return { enqueued, skipped, pending: pending.length }
}

export async function reviewDeletionRequestWithSusan(db: Db, requestId: string): Promise<{
  decision: 'approve' | 'reject' | 'skipped'
  note: string | null
}> {
  const client = await prepareAdministratorClient(db)
  if (!client) {
    await logSusanDeletionAudit({
      action: 'deletion_requests.ai_review.skip',
      entityType: 'deletion_request',
      entityId: requestId,
      afterData: { requestId, reason: 'AI Administrator unavailable' },
    })
    return { decision: 'skipped', note: 'AI Administrator unavailable' }
  }

  const [req] = await db.select().from(entityDeletionRequests)
    .where(eq(entityDeletionRequests.id, requestId))
    .limit(1)
  if (!req) {
    await logSusanDeletionAudit({
      action: 'deletion_requests.ai_review.skip',
      entityType: 'deletion_request',
      entityId: requestId,
      afterData: { requestId, reason: 'Request not found' },
    })
    return { decision: 'skipped', note: 'Request not found' }
  }
  if (req.status !== 'pending') {
    await logSusanDeletionAudit({
      action: 'deletion_requests.ai_review.skip',
      entityType: req.entityType,
      entityId: req.entityId,
      afterData: { requestId, reason: 'Already decided', status: req.status },
    })
    return { decision: 'skipped', note: 'Already decided' }
  }

  const entityContext = await loadEntityContext(db, req.entityType, req.entityId)
  const susanId = await ensureSusanSystemUser(db)
  const submitter = await loadSubmitterContext(db, req.submittedBy)
  const history = await loadSubmitterDeletionHistory(db, req.submittedBy, { excludeRequestId: req.id })
  // Prior requests are context for the model only — never an automatic reject.
  const similar = findSimilarDeletionRequest(
    { entityType: req.entityType, entityId: req.entityId, reason: req.reason },
    history,
  )

  // Hard decline: already sent / paid / billing-linked — independent of repeat history.
  const hardDecline = hardDeclineDeletionContext(entityContext as Record<string, unknown>)
  if (hardDecline) {
    try {
      await rejectDeletionRequest(db, requestId, susanId, hardDecline)
      await logSusanDeletionAudit({
        action: 'deletion_requests.reject',
        entityType: req.entityType,
        entityId: req.entityId,
        susanId,
        afterData: {
          requestId,
          entityType: req.entityType,
          entityLabel: req.entityLabel,
          reviewReason: hardDecline,
          rule: 'record_state',
        },
      })
      return { decision: 'reject', note: hardDecline }
    }
    catch (err) {
      if (err instanceof DeletionRequestsServiceError && err.code === 'NOT_PENDING') {
        await logSusanDeletionAudit({
          action: 'deletion_requests.ai_review.skip',
          entityType: req.entityType,
          entityId: req.entityId,
          susanId,
          afterData: { requestId, reason: 'Already decided' },
        })
        return { decision: 'skipped', note: 'Already decided' }
      }
      throw err
    }
  }

  // Deterministic: vague reasons that slipped past submit still get rejected before approval.
  if (looksLikeWeakDeletionReason(req.reason)) {
    const note = 'Rejected — explain why this record should be deleted. A short phrase like "test system" is not enough.'
    try {
      await rejectDeletionRequest(db, requestId, susanId, note)
      await logSusanDeletionAudit({
        action: 'deletion_requests.reject',
        entityType: req.entityType,
        entityId: req.entityId,
        susanId,
        afterData: {
          requestId,
          entityType: req.entityType,
          entityLabel: req.entityLabel,
          reviewReason: note,
          rule: 'weak_reason',
        },
      })
      return { decision: 'reject', note }
    }
    catch (err) {
      if (err instanceof DeletionRequestsServiceError && err.code === 'NOT_PENDING') {
        await logSusanDeletionAudit({
          action: 'deletion_requests.ai_review.skip',
          entityType: req.entityType,
          entityId: req.entityId,
          susanId,
          afterData: { requestId, reason: 'Already decided' },
        })
        return { decision: 'skipped', note: 'Already decided' }
      }
      throw err
    }
  }

  const recentHistoryForPrompt = history.slice(0, 8).map(item => ({
    status: item.status,
    entityType: item.entityType,
    entityLabel: item.entityLabel,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
  }))

  const system = [
    `You are ${AI_ASSISTANT_NAME}, AI Administrator for ${BRAND_NAME}.`,
    'Review staff deletion requests on the merits of the reason and the record state.',
    'Do NOT reject solely because the same user asked before — admins and developers often resubmit legitimate cleanup requests.',
    'Judge whether the reason sounds truthful and specific (why this record exists / why deletion is the right cleanup).',
    'Reject vague filler (e.g. "test system") that does not explain the purpose.',
    'Accept clear reasons such as testing features and now removing a leftover draft, duplicate draft, wrong customer, training leftover, etc.',
    'Weigh the submitter account type with the reason (mechanic/training, admin/dev cleanup, accountant/billing caution).',
    'REJECT when the invoice was already sent to a customer, has payment activity, or a service log is linked to billing — tell them to edit or void instead.',
    'Prefer REJECT when a simple edit can fix the problem (wrong field, typo, wrong notes).',
    'APPROVE unsent drafts / junk / duplicate leftovers when the reason is truthful and deletion is appropriate cleanup.',
    'Write a concise review note (1–2 short sentences, no fluff). Explain the record-state or reason issue — never "because you asked before".',
    'Return JSON only: { "decision": "approve" | "reject", "note": "..." }.',
  ].join(' ')

  const user = [
    `Request id: ${req.id}`,
    `Entity type: ${req.entityType}`,
    `Entity label: ${req.entityLabel}`,
    submitter
      ? `Submitter: ${submitter.name || 'staff'} · account type ${submitter.accountTypeLabel} (${submitter.accountTypeKey})`
      : 'Submitter: unknown',
    `Submitter reason: ${req.reason}`,
    similar
      ? `Note: submitter has a recent related request (${similar.kind} · ${similar.status} · ${similar.entityLabel}). Use as context only — do not reject only for that.`
      : null,
    `Recent deletion requests by this submitter (JSON): ${JSON.stringify(recentHistoryForPrompt)}`,
    `Entity context JSON: ${JSON.stringify(entityContext)}`,
  ].filter(Boolean).join('\n')

  let decision: 'approve' | 'reject' = 'reject'
  let note = 'Rejected — please edit the record instead of deleting it.'

  try {
    const result = await openRouterChat(client.apiKey, client.model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 'ai_administrator', {
      responseFormat: 'json',
      temperature: 0.15,
      maxTokens: 350,
      timeoutMs: 25_000,
    })

    await logAiUsage(db, {
      featureType: 'ai_administrator',
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      createdBy: susanId,
    })

    const parsed = parseOpenRouterJson(result.content) as {
      decision?: unknown
      note?: unknown
    }
    if (parsed.decision === 'approve' || parsed.decision === 'reject') {
      decision = parsed.decision
    }
    if (typeof parsed.note === 'string' && parsed.note.trim()) {
      note = parsed.note.trim().slice(0, 2000)
    }
  }
  catch (err) {
    console.warn('[ai-administrator] review AI failed:', (err as Error).message)
    await logSusanDeletionAudit({
      action: 'deletion_requests.ai_review.skip',
      entityType: req.entityType,
      entityId: req.entityId,
      susanId,
      afterData: {
        requestId,
        reason: 'AI review failed',
        error: (err as Error).message,
      },
    })
    return { decision: 'skipped', note: 'AI review failed' }
  }

  // Hard safety: never auto-approve sent/paid/billing-linked records.
  if (decision === 'approve') {
    const safety = hardDeclineDeletionContext(entityContext as Record<string, unknown>)
    if (safety) {
      decision = 'reject'
      note = safety
    }
  }

  try {
    if (decision === 'approve') {
      await approveDeletionRequest(db, requestId, susanId, note)
    }
    else {
      await rejectDeletionRequest(db, requestId, susanId, note)
    }
    await logSusanDeletionAudit({
      action: decision === 'approve' ? 'deletion_requests.approve' : 'deletion_requests.reject',
      entityType: req.entityType,
      entityId: req.entityId,
      susanId,
      afterData: {
        requestId,
        entityType: req.entityType,
        entityLabel: req.entityLabel,
        reviewReason: note,
      },
    })
  }
  catch (err) {
    if (err instanceof DeletionRequestsServiceError && err.code === 'NOT_PENDING') {
      await logSusanDeletionAudit({
        action: 'deletion_requests.ai_review.skip',
        entityType: req.entityType,
        entityId: req.entityId,
        susanId,
        afterData: { requestId, reason: 'Already decided' },
      })
      return { decision: 'skipped', note: 'Already decided' }
    }
    if (err instanceof DeletionRequestsServiceError && err.code === 'INVALID_TRANSITION') {
      const rejectNote = 'Rejected — this record cannot be deleted in its current state. Edit or void it instead.'
      await rejectDeletionRequest(db, requestId, susanId, rejectNote)
      await logSusanDeletionAudit({
        action: 'deletion_requests.reject',
        entityType: req.entityType,
        entityId: req.entityId,
        susanId,
        afterData: {
          requestId,
          entityType: req.entityType,
          entityLabel: req.entityLabel,
          reviewReason: rejectNote,
          rule: 'invalid_transition',
        },
      })
      return { decision: 'reject', note: 'Rejected — invalid deletion state' }
    }
    throw err
  }

  return { decision, note }
}

/** Claim due deletion_request_ai_review jobs and run Susan reviews (Nitro embedded workers). */
export async function processDeletionRequestAiReviews(db: Db, limit = 5): Promise<{
  processed: number
  failed: number
}> {
  const pool = usePool()
  let processed = 0
  let failed = 0

  for (let i = 0; i < limit; i++) {
    const claimed = await pool.query<{ id: string, payload: { requestId?: string }, attempts: number, max_attempts: number }>(
      `UPDATE worker_jobs
       SET status = 'processing', started_at = now(), attempts = attempts + 1
       WHERE id = (
         SELECT id FROM worker_jobs
         WHERE job_type = 'deletion_request_ai_review'
           AND status = 'queued'
           AND run_after <= now()
         ORDER BY run_after ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, payload, attempts, max_attempts`,
    )
    const row = claimed.rows[0]
    if (!row?.id) break

    const requestId = String(row.payload?.requestId || '')
    try {
      if (!requestId) throw new Error('Missing requestId in job payload')
      const result = await reviewDeletionRequestWithSusan(db, requestId)

      // Soft skip (AI unavailable / timeout) — keep pending and retry soon.
      if (isRetryableSusanSkip(result.decision, result.note)) {
        const exhausted = row.attempts >= row.max_attempts
        const backoffSecs = Math.min(60, Math.max(10, row.attempts * 10))
        await pool.query(
          `UPDATE worker_jobs
           SET status = $2,
               last_error = $3,
               finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
               run_after = CASE WHEN $2 = 'failed' THEN run_after ELSE now() + make_interval(secs => $4) END,
               started_at = NULL
           WHERE id = $1`,
          [
            row.id,
            exhausted ? 'failed' : 'queued',
            result.note || 'AI Administrator skipped',
            backoffSecs,
          ],
        )
        failed += 1
        console.warn(
          '[ai-administrator] retryable skip',
          requestId,
          result.note,
          exhausted ? 'exhausted' : `retryIn=${backoffSecs}s`,
        )
        continue
      }

      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [row.id],
      )
      processed += 1
    }
    catch (err) {
      failed += 1
      const message = err instanceof Error ? err.message : 'AI administrator review failed'
      const exhausted = row.attempts >= row.max_attempts
      await pool.query(
        `UPDATE worker_jobs
         SET status = $2,
             last_error = $3,
             finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
             run_after = CASE WHEN $2 = 'failed' THEN run_after ELSE now() + make_interval(secs => $4) END,
             started_at = NULL
         WHERE id = $1`,
        [row.id, exhausted ? 'failed' : 'queued', message, Math.min(120, Math.max(15, row.attempts * 15))],
      )
      console.error('[ai-administrator] job failed', row.id, message)
    }
  }

  return { processed, failed }
}
