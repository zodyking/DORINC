import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems } from '../db/schema/catalog'
import { invoiceLineItems } from '../db/schema/invoices'
import type { ServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import {
  catalogMatchKey,
  catalogMatchKeyLoose,
  groupCandidatesByCategory,
  packSectionsIntoDocument,
  rankSheetDemandCandidates,
  scoreSheetDemandCandidate,
  selectCandidatesForSheetCapacity,
  sheetGenerationFitSummary,
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
    if (occurrenceCount < 1) continue
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function aiProposeSectionsForBatch(
  db: Db,
  apiKey: string,
  model: string,
  batch: SheetDemandCandidate[],
  actorId: string | null,
): Promise<Array<{ title: string, itemIds: string[] }>> {
  const payload = batch.map(item => ({
    id: item.catalogItemId,
    name: item.name,
    category: item.categoryName,
    type: item.itemType,
    billed: item.occurrenceCount,
  }))

  const system = `You organize auto-repair / bus shop checklist items into simple section titles for a printed service log sheet.
Rules:
- Return JSON only: { "sections": [ { "title": "Lights", "itemIds": ["uuid", ...] } ] }
- Titles must be short, logical shop words (1-3 words). Examples: Cleaning, Seats, Lights, Filters, Brakes, Electrical, Engine.
- Do NOT copy long catalog category names if a simpler title fits.
- Every input id must appear in exactly one section.
- Prefer 2-8 items per section. Merge tiny leftovers into a related section.
- No commentary.`

  const user = `Group these in-demand catalog items into sections:\n${JSON.stringify(payload)}`

  try {
    const result = await openRouterChat(apiKey, model, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 'platform_help')
    await recordUsage(db, result, actorId)

    const parsed = parseOpenRouterJson(result.content) as {
      sections?: Array<{ title?: string, itemIds?: string[] }>
    }
    const validIds = new Set(batch.map(b => b.catalogItemId))
    const sections: Array<{ title: string, itemIds: string[] }> = []
    const used = new Set<string>()

    for (const section of parsed.sections ?? []) {
      const title = String(section.title ?? '').trim()
      if (!title) continue
      const itemIds = (section.itemIds ?? [])
        .map(String)
        .filter(id => validIds.has(id) && !used.has(id))
      for (const id of itemIds) used.add(id)
      if (itemIds.length) sections.push({ title: title.slice(0, 40), itemIds })
    }

    const missing = batch.filter(b => !used.has(b.catalogItemId))
    if (missing.length) {
      for (const group of groupCandidatesByCategory(missing)) sections.push(group)
    }

    return sections
  }
  catch (err) {
    if (err instanceof OpenRouterServiceError) {
      throw new SheetGenerateServiceError('AI_FAILED', err.message)
    }
    throw err
  }
}

async function aiPolishSectionTitles(
  db: Db,
  apiKey: string,
  model: string,
  sections: Array<{ title: string, itemIds: string[] }>,
  itemsById: Map<string, SheetDemandCandidate>,
  actorId: string | null,
): Promise<Array<{ title: string, itemIds: string[] }>> {
  const summary = sections.map(section => ({
    title: section.title,
    count: section.itemIds.length,
    sample: section.itemIds.slice(0, 3).map(id => itemsById.get(id)?.name).filter(Boolean),
  }))

  const system = `You refine service-log checklist section titles only.
Return JSON: { "sections": [ { "title": "...", "index": 0 } ] }
- Keep the same number of sections and the same order (index 0..n-1).
- Titles: short, simple shop language (Cleaning, Seats, Lights, Filters, Brakes…).
- Do not invent items. Do not merge/split sections.`

  const user = `Improve these section titles if needed:\n${JSON.stringify(summary)}`

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
      next[index]!.title = title.slice(0, 40)
    }
    return next
  }
  catch {
    return sections
  }
}

/**
 * Multi-step sheet generation:
 * 1) Score catalog demand from invoices
 * 2) Select capacity-safe candidates
 * 3) Multiple AI calls to propose section titles in batches (fallback: category groups)
 * 4) Optional AI title polish
 * 5) Deterministic left/right pack with QR void reserved
 */
export async function generateServiceLogSheetProposal(
  db: Db,
  actorId: string | null,
): Promise<SheetGenerateProposal> {
  const steps: Array<{ step: string, detail: string }> = []

  const ranked = await loadDemandCandidates(db)
  steps.push({
    step: 'score',
    detail: `Ranked ${ranked.length} catalog items by invoice demand`,
  })

  const selected = selectCandidatesForSheetCapacity(ranked)
  if (!selected.length) {
    throw new SheetGenerateServiceError(
      'NO_CANDIDATES',
      'No billed catalog items found yet — bill a few invoice lines from the catalog first',
    )
  }
  steps.push({
    step: 'select',
    detail: `Selected top ${selected.length} items to fit the Letter page with QR space`,
  })

  const itemsById = new Map(selected.map(item => [item.catalogItemId, item]))
  let usedAi = false
  let sectionPlan: Array<{ title: string, itemIds: string[] }> = []

  const ai = await resolveAi(db)
  if (ai) {
    usedAi = true
    const batches = chunk(selected, 10)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!
      const proposed = await aiProposeSectionsForBatch(db, ai.apiKey, ai.model, batch, actorId)
      sectionPlan.push(...proposed)
      steps.push({
        step: `sections-batch-${i + 1}`,
        detail: `AI grouped ${batch.length} items into ${proposed.length} sections`,
      })
    }

    sectionPlan = await aiPolishSectionTitles(db, ai.apiKey, ai.model, sectionPlan, itemsById, actorId)
    steps.push({
      step: 'polish-titles',
      detail: 'AI polished section titles for short shop language',
    })
  }
  else {
    sectionPlan = groupCandidatesByCategory(selected)
    steps.push({
      step: 'sections-fallback',
      detail: 'AI unavailable — grouped by catalog category names',
    })
  }

  const merged = new Map<string, { title: string, itemIds: string[] }>()
  for (const section of sectionPlan) {
    const key = section.title.trim().toLowerCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { title: section.title.trim(), itemIds: [...section.itemIds] })
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
    detail: `Packed into left/right columns (${fit.rows}/${fit.capacity} rows, QR void ${fit.qrVoidRows})`,
  })

  return {
    document,
    candidates: selected,
    fit,
    steps,
    usedAi,
  }
}
