/**
 * OpenAI-compatible tool definitions for Susan (platform help).
 * Executors live in server/services; this module is shared schema only.
 */

export type AiToolName =
  | 'get_app_knowledge'
  | 'lookup_invoice'
  | 'lookup_service_log'
  | 'lookup_customer'
  | 'search_catalog'

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

export type EntityLookupArgs = {
  id?: string
  query?: string
  limit?: number
}

export type SearchCatalogArgs = {
  query?: string
  itemType?: 'part' | 'labor' | 'fee' | 'package' | 'rate'
  limit?: number
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
  {
    type: 'function',
    function: {
      name: 'lookup_invoice',
      description:
        'Read-only lookup of invoice records the staff member is allowed to see. Use when the user asks about a specific invoice, balance, status, due date, or line items. Pass id (UUID) and/or query (invoice number, customer name, bus/unit, PO).',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Invoice UUID when known.',
          },
          query: {
            type: 'string',
            description: 'Search text: invoice number, customer name, bus/unit tag, or PO.',
          },
          limit: {
            type: 'integer',
            description: 'Max search results when using query (default 5, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_service_log',
      description:
        'Read-only lookup of service log records the staff member is allowed to see. Use for status, review queue, linked invoice, or work details. Pass id (UUID) and/or query (SL number, customer, bus/unit, complaint).',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Service log UUID when known.',
          },
          query: {
            type: 'string',
            description: 'Search text: log number, customer name, bus/unit, or complaint keywords.',
          },
          limit: {
            type: 'integer',
            description: 'Max search results when using query (default 5, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_customer',
      description:
        'Read-only lookup of customer accounts the staff member is allowed to see. Use for account details, portal status, contacts, and open balance summary. Pass id (UUID) and/or query (name, email, phone, bus/VIN).',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Customer UUID when known.',
          },
          query: {
            type: 'string',
            description: 'Search text: display name, email, phone, contact, or fleet unit.',
          },
          limit: {
            type: 'integer',
            description: 'Max search results when using query (default 5, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_catalog',
      description:
        'Read-only catalog search for parts, labor, fees, packages, and labor rates. Use when the user asks what items exist, prices, SKUs, or package contents. Does not expose cost/markup.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text: name, SKU, or description.',
          },
          itemType: {
            type: 'string',
            enum: ['part', 'labor', 'fee', 'package', 'rate'],
            description: 'Optional filter. Omit to search items + packages + rates.',
          },
          limit: {
            type: 'integer',
            description: 'Max results per category bucket (default 5, max 8).',
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

export function parseEntityLookupArgs(raw: unknown): EntityLookupArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const limitRaw = Number(obj.limit)
  return {
    id: typeof obj.id === 'string' ? obj.id.trim() : undefined,
    query: typeof obj.query === 'string' ? obj.query.trim() : undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
  }
}

export function parseSearchCatalogArgs(raw: unknown): SearchCatalogArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const typeRaw = typeof obj.itemType === 'string' ? obj.itemType.trim().toLowerCase() : ''
  const allowed = new Set(['part', 'labor', 'fee', 'package', 'rate'])
  const limitRaw = Number(obj.limit)
  return {
    query: typeof obj.query === 'string' ? obj.query.trim() : undefined,
    itemType: allowed.has(typeRaw)
      ? (typeRaw as SearchCatalogArgs['itemType'])
      : undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
  }
}
