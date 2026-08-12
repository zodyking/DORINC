import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems } from '../db/schema/catalog'
import { invoiceLineItems } from '../db/schema/invoices'
import type { ServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import {
  catalogMatchKey,
  catalogMatchKeyLoose,
  groupCandidatesByClassicSections,
  packSectionsIntoDocument,
  rankSheetDemandCandidates,
  scoreSheetDemandCandidate,
  selectCandidatesForSheetCapacity,
  sheetGenerationFitSummary,
  SHEET_ALLOWED_EXTRA_TITLES,
  SHEET_CLASSIC_SECTIONS,
  type SheetDemandCandidate,
} from '../../shared/service-log-sheet-generate'
import { formatSheetPrice } from './service-log-sheet.service'
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
  type OpenRouterChatResult,
} from './ai-openrouter.service'
import { logAiUsage } from './ai-jobs.service'

export type SheetGenerateErrorCode
  = 'NOT_CONFIGURED' | 'FEATURE_DISABLED' | 'AI_FAILED' | 'SPEND_CAP_EXCEEDED' | 'NO_CANDIDATES'

export class SheetGenerateServiceError extends Error {
  constructor(public readonly code: SheetGenerateErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface SheetGenerateProposal {
  document: ServiceLogSheetDocument
  candidates: SheetDemandCandidate[]
  fit: ReturnType<typeof sheetGenerationFitSummary>
  steps: Array<{ step: string, detail: string }>
  usedAi: boolean
}

async function resolveAi(db: Db): Promise<{ apiKey: string, model: string } | null> {
  try {
    const settings = await getAiProviderSettings(db)
    if (!settings.enabled) return null
    const apiKey = (await getDecryptedApiKey(db))?.trim()
    if (!apiKey) return null
    await assertSpendCapAllowsRequest(db)
    return { apiKey, model: modelForFeature(settings, 'platform_help') }
  }
  catch (err) {
    if (err instanceof AiSpendCapExceededError) {
      throw new SheetGenerateServiceError(
        'SPEND_CAP_EXCEEDED',
        `${err.period === 'daily' ? 'Daily' : 'Monthly'} AI spend cap ($${err.capUsd}) reached`,
      )
    }
    if (err instanceof AiProviderServiceError) return null
    throw err
  }
}

async function recordUsage(
  db: Db,
  usage: OpenRouterChatResult,
  actorId: string | null,
) {
  await logAiUsage(db, {
    featureType: 'platform_help',
    model: usage.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    createdBy: actorId ?? undefined,
  })
}

async function loadDemandCandidates(db: Db): Promise<SheetDemandCandidate[]> {
  const catalogRows = await db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    description: catalogItems.description,
    defaultPrice: catalogItems.defaultPrice,
    itemType: catalogItems.itemType,
    categoryName: catalogCategories.name,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(isNull(catalogItems.archivedAt))
    .orderBy(asc(catalogItems.name))

  if (!catalogRows.length) return []

  const linkedCounts = await db.select({
    catalogItemId: invoiceLineItems.catalogItemId,
    count: sql<number>`count(*)::int`,
  })
    .from(invoiceLineItems)
    .where(sql`${invoiceLineItems.catalogItemId} is not null`)
    .groupBy(invoiceLineItems.catalogItemId)

  const countById = new Map<string, number>()
  for (const row of linkedCounts) {
    if (row.catalogItemId) countById.set(row.catalogItemId, Number(row.count) || 0)
  }

  const unlinked = await db.select({
    description: invoiceLineItems.description,
    count: sql<number>`count(*)::int`,
  })
    .from(invoiceLineItems)
    .where(isNull(invoiceLineItems.catalogItemId))
    .groupBy(invoiceLineItems.description)

  const catalogByLoose = new Map<string, string[]>()
  for (const row of catalogRows) {
    const loose = catalogMatchKeyLoose(row.name) || catalogMatchKey(row.name)
    if (!loose) continue
    const list = catalogByLoose.get(loose) ?? []
    list.push(row.id)
    catalogByLoose.set(loose, list)
  }

  for (const row of unlinked) {
    const loose = catalogMatchKeyLoose(row.description) || catalogMatchKey(row.description)
    if (!loose) continue
    const ids = catalogByLoose.get(loose)
    if (!ids?.length) continue
    const share = Math.ceil(Number(row.count) / ids.length)
    for (const id of ids) {
      countById.set(id, (countById.get(id) ?? 0) + share)
    }
  }

  const candidates: SheetDemandCandidate[] = []
  for (const row of catalogRows) {
    const occurrenceCount = countById.get(row.id) ?? 0
    candidates.push({
      catalogItemId: row.id,
      name: row.name,
      description: row.description,
      price: formatSheetPrice(row.defaultPrice) || '$0',
      itemType: row.itemType,
      categoryName: row.categoryName,
      occurrenceCount,
      score: scoreSheetDemandCandidate({
        occurrenceCount,
        itemType: row.itemType,
      }),
    })
  }

  return rankSheetDemandCandidates(candidates)
}

const ALLOWED_TITLES = new Set<string>([
  ...SHEET_CLASSIC_SECTIONS.map(s => s.title),
  ...SHEET_ALLOWED_EXTRA_TITLES,
])

/**
 * Optional AI polish: only rename section titles to another allowed classic /
 * shop title. Never invent vague labels like "Body" or "Service".
 */
async function aiPolishSectionTitles(
  db: Db,
  apiKey: string,
  model: string,
  sections: Array<{ title: string, itemIds: string[], column: 'left' | 'right' }>,
  itemsById: Map<string, SheetDemandCandidate>,
  actorId: string | null,
): Promise<Array<{ title: string, itemIds: string[], column: 'left' | 'right' }>> {
  const summary = sections.map(section => ({
    title: section.title,
    count: section.itemIds.length,
    sample: section.itemIds.slice(0, 4).map(id => itemsById.get(id)?.name).filter(Boolean),
  }))

  const allowed = [...ALLOWED_TITLES]

  const system = `You refine service-log checklist section titles for a Devon Onsite / bus-shop Letter sheet.
Return JSON only: { "sections": [ { "title": "...", "index": 0 } ] }
Rules:
- Keep the same number of sections and order (index 0..n-1).
- Titles MUST be chosen from this allowed list only: ${JSON.stringify(allowed)}
- Prefer the classic shop names already used (Cleaning, Seats, Lights, Filters, Brakes and Hub Seals, …).
- Never use vague titles like Body, Service, Services, Parts, Labor, Misc, General.
- Do not invent items. Do not merge/split sections.`

  const user = `Improve these section titles only if a better allowed title fits:\n${JSON.stringify(summary)}`

  try {
    const result = await openRouterChat(apiKey, model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 'platform_help')
    await recordUsage(db, result, actorId)

    const parsed = parseOpenRouterJson(result.content) as {
      sections?: Array<{ title?: string, index?: number }>
    }
    const next = sections.map(s => ({ ...s }))
    for (const row of parsed.sections ?? []) {
      const index = Number(row.index)
      const title = String(row.title ?? '').trim()
      if (!Number.isInteger(index) || index < 0 || index >= next.length || !title) continue
      if (!ALLOWED_TITLES.has(title)) continue
      next[index]!.title = title
    }
    return next
  }
  catch (err) {
    if (err instanceof OpenRouterServiceError) {
      // Soft-fail polish — classic titles already applied.
      return sections
    }
    return sections
  }
}

/**
 * Multi-step sheet generation (classic DORINC taxonomy first):
 * 1) Score catalog demand from invoices (include never-billed for backfill)
 * 2) Select a dense capacity-safe set (~28–56 items toward 40 rows)
 * 3) Group into classic Letter sections (Cleaning, Lights, Filters, …)
 * 4) Optional AI title polish within the allowed shop title list
 * 5) Pack left/right with PDF preferred columns + QR void
 */
export async function generateServiceLogSheetProposal(
  db: Db,
  actorId: string | null,
): Promise<SheetGenerateProposal> {
  const steps: Array<{ step: string, detail: string }> = []

  const ranked = await loadDemandCandidates(db)
  const billedCount = ranked.filter(c => c.occurrenceCount > 0).length
  steps.push({
    step: 'score',
    detail: `Ranked ${ranked.length} catalog items (${billedCount} billed) by invoice demand`,
  })

  if (!ranked.length) {
    throw new SheetGenerateServiceError(
      'NO_CANDIDATES',
      'Catalog is empty — add catalog items before generating a sheet',
    )
  }

  if (!billedCount) {
    throw new SheetGenerateServiceError(
      'NO_CANDIDATES',
      'No billed catalog items found yet — bill a few invoice lines from the catalog first',
    )
  }

  const selected = selectCandidatesForSheetCapacity(ranked)
  steps.push({
    step: 'select',
    detail: `Selected ${selected.length} items to densely fill the Letter page with QR space`,
  })

  const itemsById = new Map(selected.map(item => [item.catalogItemId, item]))
  let usedAi = false

  // Primary: classic DORINC section taxonomy (matches the shop PDF).
  let sectionPlan = groupCandidatesByClassicSections(selected)
  steps.push({
    step: 'classic-sections',
    detail: `Grouped into ${sectionPlan.length} classic shop sections (Cleaning, Lights, Filters, …)`,
  })

  const ai = await resolveAi(db)
  if (ai) {
    usedAi = true
    sectionPlan = await aiPolishSectionTitles(
      db,
      ai.apiKey,
      ai.model,
      sectionPlan,
      itemsById,
      actorId,
    )
    steps.push({
      step: 'polish-titles',
      detail: 'AI polished titles within the allowed classic shop list',
    })
  }
  else {
    steps.push({
      step: 'polish-skip',
      detail: 'AI unavailable — kept classic section titles',
    })
  }

  // Merge any duplicate titles after polish.
  const merged = new Map<string, { title: string, itemIds: string[], column: 'left' | 'right' }>()
  for (const section of sectionPlan) {
    const key = section.title.trim().toLowerCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        title: section.title.trim(),
        itemIds: [...section.itemIds],
        column: section.column,
      })
      continue
    }
    for (const id of section.itemIds) {
      if (!existing.itemIds.includes(id)) existing.itemIds.push(id)
    }
  }

  const document = packSectionsIntoDocument([...merged.values()], itemsById)
  const fit = sheetGenerationFitSummary(document)
  steps.push({
    step: 'layout',
    detail: `Packed into left/right columns (${fit.rows}/${fit.targetCapacity} target rows, QR void ${fit.qrVoidRows})`,
  })

  return {
    document,
    candidates: selected,
    fit,
    steps,
    usedAi,
  }
}
