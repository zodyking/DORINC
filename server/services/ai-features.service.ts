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
import { getInvoiceDetail, updateInvoiceLineItem } from './invoices.service'
import {
  invoiceDescriptionContentSchema,
  serviceLogExtractionContentSchema,
  type AiSuggestionReview,
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
  if (invoice.status !== 'draft') {
    throw new AiFeaturesServiceError('NOT_FOUND', 'Only draft invoices can use AI description assist')
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

export async function runInvoiceDescriptionJob(db: Db, aiJobId: string) {
  const job = await getAiJob(db, aiJobId)
  if (!job) throw new AiFeaturesServiceError('NOT_FOUND', 'AI job not found')

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
