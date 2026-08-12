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
  type OpenRouterChatMessage,
  type OpenRouterMessageContent,
} from './ai-openrouter.service'
import { executeSusanHelpTools } from './ai-tools.service'
import { logAiUsage } from './ai-jobs.service'
import {
  formatPlatformHelpForSms,
  formatPlatformHelpHtml,
  matchPlatformHelpAnswer,
  susanTemporarilyUnavailableHtml,
} from '../../shared/platform-help'
import {
  isOpenRouterAuthErrorMessage,
  openRouterAuthRecoveryMessage,
} from '../../shared/openrouter-auth'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { BRAND_NAME } from '../../shared/brand'
import { splitPersonName } from '../../shared/format/person-name'
import {
  filterSusanHelpToolsForAuth,
  loadSusanAuthByUserId,
} from './susan-auth.service'

export type PlatformHelpChannel = 'web' | 'sms'

/** Max tool → model rounds per help turn (keeps latency/cost bounded). */
const HELP_TOOL_MAX_ROUNDS = 3

const HELP_TOOL_INSTRUCTIONS = [
  'You have tools. For product/how-to questions about pages, features, workflows, roles, or settings, call get_app_knowledge before answering.',
  'For questions about real records, call the read-only lookup tools available to you (invoice / service log / customer / catalog as permitted).',
  'If Current record id is set and the user asks about this/the current record (balance, total, status), call the matching lookup with that id (or an empty query).',
  'Invoice: query "INV-000713" or "invoice 713" for one invoice. For unpaid/overdue counts use status unpaid|overdue|stats. For "oldest invoice" / "newest invoice" set sort oldest|newest — never combine an INV number with status=unpaid.',
  'Service log: query "SL-0713". Review queue → query "review queue".',
  'If a tool returns permission denied, explain the access gap once — do not retry the same tool.',
  'You may call multiple tools in one turn when needed, then answer from the tool results.',
  'Do not invent routes, buttons, permissions, invoice numbers, totals, or other record fields that are not in tool results or the user message.',
  'For simple greetings or acknowledgements, reply directly without tools.',
].join(' ')

const HELP_SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the ${BRAND_NAME} platform help assistant.`,
  'You explain how to use the application and can look up invoices, service logs, customers, and catalog items the staff member is allowed to see.',
  'Speak in first person as Susan. Address the staff member by their first name when greeting or when it feels natural.',
  'You NEVER modify, create, delete, send, approve, or pay records. Lookups are read-only via tools only.',
  'Do not invent customer, invoice, service log, or catalog data — only report what tools return.',
  HELP_TOOL_INSTRUCTIONS,
  'Be concise — short sentences, no filler, no repetition.',
  'Output clean HTML only (never markdown).',
  'For how-to answers: optional <p> summary, then <h4 class="help-section">, then <ol class="help-steps"> or <ul class="help-tips">; prefer 3–5 steps.',
  'For record/lookup answers: short factual HTML — a <p> summary plus optional <ul> of key fields. Do not force step lists for balances/totals/status.',
  'If the user attaches an image, use <h4>What I see</h4> then a brief <ul>, then answer.',
  'If asked to change data, say you cannot do it, then give numbered steps for the user to follow.',
].join(' ')

const HELP_SMS_SYSTEM_PROMPT = [
  `You are ${AI_ASSISTANT_NAME}, the ${BRAND_NAME} platform help assistant — the same helper as the in-app Platform Assistant chat.`,
  'Speak in first person as Susan. Never refer to yourself as "SMS chat", "SMS chat with Susan", or any SMS product feature.',
  'You help with the app and can look up invoices, service logs, customers, and catalog items the staff member is allowed to see.',
  'Address the staff member by their first name when greeting (e.g. "Hi Alex!") and when it feels natural.',
  'You NEVER modify, create, delete, send, approve, or pay records. Lookups are read-only via tools only.',
  'Do not invent customer, invoice, service log, or catalog data — only report what tools return.',
  HELP_TOOL_INSTRUCTIONS,
  'Reply in plain text only for SMS — no HTML, no markdown headings, no code fences, no bold markers.',
  'Keep replies short and scannable on a phone. Aim under 600 characters when possible; never exceed ~1400.',
  'For how-to: numbered steps "1) …". For record lookups: 2–4 short factual lines.',
  'Prefer 3–5 steps for procedures. Skip filler. For simple hellos, greet by name and offer to help with the app.',
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
    pageKey?: string
    entityType?: 'invoice' | 'service_log' | 'customer'
    entityId?: string
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
  else {
    if (opts.pageKey) parts.push(`Current page key: ${opts.pageKey}`)
    if (opts.pageContext) parts.push(`Current page: ${opts.pageContext}`)
    if (opts.entityType && opts.entityId) {
      parts.push(`Current record: type=${opts.entityType} id=${opts.entityId}`)
    }
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

function synthesizeAnswerFromTools(
  toolResults: Array<{ name: string, ok: boolean, content: string }>,
  channel: PlatformHelpChannel,
): string {
  const usable = toolResults.filter(t => t.ok && t.content.trim())
  if (!usable.length) return ''
  const body = usable.map(t => t.content.trim()).join('\n\n').slice(0, 1200)
  if (channel === 'sms') return body
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>Here is what I found:</p><pre class="help-tool-result">${escaped}</pre>`
}

function formatHelpAnswer(raw: string, channel: PlatformHelpChannel): string {
  if (channel === 'sms') return formatPlatformHelpForSms(raw)
  return formatPlatformHelpHtml(raw)
}

async function callOpenRouterHelp(
  apiKey: string,
  model: string,
  db: Db,
  input: {
    question: string
    pageContext?: string
    pageKey?: string
    entityType?: 'invoice' | 'service_log' | 'customer'
    entityId?: string
    imageDataUrls?: string[]
    history?: PlatformHelpHistoryMessage[]
    channel?: PlatformHelpChannel
    userName?: string | null
    userId: string
  },
): Promise<{ answer: string, promptTokens: number, completionTokens: number }> {
  const channel = input.channel === 'sms' ? 'sms' : 'web'
  const historyMessages = (input.history ?? []).slice(-40).map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }))

  const auth = await loadSusanAuthByUserId(db, input.userId)
  const tools = filterSusanHelpToolsForAuth(auth) as unknown as Array<Record<string, unknown>>

  const systemPrompt = channel === 'sms' ? HELP_SMS_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: buildUserTurn(input.question, {
        pageContext: input.pageContext,
        pageKey: input.pageKey,
        entityType: input.entityType,
        entityId: input.entityId,
        imageDataUrls: input.imageDataUrls,
        channel,
        userName: input.userName,
      }),
    },
  ]

  let promptTokens = 0
  let completionTokens = 0
  let finalContent = ''
  let lastToolResults: Array<{ name: string, ok: boolean, content: string }> = []

  for (let round = 0; round < HELP_TOOL_MAX_ROUNDS; round++) {
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
        tools,
        toolChoice: 'auto',
        timeoutMs: 45_000,
      },
    )

    promptTokens += result.promptTokens
    completionTokens += result.completionTokens

    if (!result.toolCalls.length) {
      finalContent = result.content
      break
    }

    messages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls,
    })

    const toolResults = await executeSusanHelpTools(
      result.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      {
        pageContext: input.pageContext,
        pageKey: input.pageKey,
        db,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    )
    lastToolResults = toolResults

    for (const toolResult of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: toolResult.toolCallId,
        content: toolResult.content,
      })
    }

    // Last round: force a final answer without further tools.
    if (round === HELP_TOOL_MAX_ROUNDS - 1) {
      const closing = await openRouterChat(
        apiKey,
        model,
        messages,
        'platform_help',
        {
          responseFormat: 'text',
          temperature: 0.3,
          maxTokens: channel === 'sms' ? 700 : 1024,
          tools,
          toolChoice: 'none',
          timeoutMs: 45_000,
        },
      )
      promptTokens += closing.promptTokens
      completionTokens += closing.completionTokens
      finalContent = closing.content
      break
    }
  }

  if (!finalContent.trim()) {
    const synthesized = synthesizeAnswerFromTools(lastToolResults, channel)
    if (synthesized) {
      return {
        answer: formatHelpAnswer(synthesized, channel),
        promptTokens,
        completionTokens,
      }
    }
    throw new OpenRouterServiceError('EMPTY_RESPONSE', 'OpenRouter returned no content')
  }

  return {
    answer: formatHelpAnswer(finalContent, channel),
    promptTokens,
    completionTokens,
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
    pageKey?: string
    entityType?: 'invoice' | 'service_log' | 'customer'
    entityId?: string
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

        let helpResult: Awaited<ReturnType<typeof callOpenRouterHelp>> | null = null
        let lastHelpErr: unknown
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            helpResult = await callOpenRouterHelp(
              apiKey,
              model,
              db,
              { ...input, channel, userId: input.userId },
            )
            break
          }
          catch (err) {
            lastHelpErr = err
            const empty = err instanceof OpenRouterServiceError && err.code === 'EMPTY_RESPONSE'
            if (!empty || attempt === 1) throw err
            console.warn('[platform-help] empty OpenRouter reply; retrying once')
          }
        }
        if (!helpResult) throw lastHelpErr
        const { answer, promptTokens, completionTokens } = helpResult
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
        return {
          answer: format(susanTemporarilyUnavailableHtml(input.userName)),
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
