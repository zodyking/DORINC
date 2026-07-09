import type { Db } from '../db/client'
import {
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
  estimateTokenCostUsd,
  getAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
} from './ai-provider.service'
import { logAiUsage } from './ai-jobs.service'
import { matchPlatformHelpAnswer } from '../../shared/platform-help'
import { getAppUrl } from './app-config.service'

const HELP_SYSTEM_PROMPT = [
  'You are the DORINC Suite platform assistant.',
  'You ONLY explain how to use the application: workflows, navigation, roles, settings, and features.',
  'You NEVER modify records, access customer or invoice data, or bypass permissions.',
  'Keep answers concise (2–4 sentences). Use simple HTML <b> tags for emphasis when helpful.',
  'If asked to change data or perform actions, explain how the user can do it themselves in the UI.',
].join(' ')

export interface PlatformHelpResult {
  answer: string
  source: 'ai' | 'fallback'
  capped: boolean
}

export interface PlatformHelpStatus {
  enabled: boolean
  aiAvailable: boolean
  capped: boolean
}

export async function getPlatformHelpStatus(db: Db): Promise<PlatformHelpStatus> {
  const settings = await getAiProviderSettings(db)
  const enabled = settings.platformHelpEnabled
  let aiAvailable = settings.enabled && settings.hasApiKey
  let capped = false

  if (aiAvailable) {
    try {
      await assertSpendCapAllowsRequest(db)
    }
    catch (e) {
      if (e instanceof AiSpendCapExceededError) {
        aiAvailable = false
        capped = true
      }
    }
  }

  return { enabled, aiAvailable, capped }
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number }
}

async function callOpenRouterHelp(
  apiKey: string,
  model: string,
  question: string,
  pageContext?: string,
): Promise<{ answer: string, promptTokens: number, completionTokens: number }> {
  const userContent = pageContext
    ? `Current page: ${pageContext}\n\nQuestion: ${question}`
    : question

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getAppUrl(),
      'X-Title': 'DORINC Suite',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        { role: 'system', content: HELP_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `OpenRouter returned ${res.status}`)
  }

  const payload = await res.json() as OpenRouterChatResponse
  const answer = payload.choices?.[0]?.message?.content?.trim()
  if (!answer) throw new Error('Empty response from OpenRouter')

  return {
    answer,
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
  }
}

export async function askPlatformHelp(
  db: Db,
  input: { question: string, pageContext?: string, userId: string },
): Promise<PlatformHelpResult> {
  const settings = await getAiProviderSettings(db)

  if (!settings.platformHelpEnabled) {
    return {
      answer: 'Platform help is disabled by your administrator.',
      source: 'fallback',
      capped: false,
    }
  }

  const canUseAi = settings.enabled && settings.hasApiKey
  let capped = false

  if (canUseAi) {
    try {
      await assertSpendCapAllowsRequest(db)
      const apiKey = await getDecryptedApiKey(db)
      if (apiKey) {
        const model = modelForFeature(settings, 'platform_help')
        const { answer, promptTokens, completionTokens } = await callOpenRouterHelp(
          apiKey,
          model,
          input.question,
          input.pageContext,
        )
        const estimatedCostUsd = estimateTokenCostUsd(promptTokens, completionTokens)
        await logAiUsage(db, {
          featureType: 'platform_help',
          model,
          promptTokens,
          completionTokens,
          estimatedCostUsd,
          createdBy: input.userId,
        })
        return { answer, source: 'ai', capped: false }
      }
    }
    catch (e) {
      if (e instanceof AiSpendCapExceededError) {
        capped = true
      }
      // Fall through to keyword matching on any AI failure
    }
  }

  return {
    answer: matchPlatformHelpAnswer(input.question),
    source: 'fallback',
    capped,
  }
}
