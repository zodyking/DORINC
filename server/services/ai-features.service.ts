import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
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
  updateAiJobProgress,
  updateAiJobStatus,
  updateAiSuggestionReview,
} from './ai-jobs.service'
import {
  AiProviderServiceError,
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
  getAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
} from './ai-provider.service'
import {
  openRouterChat,
  OpenRouterServiceError,
  parseOpenRouterJson,
} from './ai-openrouter.service'
import { enqueueJob } from './jobs.service'
import { getFileWithData } from './files.service'
import { getServiceLog, updateServiceLog } from './service-logs.service'
import { getInvoiceDetail, INVOICE_EDITABLE_STATUSES, updateInvoiceLineItem } from './invoices.service'
import { getInvoiceWorkspaceSettings, getServiceLogSheetSettings } from './workspace-settings.service'
import { normalizeInvoiceLineAiRules } from '../../shared/invoice-line-ai-rules'
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  buildPageTypeSystemPrompt,
  buildPageTypeUserPrompt,
  flattenActiveSheetItems,
  isSheetLockedPage,
  mergeServiceLogPageExtractions,
  normalizePageType,
  normalizeServiceLogExtractionRules,
  requiresHighCertaintyLines,
} from '../../shared/service-log-extraction-rules'
import {
  buildLineAuditSystemPrompt,
  buildLineAuditUserPrompt,
  normalizeLineAuditResults,
} from '../../shared/invoice-line-audit.mjs'
import {
  invoiceDescriptionContentSchema,
  invoiceLineAuditContentSchema,
  serviceLogExtractionContentSchema,
  type AiSuggestionReview,
  type InvoiceLineAuditReview,
} from '../../shared/validators/ai'

export type AiFeaturesServiceErrorCode
  = 'NOT_CONFIGURED' | 'FEATURE_DISABLED' | 'NOT_FOUND' | 'NOT_PENDING'
    | 'INVALID_CONTENT' | 'NO_IMAGES' | 'LINE_NOT_FOUND' | 'AI_FAILED' | 'SPEND_CAP_EXCEEDED'

export class AiFeaturesServiceError extends Error {
  constructor(public readonly code: AiFeaturesServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

async function resolveConfiguredApiKey(db: Db): Promise<string> {
  try {
    const key = (await getDecryptedApiKey(db))?.trim()
    if (!key) throw new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
    return key
  }
  catch (e) {
    if (e instanceof AiFeaturesServiceError) throw e
    if (e instanceof AiProviderServiceError && (e.code === 'KEY_MISSING' || e.code === 'NOT_CONFIGURED')) {
      throw new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
    }
    throw e
  }
}

function normalizeAiExecutionError(err: unknown): AiFeaturesServiceError {
  if (err instanceof AiFeaturesServiceError) return err
  if (err instanceof AiProviderServiceError) {
    if (err.code === 'NOT_CONFIGURED' || err.code === 'KEY_MISSING') {
      return new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
    }
    if (err.code === 'SPEND_CAP_EXCEEDED') {
      return new AiFeaturesServiceError('FEATURE_DISABLED', err.message)
    }
    return new AiFeaturesServiceError('AI_FAILED', err.message)
  }
  if (err instanceof OpenRouterServiceError) {
    const msg = err.message.toLowerCase()
    if (err.code === 'API_ERROR' && (
      msg.includes('authentication')
      || msg.includes('api key')
      || msg.includes('unauthorized')
      || msg.includes('invalid api')
    )) {
      return new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
    }
    return new AiFeaturesServiceError('AI_FAILED', err.message)
  }
  if (err instanceof Error) return new AiFeaturesServiceError('AI_FAILED', err.message)
  return new AiFeaturesServiceError('AI_FAILED', 'Line audit failed')
}

export { normalizeAiExecutionError as normalizeAiExecutionErrorForTest }

async function assertAiFeatureEnabled(db: Db, feature: AiFeatureType): Promise<{ model: string }> {
  const settings = await getAiProviderSettings(db)
  if (!settings.enabled) {
    throw new AiFeaturesServiceError('NOT_CONFIGURED', 'AI is not configured')
  }

  await resolveConfiguredApiKey(db)

  const featureEnabled = feature === 'service_log_extraction'
    ? settings.serviceLogExtractionEnabled
    : feature === 'invoice_description'
      ? settings.invoiceDescriptionEnabled
      : feature === 'ai_administrator'
        ? settings.aiAdministratorEnabled
        : settings.platformHelpEnabled

  if (!featureEnabled) {
    throw new AiFeaturesServiceError('FEATURE_DISABLED', 'This AI feature is disabled')
  }

  try {
    await assertSpendCapAllowsRequest(db)
  }
  catch (e) {
    if (e instanceof AiSpendCapExceededError) {
      throw new AiFeaturesServiceError(
        'SPEND_CAP_EXCEEDED',
        `${e.period === 'daily' ? 'Daily' : 'Monthly'} AI spend cap ($${e.capUsd}) reached`,
      )
    }
    throw e
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
  )).orderBy(asc(appFiles.createdAt))

  const imageFiles = images.filter(f => f.mimeType.startsWith('image/'))
  if (!imageFiles.length) throw new AiFeaturesServiceError('NO_IMAGES', 'No images to extract from')

  // Oldest first so page 1 = front (uploaded first), page 2 = back.
  const fileIds = fileId && imageFiles.some(f => f.id === fileId)
    ? [fileId]
    : imageFiles.map(f => f.id)

  const invoiceSettings = await getInvoiceWorkspaceSettings(db)
  const rules = normalizeServiceLogExtractionRules(invoiceSettings.serviceLogExtractionRules)
  const sheetDocument = await getServiceLogSheetSettings(db)
  const activeSheetItems = flattenActiveSheetItems(sheetDocument)

  const aiJob = await createAiJob(db, {
    jobType: 'service_log_extraction',
    entityType: 'service_log',
    entityId: serviceLogId,
    inputPayload: {
      fileId: fileIds[0],
      fileIds,
      rules,
      complaint: log.complaint,
      internalNotes: log.internalNotes,
      activeSheetItems,
    },
    createdBy: actorId,
  })

  const workerJob = await enqueueJob(db, 'service_log_ai_extraction', {
    aiJobId: aiJob.id,
    serviceLogId,
    fileIds,
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

export async function enqueueInvoiceLineAudit(
  db: Db,
  invoiceId: string,
  actorId: string,
) {
  const { aiJob } = await prepareInvoiceLineAuditJob(db, invoiceId, actorId)

  const workerJob = await enqueueJob(db, 'invoice_description_ai', {
    aiJobId: aiJob.id,
    invoiceId,
    mode: 'line_audit',
  })

  await linkAiJobWorker(db, aiJob.id, workerJob.id)

  return { aiJob, workerJob }
}

/** Run line audit inline (save gate) — does not depend on background worker polling. */
export async function executeInvoiceLineAudit(
  db: Db,
  invoiceId: string,
  actorId: string,
) {
  const { aiJob } = await prepareInvoiceLineAuditJob(db, invoiceId, actorId)
  try {
    const result = await runInvoiceLineAuditJob(db, aiJob.id)
    return { aiJob, ...result }
  }
  catch (e) {
    const normalized = normalizeAiExecutionError(e)
    await markAiJobFailed(db, aiJob.id, normalized.message)
    throw normalized
  }
}

async function prepareInvoiceLineAuditJob(
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

  return { aiJob, invoice }
}

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
  const fileIds = Array.isArray(input.fileIds) && input.fileIds.length
    ? input.fileIds.map(String)
    : input.fileId
      ? [String(input.fileId)]
      : []
  if (!fileIds.length) throw new AiFeaturesServiceError('NO_IMAGES', 'No images to extract from')

  const rules = normalizeServiceLogExtractionRules(String(input.rules ?? ''))
  const activeSheetItems = Array.isArray(input.activeSheetItems)
    ? input.activeSheetItems as Array<{
      id: string
      name: string
      subtext?: string
      price?: string
      sectionTitle?: string
    }>
    : flattenActiveSheetItems(await getServiceLogSheetSettings(db))
  const pageCount = fileIds.length
  const pageExtractions: Array<Record<string, unknown>> = []
  const pageProgress = fileIds.map((id, index) => ({
    pageIndex: index + 1,
    fileId: id,
    pageType: null as string | null,
    status: 'queued',
    message: 'Waiting…',
  }))

  let totalPrompt = 0
  let totalCompletion = 0
  let totalTokens = 0
  let totalCost = 0
  let usedModel = model

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]!
    const pageIndex = i + 1
    const file = await getFileWithData(db, fileId)
    if (!file.mimeType.startsWith('image/')) {
      throw new AiFeaturesServiceError('NO_IMAGES', 'Selected file is not an image')
    }
    const dataUrl = `data:${file.mimeType};base64,${file.binaryData.toString('base64')}`

    pageProgress[i] = {
      ...pageProgress[i]!,
      status: 'classifying',
      message: `Classifying page ${pageIndex} of ${pageCount}…`,
    }
    await updateAiJobProgress(db, aiJobId, {
      progress: {
        phase: 'classifying',
        pageIndex,
        pageCount,
        message: pageProgress[i]!.message,
        pages: pageProgress,
      },
    })

    const classifyResult = await openRouterChat(apiKey, model, [
      { role: 'system', content: buildPageTypeSystemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPageTypeUserPrompt(pageIndex, pageCount) },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ], 'service_log_extraction')

    const classifyParsed = parseOpenRouterJson(classifyResult.content) as {
      pageType?: string
      confidence?: number
    }
    const pageType = normalizePageType(classifyParsed.pageType)
    const confidence = Number(classifyParsed.confidence)
    totalPrompt += classifyResult.promptTokens
    totalCompletion += classifyResult.completionTokens
    totalTokens += classifyResult.totalTokens
    totalCost += Number(classifyResult.estimatedCostUsd || 0)

    const sheetLocked = isSheetLockedPage(pageType) && activeSheetItems.length > 0
    const highCertainty = requiresHighCertaintyLines(pageType)

    pageProgress[i] = {
      ...pageProgress[i]!,
      pageType,
      status: 'extracting',
      message: `Extracting line items from page ${pageIndex} (${pageType === 'printed_form' ? 'printed form' : 'handwritten'})…`,
    }
    await updateAiJobProgress(db, aiJobId, {
      progress: {
        phase: 'extracting',
        pageIndex,
        pageCount,
        pageType,
        message: pageProgress[i]!.message,
        pages: pageProgress,
      },
    })

    const extractResult = await openRouterChat(apiKey, model, [
      {
        role: 'system',
        content: buildExtractionSystemPrompt(rules, pageType, {
          sheetLocked,
          highCertainty,
          activeSheetItems,
        }),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildExtractionUserPrompt(pageIndex, pageCount, pageType, {
              complaint: input.complaint,
              internalNotes: input.internalNotes,
              activeSheetItems,
            }),
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ], 'service_log_extraction')

    const extractParsed = parseOpenRouterJson(extractResult.content) as Record<string, unknown>
    totalPrompt += extractResult.promptTokens
    totalCompletion += extractResult.completionTokens
    totalTokens += extractResult.totalTokens
    totalCost += Number(extractResult.estimatedCostUsd || 0)
    usedModel = extractResult.model

    pageExtractions.push({
      ...extractParsed,
      fileId,
      pageIndex,
      pageType,
      confidence: Number.isFinite(confidence) ? confidence : null,
    })

    pageProgress[i] = {
      ...pageProgress[i]!,
      status: 'done',
      message: `Page ${pageIndex} complete`,
    }
    await updateAiJobProgress(db, aiJobId, {
      progress: {
        phase: i === fileIds.length - 1 ? 'merging' : 'extracting',
        pageIndex,
        pageCount,
        pageType,
        message: i === fileIds.length - 1
          ? 'Merging page results…'
          : `Finished page ${pageIndex} of ${pageCount}`,
        pages: pageProgress,
      },
    })
  }

  const merged = mergeServiceLogPageExtractions(pageExtractions, fileIds[0], { activeSheetItems })
  const parsed = serviceLogExtractionContentSchema.parse(merged)

  await logAiUsage(db, {
    aiJobId,
    featureType: 'service_log_extraction',
    model: usedModel,
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
    totalTokens,
    estimatedCostUsd: Number(totalCost.toFixed(6)),
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
    suggestedContent: {
      ...parsed,
      pageResults: merged.pageResults,
    },
  })

  await updateAiJobStatus(db, aiJobId, 'done', {
    outputPayload: {
      suggestionId: suggestion.id,
      progress: {
        phase: 'done',
        pageIndex: pageCount,
        pageCount,
        message: 'Extraction complete',
        pages: pageProgress,
      },
    },
  })

  return { suggestion, parsed }
}

export async function runInvoiceLineAuditJob(db: Db, aiJobId: string) {
  const job = await getAiJob(db, aiJobId)
  if (!job) throw new AiFeaturesServiceError('NOT_FOUND', 'AI job not found')
  if (job.inputPayload.mode !== 'line_audit') {
    throw new AiFeaturesServiceError('INVALID_CONTENT', 'Not a line audit job')
  }

  const { model } = await assertAiFeatureEnabled(db, 'invoice_description')
  const apiKey = await resolveConfiguredApiKey(db)

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

  const userPrompt = buildLineAuditUserPrompt(complaint, inputLines)

  let result
  try {
    result = await openRouterChat(apiKey, model, [
      { role: 'system', content: buildLineAuditSystemPrompt(rules) },
      { role: 'user', content: userPrompt },
    ], 'invoice_description')
  }
  catch (e) {
    throw normalizeAiExecutionError(e)
  }

  const parsedRaw = parseOpenRouterJson(result.content) as { lines?: Array<Record<string, unknown>> }
  const filtered = normalizeLineAuditResults(inputLines, parsedRaw.lines ?? [])
  const auditContent = invoiceLineAuditContentSchema.parse({
    kind: 'invoice_line_audit',
    checkedAt: new Date().toISOString(),
    lines: filtered,
    summary: {
      totalLines: filtered.length,
      issuesFound: filtered.filter(l => l.status === 'needs_fix').length,
    },
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
