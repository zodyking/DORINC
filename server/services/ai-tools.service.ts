import {
  formatAppKnowledgeForTool,
  listAppKnowledgeAreas,
  searchAppKnowledge,
} from '../../shared/app-knowledge'
import { parseGetAppKnowledgeArgs, type AiToolName } from '../../shared/ai-tools'

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

function executeGetAppKnowledge(argsRaw: unknown, pageContext?: string | null): { ok: boolean, content: string } {
  const args = parseGetAppKnowledgeArgs(argsRaw)
  const query = String(args.query || '').trim()
  const area = String(args.area || '').trim()
  const detail = args.detail === 'summary' ? 'summary' : 'full'

  if (!query && !area) {
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
    pageContext: pageContext ?? undefined,
    limit: 4,
  })

  if (!docs.length || (docs.every(d => d.score === 0) && query && !area)) {
    // searchAppKnowledge soft-falls back to overview docs with score 0; treat weak matches as miss when query given
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

export async function executeSusanHelpTool(
  call: AiToolCallRequest,
  opts: { pageContext?: string | null } = {},
): Promise<AiToolExecutionResult> {
  const name = String(call.name || '').trim() as AiToolName | string
  const toolCallId = String(call.id || '').trim() || 'tool_call'
  try {
    if (name === 'get_app_knowledge') {
      const parsed = parseArgsJson(call.arguments)
      const result = executeGetAppKnowledge(parsed, opts.pageContext)
      return {
        toolCallId,
        name,
        ok: result.ok,
        content: result.content,
      }
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
  opts: { pageContext?: string | null } = {},
): Promise<AiToolExecutionResult[]> {
  const list = Array.isArray(calls) ? calls : []
  const out: AiToolExecutionResult[] = []
  for (const call of list) {
    out.push(await executeSusanHelpTool(call, opts))
  }
  return out
}
