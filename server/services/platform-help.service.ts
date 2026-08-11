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
import {
  openRouterChat,
  OpenRouterServiceError,
  type OpenRouterMessageContent,
} from './ai-openrouter.service'
import { logAiUsage } from './ai-jobs.service'
import {
  formatPlatformHelpForSms,
  formatPlatformHelpHtml,
  matchPlatformHelpAnswer,
} from '../../shared/platform-help'
import {
  isOpenRouterAuthErrorMessage,
  openRouterAuthRecoveryMessage,
} from '../../shared/openrouter-auth'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import { splitPersonName } from '../../shared/format/person-name'

export type PlatformHelpChannel = 'web' | 'sms'

const HELP_SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the ${BRAND_NAME} platform help assistant.`,
  'You explain how to use the application: navigation, workflows, roles, settings, and features.',
  'Speak in first person as Susan. Address the staff member by their first name when greeting or when it feels natural.',
  'You NEVER modify records, access customer or invoice data, or perform actions for the user.',
  'Be concise — short sentences, no filler, no repetition.',
  'Output clean HTML only (never markdown). Structure every how-to answer like this:',
  '1) Optional one-sentence summary in <p>.',
  '2) Section label in <h4 class="help-section"> (e.g. Steps, What I see, Tips).</h4>',
  '3) Procedures as <ol class="help-steps"><li>…</li></ol> — one action per step, wrap UI labels in <b>.',
  '4) Non-sequential notes as <ul class="help-tips"><li>…</li></ul> (max 3 bullets).',
  'Prefer 3–5 steps over long paragraphs. Skip sections that add no value.',
  'If the user attaches an image, use <h4>What I see</h4> then a brief <ul> of key elements, then answer their question with steps.',
  'If asked to change data, say you cannot do it, then give numbered steps for the user to follow.',
].join(' ')

const HELP_SMS_SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the ${BRAND_NAME} platform help assistant — the same helper as the in-app Platform Assistant chat.`,
  'Speak in first person as Susan. Never refer to yourself as "SMS chat", "SMS chat with Susan", or any SMS product feature.',
  'You help with the app: navigation, workflows, roles, settings, and features.',
  'Address the staff member by their first name when greeting (e.g. "Hi Alex!") and when it feels natural.',
  'You NEVER modify records, access customer or invoice data, or perform actions for the user.',
  'Reply in plain text only for SMS — no HTML, no markdown headings, no code fences, no bold markers.',
  'Keep replies short and scannable on a phone. Aim under 600 characters when possible; never exceed ~1400.',
  'Use short paragraphs and numbered steps like "1) …" "2) …". Put UI labels in quotes (e.g. "Invoices").',
  'Prefer 3–5 steps. Skip filler and long intros. For simple hellos, greet by name and offer to help with the app.',
].join(' ')

function firstNameFrom(userName?: string | null): string {
  const first = splitPersonName(String(userName ?? '').trim()).firstName
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

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
  /** Effective OpenRouter model id for platform help (override or default). */
  model: string | null
}

export async function getPlatformHelpStatus(db: Db): Promise<PlatformHelpStatus> {
  const settings = await getAiProviderSettings(db)
  const enabled = settings.platformHelpEnabled
  let aiAvailable = settings.enabled && settings.hasApiKey
  let capped = false
  let imageUploadEnabled = false
  const model = enabled ? modelForFeature(settings, 'platform_help') : null

  if (aiAvailable && model) {
    try {
      await assertSpendCapAllowsRequest(db)
      imageUploadEnabled = await modelSupportsVision(db, model)
    }
    catch (e) {
      if (e instanceof AiSpendCapExceededError) {
        aiAvailable = false
        capped = true
      }
    }
  }

  return { enabled, aiAvailable, capped, imageUploadEnabled, model }
}

function buildUserTurn(
  question: string,
  opts: {
    pageContext?: string
    imageDataUrls?: string[]
    channel?: PlatformHelpChannel
    userName?: string | null
  },
): string | OpenRouterMessageContent[] {
  const parts: string[] = []
  const first = firstNameFrom(opts.userName)
  if (first) parts.push(`Staff first name: ${first}`)
  if (opts.channel === 'sms') {
    parts.push('Channel: SMS (same Platform Assistant help as in-app; do not mention SMS chat as a feature)')
  }
  else if (opts.pageContext) {
    parts.push(`Current page: ${opts.pageContext}`)
  }
  parts.push('', question)
  const userText = parts.join('\n')

  if (!opts.imageDataUrls?.length) return userText

  return [
    { type: 'text', text: userText },
    ...opts.imageDataUrls.map(url => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]
}

function formatHelpAnswer(raw: string, channel: PlatformHelpChannel): string {
  if (channel === 'sms') return formatPlatformHelpForSms(raw)
  return formatPlatformHelpHtml(raw)
}

async function callOpenRouterHelp(
  apiKey: string,
  model: string,
  input: {
    question: string
    pageContext?: string
    imageDataUrls?: string[]
    history?: PlatformHelpHistoryMessage[]
    channel?: PlatformHelpChannel
    userName?: string | null
  },
): Promise<{ answer: string, promptTokens: number, completionTokens: number }> {
  const channel = input.channel === 'sms' ? 'sms' : 'web'
  const historyMessages = (input.history ?? []).slice(-40).map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }))

  const systemPrompt = channel === 'sms' ? HELP_SMS_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT
  const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string | OpenRouterMessageContent[] }> = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: buildUserTurn(input.question, {
        pageContext: input.pageContext,
        imageDataUrls: input.imageDataUrls,
        channel,
        userName: input.userName,
      }),
    },
  ]

  const result = await openRouterChat(
    apiKey,
    model,
    messages,
    'platform_help',
    {
      responseFormat: 'text',
      temperature: 0.3,
      maxTokens: channel === 'sms'
        ? 700
        : (input.imageDataUrls?.length ? 2048 : 1024),
    },
  )

  return {
    answer: formatHelpAnswer(result.content, channel),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  }
}

function authFailureHelpHtml(): string {
  return formatPlatformHelpHtml(
    `<p>${openRouterAuthRecoveryMessage()}</p>`
    + '<ol>'
    + '<li>Open <b>Control Panel → AI</b>.</li>'
    + '<li>Re-paste your OpenRouter API key.</li>'
    + '<li>Click <b>Test connection</b>, then <b>Save AI settings</b>.</li>'
    + '</ol>',
  )
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
    imageDataUrls?: string[]
    history?: PlatformHelpHistoryMessage[]
    /** web = in-app HTML help; sms = plain-text Susan replies for Quo. */
    channel?: PlatformHelpChannel
    /** Full staff name — used so Susan can greet by first name. */
    userName?: string | null
  },
): Promise<PlatformHelpResult> {
  const channel: PlatformHelpChannel = input.channel === 'sms' ? 'sms' : 'web'
  const format = (raw: string) => formatHelpAnswer(raw, channel)
  const settings = await getAiProviderSettings(db)

  if (!settings.platformHelpEnabled) {
    return {
      answer: format('Platform help is disabled by your administrator.'),
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
        if (input.imageDataUrls?.length && !(await modelSupportsVision(db, model))) {
          return {
            answer: format(
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
          { ...input, channel },
        )
        const estimatedCostUsd = estimateTokenCostUsd(promptTokens, completionTokens)
        try {
          await logAiUsage(db, {
            featureType: 'platform_help',
            model,
            promptTokens,
            completionTokens,
            estimatedCostUsd,
            createdBy: input.userId,
          })
        }
        catch (usageErr) {
          console.error('[platform-help] usage log failed:', (usageErr as Error).message)
        }
        return { answer, source: 'ai', capped: false }
      }
    }
    catch (e) {
      if (e instanceof AiSpendCapExceededError) {
        capped = true
      }
      else {
        const message = e instanceof OpenRouterServiceError || e instanceof Error
          ? e.message
          : 'AI request failed'
        console.error('[platform-help] OpenRouter call failed:', message)
        if (isOpenRouterAuthErrorMessage(message) || message.includes('OpenRouter authentication')) {
          return {
            answer: format(authFailureHelpHtml()),
            source: 'fallback',
            capped: false,
          }
        }
        if (input.imageDataUrls?.length) {
          return {
            answer: format(visionFailureMessage(false)),
            source: 'fallback',
            capped: false,
          }
        }
        const first = firstNameFrom(input.userName)
        const hi = first ? `Hi ${first} — ` : ''
        return {
          answer: format(
            `<p>${hi}Susan could not reach OpenRouter just now (${message}).</p>`
            + '<p>Showing built-in help instead — try again in a moment, or check <b>Control Panel → AI</b>.</p>'
            + matchPlatformHelpAnswer(input.question),
          ),
          source: 'fallback',
          capped: false,
        }
      }
      if (input.imageDataUrls?.length) {
        return {
          answer: format(visionFailureMessage(capped)),
          source: 'fallback',
          capped,
        }
      }
    }
  }

  if (input.imageDataUrls?.length) {
    return {
      answer: format(visionFailureMessage(capped)),
      source: 'fallback',
      capped,
    }
  }

  const first = firstNameFrom(input.userName)
  const matched = matchPlatformHelpAnswer(input.question)
  const withName = channel === 'sms' && first && !/^hi\b/i.test(matched)
    ? `Hi ${first}!\n\n${matched}`
    : matched

  return {
    answer: format(withName),
    source: 'fallback',
    capped,
  }
}
