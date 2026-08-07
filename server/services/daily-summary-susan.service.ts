import { AI_ASSISTANT_NAME, AI_ASSISTANT_TITLE } from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import type { Db } from '../db/client'
import {
  openRouterChat,
  parseOpenRouterJson,
  OpenRouterServiceError,
} from './ai-openrouter.service'
import { logAiUsage } from './ai-jobs.service'
import {
  assertSpendCapAllowsRequest,
  ensureAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
} from './ai-provider.service'
export interface SusanInsightSection {
  id: string
  title: string
  stats: Array<{ label: string, value: string }>
  table: { headers: string[], rows: string[][] } | null
  insight: string
}

const INSIGHT_TIMEOUT_MS = 12_000

const SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the AI assistant for ${BRAND_NAME} (Devon On Site Repairs).`,
  'Managers are reading a daily ops summary email. For one section, write a short note that feels like a helpful colleague.',
  '',
  'Rules:',
  '- One or two sentences only',
  '- Sound human and practical; avoid dashboard-bot phrasing',
  '- Use the provided facts only; do not invent numbers or events',
  '- Prefer dollar amounts with $ and commas when you mention money',
  '- No em dashes, no bullet lists, no surrounding quotation marks',
  '- Do not start with "Note:" or your own name',
  '- Return JSON only: {"insight":"..."}',
].join('\n')

function buildUserPrompt(section: SusanInsightSection): string {
  const stats = (section.stats || [])
    .map(s => `${s.label}: ${s.value}`)
    .join(' · ')
  const tablePreview = section.table?.rows?.length
    ? section.table.rows
      .slice(0, 6)
      .map(row => row.filter(Boolean).join(' | '))
      .join('\n')
    : ''

  return [
    `Section: ${section.title}`,
    stats ? `Stats: ${stats}` : '',
    tablePreview ? `Details:\n${tablePreview}` : '',
    section.insight ? `Draft for context (rewrite in your own voice; improve if needed):\n${section.insight}` : '',
    'Write the final manager-facing insight now.',
  ].filter(Boolean).join('\n\n')
}

export function parseSusanInsightResponse(content: string, fallback: string): string {
  try {
    const json = parseOpenRouterJson(content)
    const insight = typeof json.insight === 'string' ? json.insight.trim() : ''
    if (!insight) return fallback
    return insight
      .replace(/\s*—\s*/g, '. ')
      .replace(/\s+/g, ' ')
      .replace(/^["“]|["”]$/g, '')
      .trim() || fallback
  }
  catch {
    const plain = String(content || '')
      .replace(/```(?:json)?/gi, '')
      .replace(/[{}"]/g, ' ')
      .replace(/insight\s*:/i, '')
      .replace(/\s*—\s*/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
    // Reject tiny/non-sentence leftovers from failed JSON parses.
    if (!plain || plain.split(/\s+/).length < 5) return fallback
    return plain
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Susan insight timed out')), ms)
    }),
  ])
}

async function generateOneInsight(
  db: Db,
  opts: {
    apiKey: string
    model: string
    section: SusanInsightSection
    createdBy?: string | null
  },
): Promise<string> {
  const fallback = opts.section.insight
  const result = await withTimeout(
    openRouterChat(
      opts.apiKey,
      opts.model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(opts.section) },
      ],
      'daily_summary',
    ),
    INSIGHT_TIMEOUT_MS,
  )

  await logAiUsage(db, {
    featureType: 'daily_summary',
    model: result.model || opts.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: opts.createdBy ?? undefined,
  })

  return parseSusanInsightResponse(result.content, fallback)
}

/**
 * Replace templated section notes with live Susan AI insights (one call per section).
 * Non-Susan sections run first (in parallel). Optional `refreshSusanSection` can update
 * the usage block with post-call totals before Susan writes that note.
 * Falls back to drafted copy when AI is unavailable or a call fails.
 */
export async function applySusanDailyInsights(
  db: Db,
  sections: SusanInsightSection[],
  opts: {
    createdBy?: string | null
    refreshSusanSection?: (sections: SusanInsightSection[]) => Promise<SusanInsightSection | null> | SusanInsightSection | null
  } = {},
): Promise<{ sections: SusanInsightSection[], generated: number, failed: number }> {
  if (!sections.length) {
    return { sections, generated: 0, failed: 0 }
  }

  const settings = await ensureAiProviderSettings(db)
  if (!settings.enabled || !settings.hasApiKey) {
    return { sections, generated: 0, failed: 0 }
  }

  try {
    await assertSpendCapAllowsRequest(db)
  }
  catch {
    console.warn('[daily-summary] Susan insights skipped: spend cap reached')
    return { sections, generated: 0, failed: 0 }
  }

  let apiKey: string | null = null
  try {
    apiKey = await getDecryptedApiKey(db)
  }
  catch (err) {
    console.warn('[daily-summary] Susan insights skipped:', err instanceof Error ? err.message : err)
    return { sections, generated: 0, failed: 0 }
  }
  if (!apiKey) return { sections, generated: 0, failed: 0 }

  const model = modelForFeature(settings, 'daily_summary')
  let generated = 0
  let failed = 0

  const firstPass = sections.filter(s => s.id !== 'susan')
  const firstResults = await Promise.all(firstPass.map(async (section) => {
    try {
      const insight = await generateOneInsight(db, {
        apiKey: apiKey!,
        model,
        section,
        createdBy: opts.createdBy,
      })
      generated += 1
      return { id: section.id, insight }
    }
    catch (err) {
      failed += 1
      const message = err instanceof OpenRouterServiceError || err instanceof Error
        ? err.message
        : 'unknown error'
      console.warn(`[daily-summary] Susan insight failed for ${section.id}:`, message)
      return { id: section.id, insight: section.insight }
    }
  }))

  const byId = new Map(firstResults.map(r => [r.id, r.insight]))
  let next = sections.map(section => (
    section.id === 'susan'
      ? section
      : { ...section, insight: byId.get(section.id) ?? section.insight }
  ))

  let susan = next.find(s => s.id === 'susan') ?? null
  if (susan && opts.refreshSusanSection) {
    const refreshed = await opts.refreshSusanSection(next)
    if (refreshed) {
      next = next.map(s => (s.id === 'susan' ? refreshed : s))
      susan = refreshed
    }
  }

  if (susan) {
    try {
      const insight = await generateOneInsight(db, {
        apiKey,
        model,
        section: susan,
        createdBy: opts.createdBy,
      })
      generated += 1
      next = next.map(s => (s.id === 'susan' ? { ...s, insight } : s))
    }
    catch (err) {
      failed += 1
      console.warn(
        '[daily-summary] Susan insight failed for susan:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return { sections: next, generated, failed }
}

export { AI_ASSISTANT_TITLE }
