import { count, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Db } from '../db/client'
import { usePool } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { entityDeletionRequests, type DeletionEntityType } from '../db/schema/deletion-requests'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { serviceLogs } from '../db/schema/service-logs'
import { customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'
import { conversations } from '../db/schema/messages'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import { parseOpenRouterJson, openRouterChat } from './ai-openrouter.service'
import {
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
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

export const DELETION_REASON_WEAK_MESSAGE
  = 'Enter a more descriptive reason for your request'

export const AI_ADMIN_REVIEW_DELAY_MS = 30_000

const SUSAN_SYSTEM_EMAIL = 'susan.ai@dorinc.system'

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

/** Cheap local filter before spending tokens. */
export function looksLikeWeakDeletionReason(reason: string): boolean {
  const text = reason.trim().toLowerCase()
  if (text.length < 10) return true

  const compact = text.replace(/\s+/g, '')
  if (compact.length < 8) return true

  // Keyboard spam / filler
  if (/^(.)\1{7,}$/.test(compact)) return true
  if (/^(..)\1{4,}$/.test(compact)) return true
  if (/^(asdf+|qwer+|zxcv+|test+|abc+|xxx+|yyy+|zzz+|1234+|0000+)/.test(compact)) return true

  const words = text.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length <= 1 && text.length < 24) return true

  const filler = new Set([
    'test', 'testing', 'asdf', 'qwer', 'delete', 'remove', 'please', 'pls',
    'thanks', 'thank', 'you', 'need', 'want', 'just', 'because', 'reason',
    'blah', 'stuff', 'thing', 'things', 'idk', 'whatever', 'none', 'n/a', 'na',
  ])
  const meaningful = words.filter(w => !filler.has(w) && w.length > 2)
  if (meaningful.length === 0) return true
  if (words.length >= 3 && meaningful.length <= 1 && text.length < 40) return true

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

/**
 * Gate vague / filler deletion reasons when AI Administrator is enabled.
 * Local heuristic catches obvious filler; Susan confirms borderline cases.
 * If AI is off/unavailable after the heuristic passes, submit proceeds.
 */
export async function assertDeletionReasonAcceptable(
  db: Db,
  reason: string,
  context: { entityType: DeletionEntityType, entityLabel?: string | null },
): Promise<void> {
  if (!(await isAiAdministratorEnabled(db))) return

  const trimmed = reason.trim()
  if (looksLikeWeakDeletionReason(trimmed)) {
    throw new AiAdministratorServiceError('WEAK_REASON', DELETION_REASON_WEAK_MESSAGE)
  }

  const client = await prepareAdministratorClient(db)
  if (!client) return

  const system = [
    `You are ${AI_ASSISTANT_NAME}, AI Administrator for ${BRAND_NAME}.`,
    'Decide if a staff deletion-request reason is a real business explanation,',
    'or filler written only to pass a minimum character check.',
    'Reject keyboard spam, nonsense, jokes, and vague filler like "delete please" / "test test test".',
    'Accept concise but real reasons (duplicate draft, wrong customer, created by mistake, etc.).',
    'Return JSON only: { "ok": boolean, "reason": "short note" }.',
  ].join(' ')

  const user = [
    `Entity type: ${context.entityType}`,
    context.entityLabel ? `Entity: ${context.entityLabel}` : null,
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
  const [existing] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, SUSAN_SYSTEM_EMAIL))
    .limit(1)
  if (existing) return existing.id

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
      name: AI_ASSISTANT_NAME,
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
      silentDeveloperMode: true,
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

export async function enqueueDeletionRequestAiReview(db: Db, requestId: string) {
  if (!(await isAiAdministratorEnabled(db))) return null
  const runAfter = new Date(Date.now() + AI_ADMIN_REVIEW_DELAY_MS)
  return enqueueJob(db, 'deletion_request_ai_review', { requestId }, 3, { runAfter })
}

export async function reviewDeletionRequestWithSusan(db: Db, requestId: string): Promise<{
  decision: 'approve' | 'reject' | 'skipped'
  note: string | null
}> {
  const client = await prepareAdministratorClient(db)
  if (!client) return { decision: 'skipped', note: 'AI Administrator unavailable' }

  const [req] = await db.select().from(entityDeletionRequests)
    .where(eq(entityDeletionRequests.id, requestId))
    .limit(1)
  if (!req) return { decision: 'skipped', note: 'Request not found' }
  if (req.status !== 'pending') return { decision: 'skipped', note: 'Already decided' }

  const entityContext = await loadEntityContext(db, req.entityType, req.entityId)
  const susanId = await ensureSusanSystemUser(db)

  const system = [
    `You are ${AI_ASSISTANT_NAME}, AI Administrator for ${BRAND_NAME}.`,
    'Review staff deletion requests. Be conservative.',
    'Prefer REJECT when an edit can fix the problem (wrong field, typo, wrong notes) — tell them to edit instead.',
    'Prefer REJECT when the record was already sent to a customer, paid, linked to billing, or clearly still in use — unless the reason proves a true duplicate/mistake that cannot be fixed by edit.',
    'APPROVE only for clear junk/duplicate/test records or irreversible mistakes where deletion is the right cleanup.',
    'Write a concise review note (1–2 short sentences, no fluff).',
    'Return JSON only: { "decision": "approve" | "reject", "note": "..." }.',
  ].join(' ')

  const user = [
    `Request id: ${req.id}`,
    `Entity type: ${req.entityType}`,
    `Entity label: ${req.entityLabel}`,
    `Submitter reason: ${req.reason}`,
    `Entity context JSON: ${JSON.stringify(entityContext)}`,
  ].join('\n')

  let decision: 'approve' | 'reject' = 'reject'
  let note = 'Rejected — please edit the record instead of deleting it.'

  try {
    const result = await openRouterChat(client.apiKey, client.model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 'ai_administrator', { responseFormat: 'json', temperature: 0.15, maxTokens: 350 })

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
    return { decision: 'skipped', note: 'AI review failed' }
  }

  // Hard safety: never auto-approve paid invoices / SL linked to invoice.
  if (decision === 'approve') {
    const ctx = entityContext as Record<string, unknown>
    if (ctx.paid === true || ctx.linkedToInvoice === true) {
      decision = 'reject'
      note = 'Rejected — this record is linked to billing and should not be deleted.'
    }
  }

  try {
    if (decision === 'approve') {
      await approveDeletionRequest(db, requestId, susanId, note)
    }
    else {
      await rejectDeletionRequest(db, requestId, susanId, note)
    }
  }
  catch (err) {
    if (err instanceof DeletionRequestsServiceError && err.code === 'NOT_PENDING') {
      return { decision: 'skipped', note: 'Already decided' }
    }
    if (err instanceof DeletionRequestsServiceError && err.code === 'INVALID_TRANSITION') {
      await rejectDeletionRequest(
        db,
        requestId,
        susanId,
        'Rejected — this record cannot be deleted in its current state. Edit or void it instead.',
      )
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
      await reviewDeletionRequestWithSusan(db, requestId)
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
