import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appFiles } from '../db/schema/files'
import { USER_UPLOAD_FILE_KINDS } from '../../shared/files'
import { invoiceLineItems } from '../db/schema/invoices'
import type { AiFeatureType } from '../db/schema/ai'
import {
  createAiJob,
  createAiSuggestion,
  getAiJob,
  getAiSuggestion,
  linkAiJobWorker,
  logAiUsage,
  updateAiJobStatus,
  updateAiSuggestionReview,
} from './ai-jobs.service'
import {
  AiProviderServiceError,
  getAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
} from './ai-provider.service'
import {
  openRouterChat,
  parseOpenRouterJson,
} from './ai-openrouter.service'
import { enqueueJob } from './jobs.service'
import { getFileWithData } from './files.service'
import { getServiceLog, updateServiceLog } from './service-logs.service'
import { getInvoiceDetail, INVOICE_EDITABLE_STATUSES, updateInvoiceLineItem } from './invoices.service'
import { getInvoiceWorkspaceSettings } from './workspace-settings.service'
import { normalizeInvoiceLineAiRules } from '../../shared/invoice-line-ai-rules'
import {
  invoiceDescriptionContentSchema,
  invoiceLineAuditContentSchema,
  serviceLogExtractionContentSchema,
  type AiSuggestionReview,
  type InvoiceLineAuditContent,
  type InvoiceLineAuditReview,
} from '../../shared/validators/ai'

export type AiFeaturesServiceErrorCode
  = 'NOT_CONFIGURED' | 'FEATURE_DISABLED' | 'NOT_FOUND' | 'NOT_PENDING'
    | 'INVALID_CONTENT' | 'NO_IMAGES' | 'LINE_NOT_FOUND' | 'AI_FAILED'

export class AiFeaturesServiceError extends Error {
  constructor(public readonly code: AiFeaturesServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

async function assertAiFeatureEnabled(db: Db, feature: AiFeatureType): Promise<{ model: string }> {
  const settings = await getAiProviderSettings(db)
  if (!settings.enabled || !settings.hasApiKey) {
    throw new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
  }

  const featureEnabled = feature === 'service_log_extraction'
    ? settings.serviceLogExtractionEnabled
    : feature === 'invoice_description'
      ? settings.invoiceDescriptionEnabled
      : settings.platformHelpEnabled

  if (!featureEnabled) {
    throw new AiFeaturesServiceError('FEATURE_DISABLED', 'This AI feature is disabled')
  }

  return { model: modelForFeature(settings, feature) }
}

export async function enqueueServiceLogExtraction(
  db: Db,
  serviceLogId: string,
  actorId: string,
  fileId?: string,
) {
  await assertAiFeatureEnabled(db, 'service_log_extraction')
  const log = await getServiceLog(db, serviceLogId)

  const images = await db.select({
    id: appFiles.id,
    mimeType: appFiles.mimeType,
  }).from(appFiles).where(and(
    eq(appFiles.ownerEntityType, 'service_log'),
    eq(appFiles.ownerEntityId, serviceLogId),
    inArray(appFiles.fileKind, [...USER_UPLOAD_FILE_KINDS]),
    isNull(appFiles.archivedAt),
  ))

  const imageFiles = images.filter(f => f.mimeType.startsWith('image/'))
  if (!imageFiles.length) throw new AiFeaturesServiceError('NO_IMAGES', 'No images to extract from')

  const targetFileId = fileId && imageFiles.some(f => f.id === fileId)
    ? fileId
    : imageFiles[0]!.id

  const aiJob = await createAiJob(db, {
    jobType: 'service_log_extraction',
    entityType: 'service_log',
    entityId: serviceLogId,
    inputPayload: {
      fileId: targetFileId,
      complaint: log.complaint,
      internalNotes: log.internalNotes,
    },
    createdBy: actorId,
  })

  const workerJob = await enqueueJob(db, 'service_log_ai_extraction', {
    aiJobId: aiJob.id,
    serviceLogId,
    fileId: targetFileId,
  })

  await linkAiJobWorker(db, aiJob.id, workerJob.id)

  return { aiJob, workerJob }
}

export async function enqueueInvoiceDescription(
  db: Db,
  invoiceId: string,
  lineItemId: string,
  actorId: string,
) {
  await assertAiFeatureEnabled(db, 'invoice_description')
  const invoice = await getInvoiceDetail(db, invoiceId)
  if (!INVOICE_EDITABLE_STATUSES.includes(invoice.status)) {
    throw new AiFeaturesServiceError('NOT_FOUND', 'Paid and void invoices cannot use AI description assist')
  }

  const line = invoice.lineItems.find(l => l.id === lineItemId)
  if (!line) throw new AiFeaturesServiceError('LINE_NOT_FOUND', 'Line item not found')

  const aiJob = await createAiJob(db, {
    jobType: 'invoice_description',
    entityType: 'invoice',
    entityId: invoiceId,
    inputPayload: {
      lineItemId,
      originalDescription: line.description,
      lineType: line.lineType,
      complaint: invoice.complaint,
    },
    createdBy: actorId,
  })

  const workerJob = await enqueueJob(db, 'invoice_description_ai', {
    aiJobId: aiJob.id,
    invoiceId,
    lineItemId,
  })

  await linkAiJobWorker(db, aiJob.id, workerJob.id)

  return { aiJob, workerJob }
}

function buildLineAuditSystemPrompt(rules: string): string {
  return [
    'You audit invoice line items before they are saved to a customer-facing invoice.',
    'Return JSON only with this shape:',
    '{ "lines": [ { "lineItemId": "uuid", "status": "ok"|"needs_fix", "issues": ["..."],',
    '"suggested": { "description": "...", "quantity": "...", "unitPrice": "..." } | null } ] }',
    'For each line provided, return exactly one entry with the same lineItemId.',
    'Use status "ok" when the line already meets all rules — set suggested to null.',
    'Use status "needs_fix" when any rule is violated — suggested must contain corrected description, quantity, and unitPrice as decimal strings.',
    'Rules to enforce:',
    rules,
  ].join(' ')
}

export async function enqueueInvoiceLineAudit(
  db: Db,
  invoiceId: string,
  actorId: string,
) {
  await assertAiFeatureEnabled(db, 'invoice_description')
  const invoice = await getInvoiceDetail(db, invoiceId)
  if (!INVOICE_EDITABLE_STATUSES.includes(invoice.status)) {
    throw new AiFeaturesServiceError('NOT_FOUND', 'Paid and void invoices cannot use AI line audit')
  }
  if (!invoice.lineItems.length) {
    throw new AiFeaturesServiceError('NOT_FOUND', 'Invoice has no line items to audit')
  }

  const invoiceSettings = await getInvoiceWorkspaceSettings(db)
  const rules = normalizeInvoiceLineAiRules(invoiceSettings.lineItemAiRules)

  const aiJob = await createAiJob(db, {
    jobType: 'invoice_description',
    entityType: 'invoice',
    entityId: invoiceId,
    inputPayload: {
      mode: 'line_audit',
      complaint: invoice.complaint,
      rules,
      lines: invoice.lineItems.map(line => ({
        lineItemId: line.id,
        sortOrder: line.sortOrder,
        lineType: line.lineType,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineAmount: line.lineAmount,
      })),
    },
    createdBy: actorId,
  })

  const workerJob = await enqueueJob(db, 'invoice_description_ai', {
    aiJobId: aiJob.id,
    invoiceId,
    mode: 'line_audit',
  })

  await linkAiJobWorker(db, aiJob.id, workerJob.id)

  return { aiJob, workerJob }
}

const EXTRACTION_SYSTEM = `You extract structured service log data from photos of handwritten or printed shop notes.
Return JSON only with keys: complaint (customer symptoms, string or null), internalNotes (mechanic notes, string or null),
draftLineItems (array of {description, qty, rate, amount} — use plain numbers without currency symbols when possible).
If a field is not visible, use null or omit draftLineItems. Do not invent prices — leave rate/amount null if unclear.`

const DESCRIPTION_SYSTEM = `You rewrite mechanic line-item notes into clear, professional customer-facing invoice descriptions.
Return JSON only: { "description": "..." }.
Keep factual accuracy. Do not add parts, prices, quantities, or hours. Wording only — shorter is fine.`

export async function runServiceLogExtractionJob(db: Db, aiJobId: string) {
  const job = await getAiJob(db, aiJobId)
  if (!job) throw new AiFeaturesServiceError('NOT_FOUND', 'AI job not found')

  const { model } = await assertAiFeatureEnabled(db, 'service_log_extraction')
  const apiKey = await getDecryptedApiKey(db)
  if (!apiKey) throw new AiProviderServiceError('NOT_CONFIGURED')

  await updateAiJobStatus(db, aiJobId, 'processing')

  const input = job.inputPayload
  const fileId = String(input.fileId ?? '')
  const file = await getFileWithData(db, fileId)
  if (!file.mimeType.startsWith('image/')) {
    throw new AiFeaturesServiceError('NO_IMAGES', 'Selected file is not an image')
  }

  const b64 = file.binaryData.toString('base64')
  const dataUrl = `data:${file.mimeType};base64,${b64}`

  const userText = [
    'Extract service log fields from this image.',
    input.complaint ? `Existing complaint (may refine): ${String(input.complaint)}` : '',
    input.internalNotes ? `Existing internal notes (may refine): ${String(input.internalNotes)}` : '',
  ].filter(Boolean).join('\n')

  const result = await openRouterChat(apiKey, model, [
    { role: 'system', content: EXTRACTION_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ], 'service_log_extraction')

  const parsed = serviceLogExtractionContentSchema.parse({
    ...parseOpenRouterJson(result.content),
    fileId,
  })

  await logAiUsage(db, {
    aiJobId,
    featureType: 'service_log_extraction',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: job.createdBy ?? undefined,
  })

  const log = await getServiceLog(db, job.entityId)
  const suggestion = await createAiSuggestion(db, {
    aiJobId,
    featureType: 'service_log_extraction',
    entityType: 'service_log',
    entityId: job.entityId,
    originalContent: {
      complaint: log.complaint,
      internalNotes: log.internalNotes,
      draftLineItems: log.draftLineItems,
    },
    suggestedContent: parsed,
  })

  await updateAiJobStatus(db, aiJobId, 'done', { outputPayload: { suggestionId: suggestion.id } })

  return { suggestion, parsed }
}

function normalizeAuditLines(
  inputLines: Array<{
    lineItemId: string
    sortOrder?: number
    lineType: string
    description: string
    quantity: string
    unitPrice: string
  }>,
  aiLines: Array<Record<string, unknown>>,
): InvoiceLineAuditContent {
  const normalized = inputLines.map((input) => {
    const ai = aiLines.find(row => String(row.lineItemId) === input.lineItemId)
    const original = {
      description: input.description,
      quantity: String(input.quantity),
      unitPrice: String(input.unitPrice),
    }
    const status = ai?.status === 'needs_fix' ? 'needs_fix' as const : 'ok' as const
    const issues = Array.isArray(ai?.issues)
      ? ai.issues.map(i => String(i)).filter(Boolean).slice(0, 20)
      : []
    let suggested = null
    if (status === 'needs_fix' && ai?.suggested && typeof ai.suggested === 'object') {
      const s = ai.suggested as Record<string, unknown>
      suggested = {
        description: String(s.description ?? original.description).slice(0, 500),
        quantity: String(s.quantity ?? original.quantity).slice(0, 30),
        unitPrice: String(s.unitPrice ?? original.unitPrice).slice(0, 30),
      }
    }
    return {
      lineItemId: input.lineItemId,
      sortOrder: input.sortOrder,
      lineType: (input.lineType === 'part' || input.lineType === 'fee' ? input.lineType : 'labor') as 'part' | 'labor' | 'fee',
      status,
      issues,
      original,
      suggested,
    }
  })

  const issuesFound = normalized.filter(l => l.status === 'needs_fix').length
  return invoiceLineAuditContentSchema.parse({
    kind: 'invoice_line_audit',
    checkedAt: new Date().toISOString(),
    lines: normalized,
    summary: { totalLines: normalized.length, issuesFound },
  })
}

export async function runInvoiceLineAuditJob(db: Db, aiJobId: string) {
  const job = await getAiJob(db, aiJobId)
  if (!job) throw new AiFeaturesServiceError('NOT_FOUND', 'AI job not found')
  if (job.inputPayload.mode !== 'line_audit') {
    throw new AiFeaturesServiceError('INVALID_CONTENT', 'Not a line audit job')
  }

  const { model } = await assertAiFeatureEnabled(db, 'invoice_description')
  const apiKey = await getDecryptedApiKey(db)
  if (!apiKey) throw new AiProviderServiceError('NOT_CONFIGURED')

  await updateAiJobStatus(db, aiJobId, 'processing')

  const inputLines = (job.inputPayload.lines ?? []) as Array<{
    lineItemId: string
    sortOrder?: number
    lineType: string
    description: string
    quantity: string
    unitPrice: string
    lineAmount?: string
  }>
  const rules = String(job.inputPayload.rules ?? '')
  const complaint = job.inputPayload.complaint ? String(job.inputPayload.complaint) : null

  const userPrompt = [
    complaint ? `Invoice complaint context: ${complaint}` : '',
    'Audit each line item below. Apply the rules strictly.',
    JSON.stringify({ lines: inputLines }, null, 2),
  ].filter(Boolean).join('\n\n')

  const result = await openRouterChat(apiKey, model, [
    { role: 'system', content: buildLineAuditSystemPrompt(rules) },
    { role: 'user', content: userPrompt },
  ], 'invoice_description')

  const parsedRaw = parseOpenRouterJson(result.content) as { lines?: Array<Record<string, unknown>> }
  const auditContent = normalizeAuditLines(inputLines, parsedRaw.lines ?? [])

  await logAiUsage(db, {
    aiJobId,
    featureType: 'invoice_description',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: job.createdBy ?? undefined,
  })

  const originalContent = {
    kind: 'invoice_line_audit',
    lines: inputLines,
  }

  if (auditContent.summary.issuesFound === 0) {
    await updateAiJobStatus(db, aiJobId, 'done', {
      outputPayload: { issuesFound: 0, suggestionId: null, auditContent },
    })
    return { auditContent, suggestion: null }
  }

  const suggestion = await createAiSuggestion(db, {
    aiJobId,
    featureType: 'invoice_description',
    entityType: 'invoice',
    entityId: job.entityId,
    originalContent,
    suggestedContent: auditContent,
  })

  await updateAiJobStatus(db, aiJobId, 'done', {
    outputPayload: { issuesFound: auditContent.summary.issuesFound, suggestionId: suggestion.id },
  })

  return { auditContent, suggestion }
}

export async function reviewInvoiceLineAudit(
  db: Db,
  review: InvoiceLineAuditReview,
  actorId: string,
) {
  const suggestion = await getAiSuggestion(db, review.suggestionId)
  if (!suggestion) throw new AiFeaturesServiceError('NOT_FOUND', 'Suggestion not found')
  if (suggestion.status !== 'pending') {
    throw new AiFeaturesServiceError('NOT_PENDING', 'Audit report was already reviewed')
  }

  const parsed = invoiceLineAuditContentSchema.safeParse(suggestion.suggestedContent)
  if (!parsed.success || parsed.data.kind !== 'invoice_line_audit') {
    throw new AiFeaturesServiceError('INVALID_CONTENT', 'Invalid line audit report')
  }

  const decisionMap = new Map(review.decisions.map(d => [d.lineItemId, d.action]))
  const needsFix = parsed.data.lines.filter(l => l.status === 'needs_fix')

  for (const line of needsFix) {
    const action = decisionMap.get(line.lineItemId)
    if (action !== 'accept' || !line.suggested) continue
    await updateInvoiceLineItem(db, suggestion.entityId, line.lineItemId, {
      description: line.suggested.description,
      quantity: line.suggested.quantity,
      unitPrice: line.suggested.unitPrice,
    }, actorId)
  }

  const allRejected = needsFix.length > 0 && needsFix.every(l => decisionMap.get(l.lineItemId) === 'reject')
  const anyAccepted = needsFix.some(l => decisionMap.get(l.lineItemId) === 'accept')

  const status = anyAccepted ? 'accepted' : allRejected ? 'rejected' : 'edited'
  return updateAiSuggestionReview(db, review.suggestionId, status, actorId)
}

export async function runInvoiceDescriptionJob(db: Db, aiJobId: string) {
  const job = await getAiJob(db, aiJobId)
  if (!job) throw new AiFeaturesServiceError('NOT_FOUND', 'AI job not found')

  if (job.inputPayload.mode === 'line_audit') {
    return runInvoiceLineAuditJob(db, aiJobId)
  }

  const { model } = await assertAiFeatureEnabled(db, 'invoice_description')
  const apiKey = await getDecryptedApiKey(db)
  if (!apiKey) throw new AiProviderServiceError('NOT_CONFIGURED')

  await updateAiJobStatus(db, aiJobId, 'processing')

  const lineItemId = String(job.inputPayload.lineItemId ?? '')
  const originalDescription = String(job.inputPayload.originalDescription ?? '')
  const lineType = String(job.inputPayload.lineType ?? 'labor')
  const complaint = job.inputPayload.complaint ? String(job.inputPayload.complaint) : null

  const userPrompt = [
    `Line type: ${lineType}`,
    `Original mechanic note: ${originalDescription}`,
    complaint ? `Invoice complaint context: ${complaint}` : '',
    'Rewrite the mechanic note as a customer-facing invoice line description.',
  ].filter(Boolean).join('\n')

  const result = await openRouterChat(apiKey, model, [
    { role: 'system', content: DESCRIPTION_SYSTEM },
    { role: 'user', content: userPrompt },
  ], 'invoice_description')

  const parsed = invoiceDescriptionContentSchema.parse({
    ...parseOpenRouterJson(result.content),
    lineItemId,
    originalDescription,
  })

  await logAiUsage(db, {
    aiJobId,
    featureType: 'invoice_description',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: job.createdBy ?? undefined,
  })

  const suggestion = await createAiSuggestion(db, {
    aiJobId,
    featureType: 'invoice_description',
    entityType: 'invoice',
    entityId: job.entityId,
    originalContent: { description: originalDescription, lineItemId },
    suggestedContent: parsed,
  })

  await updateAiJobStatus(db, aiJobId, 'done', { outputPayload: { suggestionId: suggestion.id } })

  return { suggestion, parsed }
}

export async function reviewAiSuggestion(
  db: Db,
  suggestionId: string,
  review: AiSuggestionReview,
  actorId: string,
) {
  const suggestion = await getAiSuggestion(db, suggestionId)
  if (!suggestion) throw new AiFeaturesServiceError('NOT_FOUND', 'Suggestion not found')
  if (suggestion.status !== 'pending') {
    throw new AiFeaturesServiceError('NOT_PENDING', 'Suggestion was already reviewed')
  }

  if (review.action === 'reject') {
    return updateAiSuggestionReview(db, suggestionId, 'rejected', actorId, review.reviewNotes)
  }

  const content = review.action === 'edit' ? review.content : suggestion.suggestedContent
  if (!content || typeof content !== 'object') {
    throw new AiFeaturesServiceError('INVALID_CONTENT', 'Review content is required for accept/edit')
  }

  if (suggestion.featureType === 'service_log_extraction') {
    const parsed = serviceLogExtractionContentSchema.safeParse(content)
    if (!parsed.success) throw new AiFeaturesServiceError('INVALID_CONTENT', 'Invalid extraction content')

    const patch: Record<string, unknown> = {}
    if (parsed.data.complaint != null) patch.complaint = parsed.data.complaint
    if (parsed.data.internalNotes != null) patch.internalNotes = parsed.data.internalNotes
    if (parsed.data.draftLineItems?.length) patch.draftLineItems = parsed.data.draftLineItems

    if (Object.keys(patch).length) {
      await updateServiceLog(db, suggestion.entityId, patch)
    }
  }
  else if (suggestion.featureType === 'invoice_description') {
    if ((suggestion.suggestedContent as { kind?: string }).kind === 'invoice_line_audit') {
      throw new AiFeaturesServiceError('INVALID_CONTENT', 'Use the line audit review endpoint for this report')
    }
    const parsed = invoiceDescriptionContentSchema.safeParse({
      ...content,
      lineItemId: review.lineItemId
        ?? (suggestion.suggestedContent.lineItemId as string | undefined)
        ?? (suggestion.originalContent?.lineItemId as string | undefined),
    })
    if (!parsed.success) throw new AiFeaturesServiceError('INVALID_CONTENT', 'Invalid description content')

    const [line] = await db.select({ id: invoiceLineItems.id })
      .from(invoiceLineItems)
      .where(and(
        eq(invoiceLineItems.id, parsed.data.lineItemId),
        eq(invoiceLineItems.invoiceId, suggestion.entityId),
      ))
    if (!line) throw new AiFeaturesServiceError('LINE_NOT_FOUND', 'Line item not found')

    await updateInvoiceLineItem(db, suggestion.entityId, parsed.data.lineItemId, {
      description: parsed.data.description,
    }, actorId)
  }

  const status = review.action === 'edit' ? 'edited' : 'accepted'
  return updateAiSuggestionReview(db, suggestionId, status, actorId, review.reviewNotes)
}

export async function markAiJobFailed(db: Db, aiJobId: string, message: string) {
  await updateAiJobStatus(db, aiJobId, 'failed', { lastError: message })
}
