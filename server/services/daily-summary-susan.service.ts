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

export interface SusanInsightRunResult {
  sections: SusanInsightSection[]
  generated: number
  failed: number
  skippedReason: string | null
}

const INSIGHT_TIMEOUT_MS = 20_000

const SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the AI assistant for ${BRAND_NAME} (Devon On Site Repairs).`,
  'Managers are reading a daily ops summary email. For ONE section, write a short note that feels like a helpful colleague.',
  '',
  'Rules:',
  '- One or two sentences only',
  '- Sound human and practical; avoid dashboard-bot phrasing',
  '- Use the provided facts only; do not invent numbers or events',
  '- Prefer dollar amounts with $ and commas when you mention money',
  '- No em dashes, no bullet lists, no surrounding quotation marks',
  '- Do not start with "Note:" or your own name',
  '- Prefer JSON: {"insight":"..."} — plain text is also OK',
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
    section.insight ? `Draft for context (rewrite in your own voice):\n${section.insight}` : '',
    'Write the final manager-facing insight now.',
  ].filter(Boolean).join('\n\n')
}

export function parseSusanInsightResponse(content: string, fallback: string): string {
  const cleaned = String(content || '').trim()
  if (!cleaned) return fallback

  try {
    const json = parseOpenRouterJson(cleaned)
    const insight = typeof json.insight === 'string' ? json.insight.trim() : ''
    if (insight) {
      return insight
        .replace(/\s*—\s*/g, '. ')
        .replace(/\s+/g, ' ')
        .replace(/^["“]|["”]$/g, '')
        .trim() || fallback
    }
  }
  catch {
    // fall through to plain text
  }

  const plain = cleaned
    .replace(/```(?:json)?/gi, '')
    .replace(/^\s*\{[\s\S]*"insight"\s*:\s*"/i, '')
    .replace(/"\s*\}\s*$/i, '')
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/^["“]|["”]$/g, '')
    .trim()

  if (!plain || plain.split(/\s+/).length < 5) return fallback
  return plain
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

  // Prefer free-text (same path that works for help chat). Fall back to JSON mode once.
  let result
  try {
    result = await withTimeout(
      openRouterChat(
        opts.apiKey,
        opts.model,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(opts.section) },
        ],
        'daily_summary',
        { responseFormat: 'text', temperature: 0.55 },
      ),
      INSIGHT_TIMEOUT_MS,
    )
  }
  catch (firstErr) {
    result = await withTimeout(
      openRouterChat(
        opts.apiKey,
        opts.model,
        [
          { role: 'system', content: `${SYSTEM_PROMPT}\nReturn JSON only: {"insight":"..."}` },
          { role: 'user', content: buildUserPrompt(opts.section) },
        ],
        'daily_summary',
        { responseFormat: 'json', temperature: 0.55 },
      ),
      INSIGHT_TIMEOUT_MS,
    )
    if (!result) throw firstErr
  }

  try {
    await logAiUsage(db, {
      featureType: 'daily_summary',
      model: result.model || opts.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      createdBy: opts.createdBy ?? undefined,
    })
  }
  catch (usageErr) {
    console.error(
      '[daily-summary] usage log failed:',
      usageErr instanceof Error ? usageErr.message : usageErr,
    )
  }

  return parseSusanInsightResponse(result.content, fallback)
}

/**
 * Replace templated section notes with live Susan AI insights.
 * One dedicated OpenRouter call per section, awaited before send.
 */
export async function applySusanDailyInsights(
  db: Db,
  sections: SusanInsightSection[],
  opts: {
    createdBy?: string | null
    refreshSusanSection?: (sections: SusanInsightSection[]) => Promise<SusanInsightSection | null> | SusanInsightSection | null
  } = {},
): Promise<SusanInsightRunResult> {
  if (!sections.length) {
    return { sections, generated: 0, failed: 0, skippedReason: null }
  }

  const settings = await ensureAiProviderSettings(db)
  if (!settings.enabled) {
    return {
      sections,
      generated: 0,
      failed: 0,
      skippedReason: 'AI is disabled in Control Panel → Susan',
    }
  }
  if (!settings.hasApiKey) {
    return {
      sections,
      generated: 0,
      failed: 0,
      skippedReason: 'OpenRouter API key is not configured',
    }
  }

  try {
    await assertSpendCapAllowsRequest(db)
  }
  catch {
    return {
      sections,
      generated: 0,
      failed: 0,
      skippedReason: 'AI spend cap reached',
    }
  }

  let apiKey: string
  try {
    const decrypted = await getDecryptedApiKey(db)
    if (!decrypted) {
      return {
        sections,
        generated: 0,
        failed: 0,
        skippedReason: 'OpenRouter API key is missing',
      }
    }
    apiKey = decrypted
  }
  catch (err) {
    return {
      sections,
      generated: 0,
      failed: 0,
      skippedReason: err instanceof Error ? err.message : 'Could not decrypt OpenRouter API key',
    }
  }

  const model = modelForFeature(settings, 'daily_summary')
  let generated = 0
  let failed = 0
  let next = [...sections]

  // Sequential calls so each section gets a dedicated response before send.
  const firstPass = next.filter(s => s.id !== 'susan')
  for (const section of firstPass) {
    try {
      const insight = await generateOneInsight(db, {
        apiKey,
        model,
        section,
        createdBy: opts.createdBy,
      })
      generated += 1
      next = next.map(s => (s.id === section.id ? { ...s, insight } : s))
    }
    catch (err) {
      failed += 1
      const message = err instanceof OpenRouterServiceError || err instanceof Error
        ? err.message
        : 'unknown error'
      console.warn(`[daily-summary] Susan insight failed for ${section.id}:`, message)
    }
  }

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

  return {
    sections: next,
    generated,
    failed,
    skippedReason: generated === 0 && failed > 0
      ? `Susan calls failed (${failed})`
      : null,
  }
}

export { AI_ASSISTANT_TITLE }
