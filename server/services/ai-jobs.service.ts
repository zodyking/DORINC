import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  aiJobs,
  aiSuggestions,
  aiUsageLogs,
  type AiFeatureType,
  type AiJobStatus,
  type AiSuggestionStatus,
} from '../db/schema/ai'
import type { AiJobCreate, AiSuggestionCreate, AiUsageLogCreate, AiUsageLogsQuery } from '../../shared/validators/ai'
import { getDailyUsageCost } from './ai-provider.service'

export interface AiJobView {
  id: string
  jobType: AiFeatureType
  entityType: string
  entityId: string
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown> | null
  status: AiJobStatus
  workerJobId: string | null
  attempts: number
  lastError: string | null
  createdAt: Date
  createdBy: string | null
}

export interface AiSuggestionView {
  id: string
  aiJobId: string
  featureType: AiFeatureType
  entityType: string
  entityId: string
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
  status: AiSuggestionStatus
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  createdAt: Date
}

export interface AiUsageSummary {
  monthStart: string
  totalRuns: number
  byFeature: Record<AiFeatureType, number>
  approvedSuggestions: number
  estimatedCostUsd: number
  dailyCostUsd: number
}

export interface AiUsageLogView {
  id: string
  featureType: AiFeatureType
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  provider: string
  createdAt: Date
  createdBy: string | null
}

export async function createAiJob(db: Db, input: AiJobCreate): Promise<AiJobView> {
  const [row] = await db.insert(aiJobs).values({
    jobType: input.jobType,
    entityType: input.entityType,
    entityId: input.entityId,
    inputPayload: input.inputPayload,
    createdBy: input.createdBy ?? null,
  }).returning()

  return row as AiJobView
}

export async function createAiSuggestion(db: Db, input: AiSuggestionCreate): Promise<AiSuggestionView> {
  const [row] = await db.insert(aiSuggestions).values({
    aiJobId: input.aiJobId,
    featureType: input.featureType,
    entityType: input.entityType,
    entityId: input.entityId,
    originalContent: input.originalContent ?? null,
    suggestedContent: input.suggestedContent,
  }).returning()

  return row as AiSuggestionView
}

export async function logAiUsage(db: Db, input: AiUsageLogCreate): Promise<{ id: string }> {
  const totalTokens = input.totalTokens ?? (input.promptTokens + input.completionTokens)
  const [row] = await db.insert(aiUsageLogs).values({
    aiJobId: input.aiJobId ?? null,
    featureType: input.featureType,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    estimatedCostUsd: String(input.estimatedCostUsd),
    provider: input.provider,
    createdBy: input.createdBy ?? null,
  }).returning({ id: aiUsageLogs.id })

  return { id: row!.id }
}

export async function getAiUsageSummary(db: Db, month = new Date()): Promise<AiUsageSummary> {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))

  const [usage] = await db.select({
    totalRuns: sql<number>`count(*)::int`,
    estimatedCostUsd: sql<string>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)`,
  }).from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, monthStart),
      lt(aiUsageLogs.createdAt, monthEnd),
    ))

  const featureRows = await db.select({
    featureType: aiUsageLogs.featureType,
    count: sql<number>`count(*)::int`,
  }).from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, monthStart),
      lt(aiUsageLogs.createdAt, monthEnd),
    ))
    .groupBy(aiUsageLogs.featureType)

  const byFeature: Record<AiFeatureType, number> = {
    service_log_extraction: 0,
    invoice_description: 0,
    platform_help: 0,
  }
  for (const row of featureRows) {
    byFeature[row.featureType] = row.count
  }

  const [approved] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(aiSuggestions)
    .where(and(
      eq(aiSuggestions.status, 'accepted'),
      gte(aiSuggestions.reviewedAt, monthStart),
      lt(aiSuggestions.reviewedAt, monthEnd),
    ))

  const dailyCostUsd = await getDailyUsageCost(db, month)

  return {
    monthStart: monthStart.toISOString(),
    totalRuns: usage?.totalRuns ?? 0,
    byFeature,
    approvedSuggestions: approved?.count ?? 0,
    estimatedCostUsd: Number(usage?.estimatedCostUsd ?? 0),
    dailyCostUsd,
  }
}

export async function listAiUsageLogs(db: Db, query: AiUsageLogsQuery): Promise<{
  items: AiUsageLogView[]
  total: number
}> {
  const conditions = query.featureType
    ? eq(aiUsageLogs.featureType, query.featureType)
    : undefined

  const [countRow] = await db.select({
    total: sql<number>`count(*)::int`,
  }).from(aiUsageLogs)
    .where(conditions)

  const rows = await db.select({
    id: aiUsageLogs.id,
    featureType: aiUsageLogs.featureType,
    model: aiUsageLogs.model,
    promptTokens: aiUsageLogs.promptTokens,
    completionTokens: aiUsageLogs.completionTokens,
    totalTokens: aiUsageLogs.totalTokens,
    estimatedCostUsd: aiUsageLogs.estimatedCostUsd,
    provider: aiUsageLogs.provider,
    createdAt: aiUsageLogs.createdAt,
    createdBy: aiUsageLogs.createdBy,
  }).from(aiUsageLogs)
    .where(conditions)
    .orderBy(desc(aiUsageLogs.createdAt))
    .limit(query.limit)
    .offset(query.offset)

  return {
    items: rows.map(row => ({
      ...row,
      estimatedCostUsd: Number(row.estimatedCostUsd),
    })),
    total: countRow?.total ?? 0,
  }
}

export async function updateAiJobStatus(
  db: Db,
  jobId: string,
  status: AiJobStatus,
  patch?: { outputPayload?: Record<string, unknown>, lastError?: string | null, workerJobId?: string },
): Promise<void> {
  await db.update(aiJobs).set({
    status,
    outputPayload: patch?.outputPayload,
    lastError: patch?.lastError ?? undefined,
    workerJobId: patch?.workerJobId,
    finishedAt: status === 'done' || status === 'failed' ? new Date() : undefined,
    startedAt: status === 'processing' ? new Date() : undefined,
  }).where(eq(aiJobs.id, jobId))
}

export async function linkAiJobWorker(db: Db, jobId: string, workerJobId: string): Promise<void> {
  await db.update(aiJobs).set({ workerJobId }).where(eq(aiJobs.id, jobId))
}

export async function getAiJob(db: Db, jobId: string): Promise<AiJobView | null> {
  const [row] = await db.select().from(aiJobs).where(eq(aiJobs.id, jobId))
  return row ? row as AiJobView : null
}

export async function listAiSuggestionsForEntity(
  db: Db,
  entityType: string,
  entityId: string,
  opts: { status?: AiSuggestionStatus, featureType?: AiFeatureType } = {},
): Promise<AiSuggestionView[]> {
  const conditions = [
    eq(aiSuggestions.entityType, entityType),
    eq(aiSuggestions.entityId, entityId),
  ]
  if (opts.status) conditions.push(eq(aiSuggestions.status, opts.status))
  if (opts.featureType) conditions.push(eq(aiSuggestions.featureType, opts.featureType))

  const rows = await db.select().from(aiSuggestions)
    .where(and(...conditions))
    .orderBy(desc(aiSuggestions.createdAt))

  return rows as AiSuggestionView[]
}

export async function getAiSuggestion(db: Db, id: string): Promise<AiSuggestionView | null> {
  const [row] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id))
  return row ? row as AiSuggestionView : null
}

export async function updateAiSuggestionReview(
  db: Db,
  id: string,
  status: AiSuggestionStatus,
  reviewedBy: string,
  reviewNotes?: string | null,
): Promise<AiSuggestionView> {
  const [row] = await db.update(aiSuggestions).set({
    status,
    reviewedBy,
    reviewedAt: new Date(),
    reviewNotes: reviewNotes ?? null,
  }).where(eq(aiSuggestions.id, id)).returning()

  return row as AiSuggestionView
}
