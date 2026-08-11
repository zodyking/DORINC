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

export interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type OpenRouterChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type OpenRouterChatMessage = {
  role: OpenRouterChatRole
  content?: string | OpenRouterMessageContent[] | null
  name?: string
  tool_call_id?: string
  tool_calls?: OpenRouterToolCall[]
}

export interface OpenRouterChatResult {
  content: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  toolCalls: OpenRouterToolCall[]
  finishReason: string | null
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: { name?: string, arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
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

function normalizeToolCalls(
  raw: OpenRouterResponse['choices'] extends Array<infer C>
    ? C extends { message?: { tool_calls?: infer T } } ? T : never
    : never,
): OpenRouterToolCall[] {
  if (!Array.isArray(raw)) return []
  const out: OpenRouterToolCall[] = []
  for (const item of raw) {
    const id = String(item?.id || '').trim()
    const name = String(item?.function?.name || '').trim()
    if (!id || !name) continue
    out.push({
      id,
      type: 'function',
      function: {
        name,
        arguments: typeof item?.function?.arguments === 'string'
          ? item.function.arguments
          : JSON.stringify(item?.function?.arguments ?? {}),
      },
    })
  }
  return out
}

export async function openRouterChat(
  apiKey: string,
  model: string,
  messages: OpenRouterChatMessage[],
  feature: AiFeatureType,
  opts: {
    responseFormat?: 'json' | 'text'
    temperature?: number
    maxTokens?: number
    /** Abort hung OpenRouter calls (default 30s). */
    timeoutMs?: number
    /** OpenAI-compatible tool definitions (function calling). */
    tools?: Array<Record<string, unknown>>
    toolChoice?: 'auto' | 'none' | { type: 'function', function: { name: string } }
  } = {},
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
  const timeoutMs = opts.timeoutMs
    ?? (feature === 'ai_administrator' ? 25_000 : 30_000)

  const body: Record<string, unknown> = {
    model: String(model).trim(),
    messages,
    temperature,
  }
  if (opts.maxTokens != null && Number.isFinite(opts.maxTokens)) {
    body.max_tokens = Math.max(1, Math.floor(opts.maxTokens))
  }
  if (opts.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = opts.toolChoice ?? 'auto'
  }
  // JSON mode conflicts with tool calling on many providers — skip when tools are present.
  if (responseFormat === 'json' && !opts.tools?.length) {
    body.response_format = { type: 'json_object' }
  }

  // Explicit Headers so Authorization cannot be dropped by object-spread quirks.
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${key}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  headers.set('HTTP-Referer', getAppUrl())
  headers.set('X-Title', BRAND_NAME)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  }
  catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new OpenRouterServiceError(
        'API_ERROR',
        `OpenRouter timed out after ${Math.round(timeoutMs / 1000)}s`,
      )
    }
    throw err
  }
  finally {
    clearTimeout(timer)
  }

  const payload = await res.json().catch(() => ({})) as OpenRouterResponse
  if (!res.ok) {
    const raw = payload.error?.message ?? `OpenRouter returned ${res.status}`
    throw new OpenRouterServiceError(
      'API_ERROR',
      isOpenRouterAuthErrorMessage(raw) ? openRouterAuthRecoveryMessage() : raw,
    )
  }

  const choice = payload.choices?.[0]
  const toolCalls = normalizeToolCalls(choice?.message?.tool_calls)
  const content = String(choice?.message?.content ?? '').trim()
  if (!content && !toolCalls.length) {
    throw new OpenRouterServiceError('EMPTY_RESPONSE', 'OpenRouter returned no content')
  }

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
    toolCalls,
    finishReason: choice?.finish_reason ?? null,
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
