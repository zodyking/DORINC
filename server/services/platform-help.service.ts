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
  'You explain how to use the application: navigation, workflows, roles, settings, and features.',
  'You NEVER modify records, access customer or invoice data, or perform actions for the user.',
  'Be concise — short sentences, no filler, no repetition.',
  'Output clean HTML only (never markdown). Structure every how-to answer like this:',
  '1) Optional one-sentence summary in <p>.',
  '2) Section label in <h4> (e.g. "Steps", "What I see", "Tips").',
  '3) Procedures as <ol><li>…</li></ol> — one action per step, wrap UI labels in <b>.',
  '4) Non-sequential notes as <ul><li>…</li></ul> (max 3 bullets).',
  'Prefer 3–5 steps over long paragraphs. Skip sections that add no value.',
  'If the user attaches an image, use <h4>What I see</h4> then a brief <ul> of key elements, then answer their question with steps.',
  'If asked to change data, say you cannot do it, then give numbered steps for the user to follow.',
].join(' ')

export interface PlatformHelpHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

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

function buildUserTurn(
  question: string,
  pageContext?: string,
  imageDataUrl?: string,
): string | OpenRouterMessageContent[] {
  const prefix = pageContext ? `Current page: ${pageContext}\n\n` : ''
  const userText = `${prefix}${question}`

  if (!imageDataUrl) return userText

  return [
    { type: 'text', text: userText },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ]
}

async function callOpenRouterHelp(
  apiKey: string,
  model: string,
  input: {
    question: string
    pageContext?: string
    imageDataUrl?: string
    history?: PlatformHelpHistoryMessage[]
  },
): Promise<{ answer: string, promptTokens: number, completionTokens: number }> {
  const historyMessages = (input.history ?? []).slice(-40).map(row => ({
    role: row.role,
    content: row.content,
  }))

  const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string | OpenRouterMessageContent[] }> = [
    { role: 'system', content: HELP_SYSTEM_PROMPT },
    ...historyMessages,
    { role: 'user', content: buildUserTurn(input.question, input.pageContext, input.imageDataUrl) },
  ]

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
      max_tokens: input.imageDataUrl ? 2048 : 1024,
      temperature: 0.3,
      messages,
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

function visionFailureMessage(capped: boolean): string {
  if (capped) {
    return formatPlatformHelpHtml(
      '<p>AI spend cap reached — I cannot analyze images until the cap resets or an admin raises it.</p>',
    )
  }
  return formatPlatformHelpHtml(
    '<p>I could not analyze that image.</p>'
    + '<ol>'
    + '<li>Open <b>Control Panel → AI</b>.</li>'
    + '<li>Confirm AI is enabled and a vision model is selected for platform help (for example <b>GPT-4o</b> or <b>Claude Sonnet</b>).</li>'
    + '<li>Click <b>Save AI settings</b>, then try again.</li>'
    + '</ol>',
  )
}

export async function askPlatformHelp(
  db: Db,
  input: {
    question: string
    pageContext?: string
    userId: string
    imageDataUrl?: string
    history?: PlatformHelpHistoryMessage[]
  },
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
              '<p>This help model does not support image analysis.</p>'
              + '<ol>'
              + '<li>Open <b>Control Panel → AI</b>.</li>'
              + '<li>Select a vision-capable model for platform help.</li>'
              + '<li>Click <b>Save AI settings</b>, then send your image again.</li>'
              + '</ol>',
            ),
            source: 'fallback',
            capped: false,
          }
        }

        const { answer, promptTokens, completionTokens } = await callOpenRouterHelp(
          apiKey,
          model,
          input,
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
      if (input.imageDataUrl) {
        return {
          answer: visionFailureMessage(capped),
          source: 'fallback',
          capped,
        }
      }
    }
  }

  if (input.imageDataUrl) {
    return {
      answer: visionFailureMessage(capped),
      source: 'fallback',
      capped,
    }
  }

  return {
    answer: formatPlatformHelpHtml(matchPlatformHelpAnswer(input.question)),
    source: 'fallback',
    capped,
  }
}
