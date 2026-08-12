/**
 * OpenAI-compatible tool definitions for Susan (platform help).
 * Executors live in server/services; this module is shared schema only.
 */

import {
  parseCustomerRankMetric,
  parseInvoiceLookupSort,
  parseInvoiceLookupStatus,
  type CustomerRankMetric,
  type InvoiceLookupSort,
} from './susan-entity-query'

export type AiToolName =
  | 'get_app_knowledge'
  | 'lookup_invoice'
  | 'lookup_service_log'
  | 'lookup_customer'
  | 'lookup_vehicle'
  | 'rank_customers'
  | 'ar_aging'
  | 'revenue_summary'
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

export type InvoiceLookupArgs = EntityLookupArgs & {
  /** Filter or KPI mode. unpaid/outstanding = sent with balance due; stats = KPI summary. */
  status?:
    | 'draft'
    | 'pending_manager_approval'
    | 'sent'
    | 'paid'
    | 'void'
    | 'unpaid'
    | 'outstanding'
    | 'overdue'
    | 'stats'
  /** List ranking — oldest, newest, amount, due date. */
  sort?: InvoiceLookupSort
  dateFrom?: string
  dateTo?: string
}

export type RankCustomersArgs = {
  metric?: CustomerRankMetric
  query?: string
  limit?: number
}

export type RevenueSummaryArgs = {
  from?: string
  to?: string
  query?: string
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
        'Read-only invoice lookup and ranking. Use for a specific invoice (INV-000713), unpaid/overdue/stats, or ranked lists (oldest, newest, largest). Set sort to oldest|newest|amount_high for questions like "oldest invoices" or "largest invoices". Do not invent invoice numbers or balances.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Invoice UUID when known.',
          },
          query: {
            type: 'string',
            description:
              'Invoice label (INV-000713), bare number (713), customer name, bus/unit, PO, or phrases like "oldest invoices", "unpaid invoices".',
          },
          status: {
            type: 'string',
            enum: [
              'draft',
              'pending_manager_approval',
              'sent',
              'paid',
              'void',
              'unpaid',
              'outstanding',
              'overdue',
              'stats',
            ],
            description:
              'Optional filter/KPI: unpaid/outstanding = sent with balance due; overdue = past due; stats = invoice KPI summary.',
          },
          sort: {
            type: 'string',
            enum: ['newest', 'oldest', 'invoice_date', 'due_date', 'amount_high', 'amount_low'],
            description:
              'List ranking. Use oldest for earliest invoices, newest for recent, amount_high for largest totals.',
          },
          dateFrom: {
            type: 'string',
            description: 'Optional ISO date (YYYY-MM-DD) lower bound on invoice date.',
          },
          dateTo: {
            type: 'string',
            description: 'Optional ISO date (YYYY-MM-DD) upper bound on invoice date.',
          },
          limit: {
            type: 'integer',
            description: 'Max search results when listing (default 5, max 8).',
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
        'Read-only service log lookup. Use for a specific log (e.g. SL-0713 → query "SL-0713"), review status, linked invoice, or work details. Do not invent log numbers.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Service log UUID when known.',
          },
          query: {
            type: 'string',
            description:
              'Log label (SL-0713), bare number, customer name, bus/unit, or complaint keywords.',
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
        'Read-only lookup of customer accounts. Use for account details, portal status, contacts, open balance, and lifetime billed. Pass id (UUID) and/or query (name, email, phone, bus/VIN). For "top paying customer" use rank_customers instead.',
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
      name: 'lookup_vehicle',
      description:
        'Read-only vehicle / fleet unit lookup by bus number, unit tag, VIN, plate, make/model, or customer name. Use when the user asks about a bus, unit, or vehicle record.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Vehicle UUID when known.',
          },
          query: {
            type: 'string',
            description: 'Bus/unit number, VIN, plate, make/model, or owning customer name.',
          },
          limit: {
            type: 'integer',
            description: 'Max search results (default 5, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rank_customers',
      description:
        'Rank customers by billing metrics. Use for "top paying customer", "highest open balance", "most invoices", or "most paid". Returns ranked rows with lifetime billed, amount paid, open balance, and invoice counts.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['lifetime_billed', 'open_balance', 'amount_paid', 'invoice_count'],
            description:
              'Ranking metric. lifetime_billed = top paying / most revenue; amount_paid = collections; open_balance = most owed; invoice_count = most invoices.',
          },
          query: {
            type: 'string',
            description: 'Optional free-text such as "top paying customer" (metric is inferred when omitted).',
          },
          limit: {
            type: 'integer',
            description: 'How many ranked customers to return (default 5, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ar_aging',
      description:
        'Accounts-receivable aging for sent invoices with a balance due. Use for aging buckets (current, 1–30, 31–60, 61–90, 90+), overdue AR breakdown, or who owes what by age.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Max sample invoices per aging bucket (default 3, max 8).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revenue_summary',
      description:
        'Revenue / collections summary for a date range (invoiced, collected, outstanding, monthly breakdown). Use for "how much did we bill this year", "collections last month", or revenue trends.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Range start YYYY-MM-DD (default: 11 months ago, first of month).',
          },
          to: {
            type: 'string',
            description: 'Range end YYYY-MM-DD (default: today).',
          },
          query: {
            type: 'string',
            description: 'Optional phrase like "this year" or "last month" for soft date hints.',
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

function parseOptionalIsoDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined
  return text
}

export function parseInvoiceLookupArgs(raw: unknown): InvoiceLookupArgs {
  const base = parseEntityLookupArgs(raw)
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    ...base,
    status: parseInvoiceLookupStatus(obj.status),
    sort: parseInvoiceLookupSort(obj.sort),
    dateFrom: parseOptionalIsoDate(obj.dateFrom),
    dateTo: parseOptionalIsoDate(obj.dateTo),
  }
}

export function parseRankCustomersArgs(raw: unknown): RankCustomersArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const limitRaw = Number(obj.limit)
  return {
    metric: parseCustomerRankMetric(obj.metric),
    query: typeof obj.query === 'string' ? obj.query.trim() : undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
  }
}

export function parseRevenueSummaryArgs(raw: unknown): RevenueSummaryArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    from: parseOptionalIsoDate(obj.from),
    to: parseOptionalIsoDate(obj.to),
    query: typeof obj.query === 'string' ? obj.query.trim() : undefined,
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
