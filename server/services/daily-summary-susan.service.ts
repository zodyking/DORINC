import { AI_ASSISTANT_NAME, AI_ASSISTANT_TITLE } from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import type { Db } from '../db/client'
import {
  isOpenRouterAuthErrorMessage,
  openRouterAuthRecoveryMessage,
} from '../../shared/openrouter-auth'
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
import { fetchOpenRouterKeyUsage } from './openrouter-billing.service'

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
  lastError: string | null
}

export interface SusanClientReady {
  apiKey: string
  model: string
}

const INSIGHT_TIMEOUT_MS = 25_000
const BETWEEN_CALL_DELAY_MS = 1_200

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Susan insight timed out')), ms)
      }),
    ])
  }
  finally {
    if (timer) clearTimeout(timer)
  }
}

/** Resolve OpenRouter credentials once so progressive UI steps reuse them. */
export async function prepareSusanClient(db: Db): Promise<
  | { ok: true, client: SusanClientReady }
  | { ok: false, reason: string }
> {
  const settings = await ensureAiProviderSettings(db)
  if (!settings.enabled) {
    return { ok: false, reason: 'AI is disabled in Control Panel → Susan' }
  }
  if (!settings.hasApiKey) {
    return { ok: false, reason: 'OpenRouter API key is not configured' }
  }

  try {
    await assertSpendCapAllowsRequest(db)
  }
  catch {
    return { ok: false, reason: 'AI spend cap reached' }
  }

  try {
    const apiKey = await getDecryptedApiKey(db)
    if (!apiKey) return { ok: false, reason: 'OpenRouter API key is missing' }
    const model = modelForFeature(settings, 'daily_summary')
    if (!model?.trim()) {
      return { ok: false, reason: 'OpenRouter model is not configured in Control Panel → AI' }
    }

    // Probe the key before running N section calls so operators see one clear auth error.
    try {
      await fetchOpenRouterKeyUsage(apiKey)
    }
    catch (probeErr) {
      const message = probeErr instanceof Error ? probeErr.message : 'OpenRouter auth probe failed'
      return {
        ok: false,
        reason: isOpenRouterAuthErrorMessage(message) || message.includes('OpenRouter authentication')
          ? openRouterAuthRecoveryMessage()
          : message,
      }
    }

    return {
      ok: true,
      client: {
        apiKey,
        model,
      },
    }
  }
  catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Could not decrypt OpenRouter API key',
    }
  }
}

export async function generateSusanSectionInsight(
  db: Db,
  opts: {
    client: SusanClientReady
    section: SusanInsightSection
    createdBy?: string | null
  },
): Promise<{ insight: string, error: string | null }> {
  const fallback = opts.section.insight
  let result
  let lastError: string | null = null

  try {
    result = await withTimeout(
      openRouterChat(
        opts.client.apiKey,
        opts.client.model,
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
    lastError = firstErr instanceof Error ? firstErr.message : 'Susan text call failed'
    try {
      result = await withTimeout(
        openRouterChat(
          opts.client.apiKey,
          opts.client.model,
          [
            { role: 'system', content: `${SYSTEM_PROMPT}\nReturn JSON only: {"insight":"..."}` },
            { role: 'user', content: buildUserPrompt(opts.section) },
          ],
          'daily_summary',
          { responseFormat: 'json', temperature: 0.55 },
        ),
        INSIGHT_TIMEOUT_MS,
      )
      lastError = null
    }
    catch (secondErr) {
      const message = secondErr instanceof Error ? secondErr.message : lastError
      const errText = message || 'Susan call failed'
      return {
        insight: fallback,
        error: isOpenRouterAuthErrorMessage(errText)
          ? openRouterAuthRecoveryMessage()
          : errText,
      }
    }
  }

  try {
    await logAiUsage(db, {
      featureType: 'daily_summary',
      model: result.model || opts.client.model,
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

  return {
    insight: parseSusanInsightResponse(result.content, fallback),
    error: lastError,
  }
}

/**
 * Replace templated section notes with live Susan AI insights.
 * Strictly one OpenRouter call at a time, with a short pause between sections.
 */
export async function applySusanDailyInsights(
  db: Db,
  sections: SusanInsightSection[],
  opts: {
    createdBy?: string | null
    refreshSusanSection?: (sections: SusanInsightSection[]) => Promise<SusanInsightSection | null> | SusanInsightSection | null
    onProgress?: (event: {
      sectionId: string
      title: string
      index: number
      total: number
      status: 'start' | 'done' | 'error'
      error?: string | null
    }) => void | Promise<void>
  } = {},
): Promise<SusanInsightRunResult> {
  if (!sections.length) {
    return { sections, generated: 0, failed: 0, skippedReason: null, lastError: null }
  }

  const prepared = await prepareSusanClient(db)
  if (!prepared.ok) {
    return {
      sections,
      generated: 0,
      failed: 0,
      skippedReason: prepared.reason,
      lastError: prepared.reason,
    }
  }

  const { client } = prepared
  let generated = 0
  let failed = 0
  let lastError: string | null = null
  let next = [...sections]

  const queue = [
    ...next.filter(s => s.id !== 'susan'),
    ...next.filter(s => s.id === 'susan'),
  ]
  const total = queue.length

  for (let index = 0; index < queue.length; index += 1) {
    let section = queue[index]!
    if (section.id === 'susan' && opts.refreshSusanSection) {
      const refreshed = await opts.refreshSusanSection(next)
      if (refreshed) {
        next = next.map(s => (s.id === 'susan' ? refreshed : s))
        section = refreshed
      }
    }

    await opts.onProgress?.({
      sectionId: section.id,
      title: section.title,
      index: index + 1,
      total,
      status: 'start',
    })

    try {
      const { insight, error } = await generateSusanSectionInsight(db, {
        client,
        section,
        createdBy: opts.createdBy,
      })
      if (error && insight === section.insight) {
        failed += 1
        lastError = error
        await opts.onProgress?.({
          sectionId: section.id,
          title: section.title,
          index: index + 1,
          total,
          status: 'error',
          error,
        })
      }
      else {
        generated += 1
        next = next.map(s => (s.id === section.id ? { ...s, insight } : s))
        await opts.onProgress?.({
          sectionId: section.id,
          title: section.title,
          index: index + 1,
          total,
          status: 'done',
        })
      }
    }
    catch (err) {
      failed += 1
      const message = err instanceof OpenRouterServiceError || err instanceof Error
        ? err.message
        : 'unknown error'
      lastError = message
      console.warn(`[daily-summary] Susan insight failed for ${section.id}:`, message)
      await opts.onProgress?.({
        sectionId: section.id,
        title: section.title,
        index: index + 1,
        total,
        status: 'error',
        error: message,
      })
    }

    if (index < queue.length - 1) {
      await sleep(BETWEEN_CALL_DELAY_MS)
    }
  }

  return {
    sections: next,
    generated,
    failed,
    lastError,
    skippedReason: generated === 0 && failed > 0
      ? `Susan calls failed (${failed})${lastError ? `: ${lastError}` : ''}`
      : null,
  }
}

export { AI_ASSISTANT_TITLE }
