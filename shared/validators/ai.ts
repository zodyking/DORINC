import { z } from 'zod'

export const AI_PROVIDERS = ['openrouter'] as const
export const AI_FEATURE_TYPES = [
  'service_log_extraction',
  'invoice_description',
  'platform_help',
  'daily_summary',
  'ai_administrator',
] as const

export const aiProviderSettingsPatchSchema = z.object({
  provider: z.enum(AI_PROVIDERS).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(8).max(512).optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  serviceLogExtractionModel: z.string().trim().min(1).max(200).nullable().optional(),
  invoiceDescriptionModel: z.string().trim().min(1).max(200).nullable().optional(),
  platformHelpModel: z.string().trim().min(1).max(200).nullable().optional(),
  aiAdministratorModel: z.string().trim().min(1).max(200).nullable().optional(),
  serviceLogExtractionEnabled: z.boolean().optional(),
  invoiceDescriptionEnabled: z.boolean().optional(),
  platformHelpEnabled: z.boolean().optional(),
  aiAdministratorEnabled: z.boolean().optional(),
  dailySpendCapUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  monthlySpendCapUsd: z.number().min(0).max(1_000_000).nullable().optional(),
})

export type AiProviderSettingsPatch = z.infer<typeof aiProviderSettingsPatchSchema>

export const aiJobCreateSchema = z.object({
  jobType: z.enum(AI_FEATURE_TYPES),
  entityType: z.string().trim().min(1).max(64),
  entityId: z.string().uuid(),
  inputPayload: z.record(z.string(), z.unknown()),
  createdBy: z.string().uuid().optional(),
})

export type AiJobCreate = z.infer<typeof aiJobCreateSchema>

export const aiSuggestionCreateSchema = z.object({
  aiJobId: z.string().uuid(),
  featureType: z.enum(AI_FEATURE_TYPES),
  entityType: z.string().trim().min(1).max(64),
  entityId: z.string().uuid(),
  originalContent: z.record(z.string(), z.unknown()).nullable().optional(),
  suggestedContent: z.record(z.string(), z.unknown()),
})

export type AiSuggestionCreate = z.infer<typeof aiSuggestionCreateSchema>

export const aiUsageLogCreateSchema = z.object({
  aiJobId: z.string().uuid().optional(),
  featureType: z.enum(AI_FEATURE_TYPES),
  model: z.string().trim().min(1).max(200),
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).optional(),
  estimatedCostUsd: z.number().min(0).default(0),
  provider: z.enum(AI_PROVIDERS).default('openrouter'),
  createdBy: z.string().uuid().optional(),
})

export type AiUsageLogCreate = z.infer<typeof aiUsageLogCreateSchema>

export const serviceLogExtractRequestSchema = z.object({
  fileId: z.string().uuid().optional(),
})

export type ServiceLogExtractRequest = z.infer<typeof serviceLogExtractRequestSchema>

export const aiSuggestionReviewSchema = z.object({
  action: z.enum(['accept', 'edit', 'reject']),
  content: z.record(z.string(), z.unknown()).optional(),
  reviewNotes: z.string().max(2000).nullish(),
  /** Invoice line id when accepting invoice_description suggestions. */
  lineItemId: z.string().uuid().optional(),
})

export type AiSuggestionReview = z.infer<typeof aiSuggestionReviewSchema>

/** Extracted service log fields returned by OpenRouter (SPEC §10). */
export const serviceLogExtractionContentSchema = z.object({
  complaint: z.string().max(10000).nullish(),
  internalNotes: z.string().max(10000).nullish(),
  draftLineItems: z.array(z.object({
    description: z.string().max(500),
    qty: z.string().max(30).nullish(),
    rate: z.string().max(30).nullish(),
    amount: z.string().max(30).nullish(),
    confidence: z.number().min(0).max(1).nullish(),
    matchedSheetItemId: z.string().max(120).nullish(),
    sourcePageIndex: z.number().int().min(1).max(20).nullish(),
    sourceFileId: z.string().uuid().nullish(),
    pageType: z.string().max(40).nullish(),
    checkMark: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }).nullish(),
  })).optional(),
  /** Flattened checkmark overlays for invoice/service-log photo viewers. */
  checkMarks: z.array(z.object({
    fileId: z.string().uuid(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    description: z.string().max(500).optional(),
    matchedSheetItemId: z.string().max(120).nullish(),
    confidence: z.number().min(0).max(1).nullish(),
  })).optional(),
  fileId: z.string().uuid().optional(),
  pageResults: z.array(z.object({
    pageIndex: z.number().int().min(1).optional(),
    fileId: z.string().uuid().nullable().optional(),
    pageType: z.string().max(40).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })).optional(),
})

export type ServiceLogExtractionContent = z.infer<typeof serviceLogExtractionContentSchema>

export const invoiceDescriptionContentSchema = z.object({
  description: z.string().max(500),
  lineItemId: z.string().uuid(),
  originalDescription: z.string().max(500).optional(),
})

export type InvoiceDescriptionContent = z.infer<typeof invoiceDescriptionContentSchema>

export const invoiceLineAuditFieldSchema = z.object({
  description: z.string().max(500),
  quantity: z.string().max(30),
  unitPrice: z.string().max(30),
})

export const invoiceLineAuditLineSchema = z.object({
  lineItemId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
  lineType: z.enum(['part', 'labor', 'fee']),
  status: z.enum(['ok', 'needs_fix']),
  issues: z.array(z.string().max(500)).max(20),
  original: invoiceLineAuditFieldSchema,
  suggested: invoiceLineAuditFieldSchema.nullable(),
})

export const invoiceLineAuditContentSchema = z.object({
  kind: z.literal('invoice_line_audit'),
  checkedAt: z.string().max(40),
  lines: z.array(invoiceLineAuditLineSchema).max(200),
  summary: z.object({
    totalLines: z.number().int().min(0),
    issuesFound: z.number().int().min(0),
  }),
})

export type InvoiceLineAuditContent = z.infer<typeof invoiceLineAuditContentSchema>

export const invoiceLineAuditReviewSchema = z.object({
  suggestionId: z.string().uuid(),
  decisions: z.array(z.object({
    lineItemId: z.string().uuid(),
    action: z.enum(['accept', 'reject']),
  })).min(1).max(200),
})

export type InvoiceLineAuditReview = z.infer<typeof invoiceLineAuditReviewSchema>

export const platformHelpHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
})

function sanitizePlatformHelpHistory(
  history: z.infer<typeof platformHelpHistoryMessageSchema>[] | undefined,
) {
  if (!history?.length) return undefined
  const trimmed = history
    .map(row => ({
      role: row.role,
      content: row.content.trim().slice(0, 4000),
    }))
    .filter(row => row.content.length > 0)
    .slice(-40)
  return trimmed.length ? trimmed : undefined
}

const platformHelpHistoryInputSchema = z.preprocess(
  (val) => {
    if (!Array.isArray(val)) return val
    return val
      .map((row: unknown) => {
        if (!row || typeof row !== 'object') return row
        const item = row as { role?: string, content?: string }
        return {
          role: item.role,
          content: typeof item.content === 'string' ? item.content.trim().slice(0, 4000) : item.content,
        }
      })
      .filter((row: { content?: string }) => typeof row.content === 'string' && row.content.length > 0)
      .slice(-40)
  },
  z.array(platformHelpHistoryMessageSchema).max(40).optional(),
)

const platformHelpImageDataUrlSchema = z.string().regex(
  /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-z0-9+/=]+$/i,
  'Invalid image attachment',
).max(6_000_000)

export const platformHelpAskSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  pageContext: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() ? val.trim() : undefined),
    z.string().trim().min(1).max(120).optional(),
  ),
  history: platformHelpHistoryInputSchema,
  /** Base64 data URL screenshot for vision-capable platform help models. */
  imageDataUrl: platformHelpImageDataUrlSchema.optional(),
  /** Multiple screenshots for vision-capable platform help models. */
  imageDataUrls: z.array(platformHelpImageDataUrlSchema).min(1).max(4).optional(),
}).transform((body) => {
  const imageDataUrls = body.imageDataUrls?.length
    ? body.imageDataUrls
    : body.imageDataUrl
      ? [body.imageDataUrl]
      : undefined
  return {
    question: body.question,
    pageContext: body.pageContext,
    history: sanitizePlatformHelpHistory(body.history),
    imageDataUrls,
  }
})

export type PlatformHelpAsk = z.infer<typeof platformHelpAskSchema>

export const aiUsageLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  featureType: z.enum(AI_FEATURE_TYPES).optional(),
})

export type AiUsageLogsQuery = z.infer<typeof aiUsageLogsQuerySchema>
