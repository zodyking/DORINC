import type { Db } from '../db/client'
import {
  formatAppKnowledgeForTool,
  listAppKnowledgeAreas,
  searchAppKnowledge,
} from '../../shared/app-knowledge'
import { parseGetAppKnowledgeArgs, type AiToolName } from '../../shared/ai-tools'
import {
  executeLookupCustomer,
  executeLookupInvoice,
  executeLookupServiceLog,
  executeSearchCatalog,
  type EntityToolContext,
} from './ai-entity-tools.service'
import {
  listSusanSmsActionsForUser,
  previewSusanSmsSendEmail,
  previewSusanSmsSendEstimate,
  previewSusanSmsSendInvoice,
  type SusanSmsActionResult,
} from './susan-sms-actions.service'
import type { SusanSmsPendingAction } from '../../shared/susan-sms-actions'

export type AiToolCallRequest = {
  id: string
  name: string
  arguments: string
}

export type AiToolExecutionResult = {
  toolCallId: string
  name: string
  ok: boolean
  content: string
  pendingAction?: SusanSmsPendingAction | null
}

export type SusanHelpToolOpts = {
  pageContext?: string | null
  pageKey?: string | null
  db?: Db
  userId?: string | null
  entityType?: EntityToolContext['entityType']
  entityId?: string | null
}

function parseArgsJson(raw: string): unknown {
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return { query: text }
  }
}

function executeGetAppKnowledge(
  argsRaw: unknown,
  pageContext?: string | null,
  pageKey?: string | null,
): { ok: boolean, content: string } {
  const args = parseGetAppKnowledgeArgs(argsRaw)
  const query = String(args.query || '').trim()
  const area = String(args.area || '').trim()
  const detail = args.detail === 'summary' ? 'summary' : 'full'
  const page = pageKey || pageContext || undefined

  if (!query && !area) {
    if (page) {
      const docs = searchAppKnowledge({
        query: page,
        pageContext: page,
        limit: 4,
      })
      return {
        ok: true,
        content: formatAppKnowledgeForTool(docs, detail),
      }
    }
    return {
      ok: true,
      content: [
        'No query or area provided. Available knowledge areas:',
        ...listAppKnowledgeAreas().map(a => `- ${a.area}: ${a.title}`),
        'Call again with query and/or area.',
      ].join('\n'),
    }
  }

  const docs = searchAppKnowledge({
    query: query || area,
    area: area || undefined,
    pageContext: page,
    limit: 4,
  })

  if (!docs.length || (docs.every(d => d.score === 0) && query && !area)) {
    const strong = docs.filter(d => d.score > 0)
    if (!strong.length && query) {
      return {
        ok: true,
        content: [
          `No knowledge docs matched query=${JSON.stringify(query)} area=${JSON.stringify(area)}.`,
          'Available areas:',
          ...listAppKnowledgeAreas().map(a => `- ${a.area}: ${a.title}`),
          'Try a broader query (e.g. invoices, service log, customers, control panel).',
        ].join('\n'),
      }
    }
  }

  const hits = docs.filter(d => d.score > 0)
  const chosen = hits.length ? hits : docs
  return {
    ok: true,
    content: formatAppKnowledgeForTool(chosen, detail),
  }
}

function needDbUser(tool: string): { ok: boolean, content: string } {
  return {
    ok: false,
    content: `${tool} requires an authenticated staff context and database access.`,
  }
}

function wrapAction(toolCallId: string, name: string, result: SusanSmsActionResult): AiToolExecutionResult {
  return {
    toolCallId,
    name,
    ok: result.ok,
    content: result.content,
    pendingAction: result.pendingAction,
  }
}

export async function executeSusanHelpTool(
  call: AiToolCallRequest,
  opts: SusanHelpToolOpts = {},
): Promise<AiToolExecutionResult> {
  const name = String(call.name || '').trim() as AiToolName | string
  const toolCallId = String(call.id || '').trim() || 'tool_call'
  const entityCtx: EntityToolContext = {
    entityType: opts.entityType,
    entityId: opts.entityId,
  }
  try {
    const parsed = parseArgsJson(call.arguments)

    if (name === 'get_app_knowledge') {
      const result = executeGetAppKnowledge(parsed, opts.pageContext, opts.pageKey)
      return { toolCallId, name, ok: result.ok, content: result.content }
    }

    if (name === 'lookup_invoice') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      const result = await executeLookupInvoice(opts.db, opts.userId, parsed, entityCtx)
      return { toolCallId, name, ok: result.ok, content: result.content }
    }

    if (name === 'lookup_service_log') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      const result = await executeLookupServiceLog(opts.db, opts.userId, parsed, entityCtx)
      return { toolCallId, name, ok: result.ok, content: result.content }
    }

    if (name === 'lookup_customer') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      const result = await executeLookupCustomer(opts.db, opts.userId, parsed, entityCtx)
      return { toolCallId, name, ok: result.ok, content: result.content }
    }

    if (name === 'search_catalog') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      const result = await executeSearchCatalog(opts.db, opts.userId, parsed)
      return { toolCallId, name, ok: result.ok, content: result.content }
    }

    if (name === 'list_sms_actions') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      return wrapAction(toolCallId, name, await listSusanSmsActionsForUser(opts.db, opts.userId))
    }

    if (name === 'send_invoice') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      return wrapAction(toolCallId, name, await previewSusanSmsSendInvoice(opts.db, opts.userId, parsed))
    }

    if (name === 'send_estimate') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      return wrapAction(toolCallId, name, await previewSusanSmsSendEstimate(opts.db, opts.userId, parsed))
    }

    if (name === 'send_email') {
      if (!opts.db || !opts.userId) return { toolCallId, name, ...needDbUser(name) }
      return wrapAction(toolCallId, name, await previewSusanSmsSendEmail(opts.db, opts.userId, parsed))
    }

    return {
      toolCallId,
      name,
      ok: false,
      content: `Unknown tool: ${name}`,
    }
  }
  catch (error) {
    return {
      toolCallId,
      name,
      ok: false,
      content: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export async function executeSusanHelpTools(
  calls: AiToolCallRequest[],
  opts: SusanHelpToolOpts = {},
): Promise<AiToolExecutionResult[]> {
  const list = Array.isArray(calls) ? calls : []
  return Promise.all(list.map(call => executeSusanHelpTool(call, opts)))
}
