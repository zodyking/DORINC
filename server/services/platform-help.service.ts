import type { Db } from '../db/client'
import {
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
  estimateTokenCostUsd,
  getAiProviderSettings,
  getDecryptedApiKey,
  modelForFeature,
  modelSupportsVision,
} from './ai-provider.service'
import type { OpenRouterMessageContent } from './ai-openrouter.service'
import { logAiUsage } from './ai-jobs.service'
import { formatPlatformHelpHtml, matchPlatformHelpAnswer } from '../../shared/platform-help'
import { getAppUrl } from './app-config.service'
import { BRAND_NAME } from '../../shared/brand'

const HELP_SYSTEM_PROMPT = [
  `You are the ${BRAND_NAME} platform assistant.`,
  'You ONLY explain how to use the application: navigation, workflows, roles, settings, and features.',
  'You NEVER modify records, access customer or invoice data, or perform actions for the user.',
  'Output clean HTML only (never markdown). Format every how-to answer like this:',
  '1) Optional one-sentence intro wrapped in <p>...</p>.',
  '2) Numbered steps in <ol><li>...</li></ol> for procedures (most answers).',
  '3) Use <ul><li>...</li></ul> only for non-sequential options.',
  '4) Wrap UI labels, menu paths, and button names in <b>...</b>.',
  '5) Keep each <li> to one clear action. Complete every HTML tag — never truncate mid-tag.',
  '6) If the user attaches a screenshot, describe what you see and give steps based on that screen.',
  'If asked to change data, say you cannot do it, then list the exact clicks the user should make.',
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
  imageUploadEnabled: boolean
}

export async function getPlatformHelpStatus(db: Db): Promise<PlatformHelpStatus> {
  const settings = await getAiProviderSettings(db)
  const enabled = settings.platformHelpEnabled
  let aiAvailable = settings.enabled && settings.hasApiKey
  let capped = false
  let imageUploadEnabled = false

  if (aiAvailable) {
    try {
      await assertSpendCapAllowsRequest(db)
      const model = modelForFeature(settings, 'platform_help')
      imageUploadEnabled = await modelSupportsVision(db, model)
    }
    catch (e) {
      if (e instanceof AiSpendCapExceededError) {
        aiAvailable = false
        capped = true
      }
    }
  }

  return { enabled, aiAvailable, capped, imageUploadEnabled }
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
  imageDataUrl?: string,
): Promise<{ answer: string, promptTokens: number, completionTokens: number }> {
  const userText = pageContext
    ? `Current page: ${pageContext}\n\nQuestion: ${question}`
    : question

  const userContent: string | OpenRouterMessageContent[] = imageDataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    : userText

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getAppUrl(),
      'X-Title': BRAND_NAME,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.2,
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
    answer: formatPlatformHelpHtml(answer),
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
  }
}

export async function askPlatformHelp(
  db: Db,
  input: { question: string, pageContext?: string, userId: string, imageDataUrl?: string },
): Promise<PlatformHelpResult> {
  const settings = await getAiProviderSettings(db)

  if (!settings.platformHelpEnabled) {
    return {
      answer: formatPlatformHelpHtml('Platform help is disabled by your administrator.'),
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
        if (input.imageDataUrl && !(await modelSupportsVision(db, model))) {
          return {
            answer: formatPlatformHelpHtml(
              '<p>This help model does not support screenshots.</p>'
              + '<ol>'
              + '<li>Open <b>Control Panel → AI</b>.</li>'
              + '<li>Select a vision-capable model (for example <b>GPT-4o</b> or <b>Claude 3.5 Sonnet</b>) for platform help.</li>'
              + '<li>Click <b>Save AI settings</b>, then try your screenshot again.</li>'
              + '</ol>',
            ),
            source: 'fallback',
            capped: false,
          }
        }

        const { answer, promptTokens, completionTokens } = await callOpenRouterHelp(
          apiKey,
          model,
          input.question,
          input.pageContext,
          input.imageDataUrl,
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
    answer: formatPlatformHelpHtml(matchPlatformHelpAnswer(input.question)),
    source: 'fallback',
    capped,
  }
}
