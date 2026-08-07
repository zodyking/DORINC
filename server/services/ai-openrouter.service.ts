import type { AiFeatureType } from '../db/schema/ai'
import {
  isOpenRouterAuthErrorMessage,
  normalizeOpenRouterApiKey,
  openRouterAuthRecoveryMessage,
} from '../../shared/openrouter-auth'
import { BRAND_NAME } from '../../shared/brand'
import { getAppUrl } from './app-config.service'

export type OpenRouterServiceErrorCode = 'API_ERROR' | 'PARSE_ERROR' | 'EMPTY_RESPONSE'

export class OpenRouterServiceError extends Error {
  constructor(public readonly code: OpenRouterServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface OpenRouterMessageContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface OpenRouterChatResult {
  content: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
  }
  error?: { message?: string }
}

/** Rough USD estimate when OpenRouter omits cost (SPEC §10 usage logs). */
export function estimateOpenRouterCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const isHaiku = model.includes('haiku')
  const isSonnet = model.includes('sonnet') || model.includes('gpt-4')
  const promptRate = isHaiku ? 0.00000025 : isSonnet ? 0.000003 : 0.000001
  const completionRate = isHaiku ? 0.00000125 : isSonnet ? 0.000015 : 0.000003
  return Number(((promptTokens * promptRate) + (completionTokens * completionRate)).toFixed(6))
}

function parseJsonBlock(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  }
  catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new OpenRouterServiceError('PARSE_ERROR', 'AI response was not valid JSON')
  }
}

export async function openRouterChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string | OpenRouterMessageContent[] }>,
  feature: AiFeatureType,
  opts: { responseFormat?: 'json' | 'text', temperature?: number } = {},
): Promise<OpenRouterChatResult> {
  const key = normalizeOpenRouterApiKey(apiKey)
  if (!key) {
    throw new OpenRouterServiceError('API_ERROR', openRouterAuthRecoveryMessage())
  }
  if (!String(model || '').trim()) {
    throw new OpenRouterServiceError(
      'API_ERROR',
      'OpenRouter model is not configured — set a model in Control Panel → AI',
    )
  }

  const responseFormat = opts.responseFormat
    ?? (feature === 'daily_summary' ? 'text' : 'json')
  const temperature = opts.temperature
    ?? (feature === 'invoice_description'
      ? 0.4
      : feature === 'daily_summary'
        ? 0.55
        : 0.2)

  const body: Record<string, unknown> = {
    model: String(model).trim(),
    messages,
    temperature,
  }
  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  // Explicit Headers so Authorization cannot be dropped by object-spread quirks.
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${key}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  headers.set('HTTP-Referer', getAppUrl())
  headers.set('X-Title', BRAND_NAME)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => ({})) as OpenRouterResponse
  if (!res.ok) {
    const raw = payload.error?.message ?? `OpenRouter returned ${res.status}`
    throw new OpenRouterServiceError(
      'API_ERROR',
      isOpenRouterAuthErrorMessage(raw) ? openRouterAuthRecoveryMessage() : raw,
    )
  }

  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new OpenRouterServiceError('EMPTY_RESPONSE', 'OpenRouter returned no content')

  const promptTokens = payload.usage?.prompt_tokens ?? 0
  const completionTokens = payload.usage?.completion_tokens ?? 0
  const totalTokens = payload.usage?.total_tokens ?? (promptTokens + completionTokens)
  const estimatedCostUsd = Number(
    (payload.usage?.cost ?? estimateOpenRouterCost(model, promptTokens, completionTokens)).toFixed(4),
  )

  return {
    content,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
  }
}

export function parseOpenRouterJson(content: string): Record<string, unknown> {
  try {
    return parseJsonBlock(content)
  }
  catch (err) {
    if (err instanceof OpenRouterServiceError) throw err
    throw new OpenRouterServiceError('PARSE_ERROR', 'AI response was not valid JSON')
  }
}
