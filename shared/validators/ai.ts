import { z } from 'zod'

export const AI_PROVIDERS = ['openrouter'] as const
export const AI_FEATURE_TYPES = [
  'service_log_extraction',
  'invoice_description',
  'platform_help',
] as const

export const aiProviderSettingsPatchSchema = z.object({
  provider: z.enum(AI_PROVIDERS).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(8).max(512).optional(),
  defaultModel: z.string().trim().min(1).max(200).optional(),
  serviceLogExtractionModel: z.string().trim().min(1).max(200).nullable().optional(),
  invoiceDescriptionModel: z.string().trim().min(1).max(200).nullable().optional(),
  platformHelpModel: z.string().trim().min(1).max(200).nullable().optional(),
  serviceLogExtractionEnabled: z.boolean().optional(),
  invoiceDescriptionEnabled: z.boolean().optional(),
  platformHelpEnabled: z.boolean().optional(),
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
  })).optional(),
  fileId: z.string().uuid().optional(),
})

export type ServiceLogExtractionContent = z.infer<typeof serviceLogExtractionContentSchema>

export const invoiceDescriptionContentSchema = z.object({
  description: z.string().max(500),
  lineItemId: z.string().uuid(),
  originalDescription: z.string().max(500).optional(),
})

export type InvoiceDescriptionContent = z.infer<typeof invoiceDescriptionContentSchema>

export const platformHelpAskSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  pageContext: z.string().trim().min(1).max(120).optional(),
})

export type PlatformHelpAsk = z.infer<typeof platformHelpAskSchema>

export const aiUsageLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  featureType: z.enum(AI_FEATURE_TYPES).optional(),
})

export type AiUsageLogsQuery = z.infer<typeof aiUsageLogsQuerySchema>
