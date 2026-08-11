/**
 * OpenAI-compatible tool definitions for Susan (platform help).
 * Executors live in server/services; this module is shared schema only.
 */

export type AiToolName = 'get_app_knowledge'

export type OpenAiToolDefinition = {
  type: 'function'
  function: {
    name: AiToolName
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
      additionalProperties?: boolean
    }
  }
}

export type GetAppKnowledgeArgs = {
  query?: string
  area?: string
  detail?: 'summary' | 'full'
}

export const SUSAN_HELP_TOOLS: OpenAiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_app_knowledge',
      description:
        'Look up in-depth DORINC application knowledge: pages, routes, features, workflows, roles, and how areas connect. Use this before answering product/how-to questions so answers match the real app. Call with a query and/or area; use detail "full" when the user needs step-by-step or page-level detail.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search text such as "create invoice", "service log QR", "control panel backup", "customer portal".',
          },
          area: {
            type: 'string',
            description:
              'Optional knowledge area id (e.g. invoices, service-logs, customers, admin, navigation, ai). Prefer query when unsure.',
          },
          detail: {
            type: 'string',
            enum: ['summary', 'full'],
            description: 'summary = short overview; full = pages, functions, workflows (default).',
          },
        },
        additionalProperties: false,
      },
    },
  },
]

export function parseGetAppKnowledgeArgs(raw: unknown): GetAppKnowledgeArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const detailRaw = typeof obj.detail === 'string' ? obj.detail.trim().toLowerCase() : ''
  return {
    query: typeof obj.query === 'string' ? obj.query : undefined,
    area: typeof obj.area === 'string' ? obj.area : undefined,
    detail: detailRaw === 'summary' ? 'summary' : 'full',
  }
}
