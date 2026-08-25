/**
 * Susan SMS action menu — numbered shortcuts plus YES/NO confirm.
 * Shared parsers/types only; executors live in server/services.
 */

import type { PermissionKey } from './permissions/keys'

export const SUSAN_SMS_PENDING_TTL_MS = 15 * 60 * 1000

export type SusanSmsMenuActionId =
  | 'send_invoice'
  | 'send_estimate'
  | 'send_email'
  | 'lookup_invoice'
  | 'lookup_customer'
  | 'lookup_service_log'
  | 'search_catalog'

export type SusanSmsMutatingTool = 'send_invoice' | 'send_estimate' | 'send_email'

export type SusanSmsMenuAction = {
  id: SusanSmsMenuActionId
  label: string
  hint: string
  prompt: string
  permission?: PermissionKey | PermissionKey[]
}

export const SUSAN_SMS_MENU_ACTIONS: SusanSmsMenuAction[] = [
  {
    id: 'send_invoice',
    label: 'Send / resend invoice',
    hint: 'Email the customer the invoice PDF',
    prompt: 'Which invoice? Reply with INV-000713, 713, or a customer name.',
    permission: 'invoices.send.all',
  },
  {
    id: 'send_estimate',
    label: 'Send estimate',
    hint: 'Email a draft estimate to the customer',
    prompt: 'Which estimate? Reply with EST-000042, 42, or a customer name.',
    permission: 'estimates.manage.all',
  },
  {
    id: 'send_email',
    label: 'Email someone',
    hint: 'Start an email to a customer or any address',
    prompt: 'Who should I email? Reply with a customer name or an email address.',
    permission: 'messages.send.own',
  },
  {
    id: 'lookup_invoice',
    label: 'Look up invoice',
    hint: 'Status, total, unpaid / overdue',
    prompt: 'Invoice number, customer name, or unpaid/overdue.',
    permission: 'invoices.read.all',
  },
  {
    id: 'lookup_customer',
    label: 'Look up customer',
    hint: 'Account, contacts, open balance',
    prompt: 'Customer name, email, or phone.',
    permission: 'customers.read.all',
  },
  {
    id: 'lookup_service_log',
    label: 'Look up service log',
    hint: 'Log status and linked invoice',
    prompt: 'Log number (SL-0713), customer, or bus/unit.',
    permission: ['service_logs.read.all', 'service_logs.read.own'],
  },
  {
    id: 'search_catalog',
    label: 'Search catalog',
    hint: 'Parts, labor, fees, packages',
    prompt: 'Part name, labor, or SKU to search.',
    permission: 'catalog.read.all',
  },
]

export type SusanSmsPickOption = {
  n: number
  id: string
  label: string
  extra?: Record<string, string>
}

export type SusanSmsPendingAction =
  | {
      kind: 'wizard'
      action: SusanSmsMenuActionId
      step: 'await_query' | 'await_to' | 'await_subject' | 'await_body' | 'pick'
      data: Record<string, string>
      options?: SusanSmsPickOption[]
      startedAt: string
    }
  | {
      kind: 'confirm'
      tool: SusanSmsMutatingTool
      args: Record<string, string>
      preview: string
      startedAt: string
    }

export type SusanSmsActionResult = {
  ok: boolean
  content: string
  pendingAction?: SusanSmsPendingAction | null
}

export type SusanSmsTurnClass =
  | { type: 'menu' }
  | { type: 'cancel' }
  | { type: 'carrier' }
  | { type: 'confirm' }
  | { type: 'reject' }
  | { type: 'confirm_needed' }
  | { type: 'number', n: number }
  | { type: 'wizard_input' }
  | { type: 'ai' }

/** CTIA/carrier keywords — never ask staff to send these; they unsubscribe or auto-reply. */
const CARRIER_RE = /^(start|stop|stopall|unsubscribe|end|quit|cancel)[\s?!.]*$/i
const BACK_RE = /^(back|go back|nevermind|never mind|forget it|abort|0)[\s?!.]*$/i
const YES_RE = /^(y|yes|yeah|yep|ok|okay|confirm|send it|do it|please send|go ahead)$/i
const NO_RE = /^(n|no|nope|nah|don'?t|do not)$/i
const NUMBER_RE = /^([1-9]|10)[.)]?$/

export function isSusanSmsMenuPhrase(raw: string): boolean {
  const text = String(raw || '').trim().toLowerCase().replace(/[?!.]+$/g, '').trim()
  return text === 'menu'
    || text === 'text menu'
    || text === 'help'
    || text === 'actions'
    || text === 'what can you do'
    || text === 'what can i do'
}

export function visibleSusanSmsMenuActions(
  can: (key: PermissionKey) => boolean,
): SusanSmsMenuAction[] {
  return SUSAN_SMS_MENU_ACTIONS.filter((action) => {
    if (!action.permission) return true
    if (Array.isArray(action.permission)) return action.permission.some(key => can(key))
    return can(action.permission)
  })
}

export function formatSusanSmsMenu(
  actions: SusanSmsMenuAction[],
  firstName?: string | null,
): string {
  const hi = firstName ? `Hi ${firstName} — ` : ''
  if (!actions.length) {
    return `${hi}I can still answer questions about the app. I don't have send or lookup permissions on this account.`
  }
  const lines = actions.map((action, i) => `${i + 1}) ${action.label}`)
  return [
    `${hi}what do you need?`,
    '',
    lines.join('\n\n'),
    '',
    'Reply with a number, or just tell me in your own words.',
    'Text Menu anytime. Text Back to go back.',
  ].join('\n')
}

export function isPendingActionExpired(
  pending: SusanSmsPendingAction | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!pending?.startedAt) return false
  const started = Date.parse(pending.startedAt)
  if (!Number.isFinite(started)) return true
  return nowMs - started > SUSAN_SMS_PENDING_TTL_MS
}

export function classifySusanSmsTurn(
  raw: string,
  pending: SusanSmsPendingAction | null | undefined,
): SusanSmsTurnClass {
  const text = String(raw || '').trim()
  if (!text) return { type: 'ai' }

  if (isSusanSmsMenuPhrase(text)) return { type: 'menu' }
  if (CARRIER_RE.test(text)) return { type: 'carrier' }
  if (BACK_RE.test(text)) return { type: 'cancel' }

  if (pending?.kind === 'confirm') {
    if (YES_RE.test(text)) return { type: 'confirm' }
    if (NO_RE.test(text)) return { type: 'reject' }
    return { type: 'confirm_needed' }
  }

  if (pending?.kind === 'wizard') {
    if (pending.step === 'pick' && NUMBER_RE.test(text)) {
      return { type: 'number', n: Number(text.replace(/[.)]/g, '')) }
    }
    return { type: 'wizard_input' }
  }

  if (NUMBER_RE.test(text)) {
    return { type: 'number', n: Number(text.replace(/[.)]/g, '')) }
  }

  return { type: 'ai' }
}

export function inferSusanSmsActionIntent(raw: string): { action: SusanSmsMenuActionId, query?: string } | null {
  const text = String(raw || '').trim()
  if (!text) return null

  const sendInvoice = text.match(/^(?:please\s+)?(?:send|resend)\s+(?:the\s+)?invoice\b([\s\S]*)$/i)
  if (sendInvoice) {
    const query = sendInvoice[1]?.replace(/^[:\s#-]+/, '').trim()
    return { action: 'send_invoice', query: query || undefined }
  }

  const sendEstimate = text.match(/^(?:please\s+)?send\s+(?:the\s+)?estimate\b([\s\S]*)$/i)
  if (sendEstimate) {
    const query = sendEstimate[1]?.replace(/^[:\s#-]+/, '').trim()
    return { action: 'send_estimate', query: query || undefined }
  }

  const email = text.match(/^(?:please\s+)?(?:email|e-mail)\s+([\s\S]+)$/i)
  if (email) {
    const rest = email[1]?.trim()
    return { action: 'send_email', query: rest || undefined }
  }

  return null
}

export function parseSusanSmsPendingAction(raw: unknown): SusanSmsPendingAction | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const startedAt = typeof obj.startedAt === 'string' ? obj.startedAt : ''
  if (!startedAt) return null

  if (obj.kind === 'confirm') {
    const tool = obj.tool
    if (tool !== 'send_invoice' && tool !== 'send_estimate' && tool !== 'send_email') return null
    const args = obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
      ? Object.fromEntries(
        Object.entries(obj.args as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [k, String(v)]),
      )
      : {}
    return {
      kind: 'confirm',
      tool,
      args,
      preview: typeof obj.preview === 'string' ? obj.preview : '',
      startedAt,
    }
  }

  if (obj.kind === 'wizard') {
    const action = obj.action
    if (!SUSAN_SMS_MENU_ACTIONS.some(a => a.id === action)) return null
    const step = obj.step
    if (
      step !== 'await_query'
      && step !== 'await_to'
      && step !== 'await_subject'
      && step !== 'await_body'
      && step !== 'pick'
    ) {
      return null
    }
    const data = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? Object.fromEntries(
        Object.entries(obj.data as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [k, String(v)]),
      )
      : {}
    const options = Array.isArray(obj.options)
      ? obj.options.flatMap((item, i) => {
        if (!item || typeof item !== 'object') return []
        const row = item as Record<string, unknown>
        const id = typeof row.id === 'string' ? row.id : ''
        const label = typeof row.label === 'string' ? row.label : ''
        if (!id || !label) return []
        const extra = row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra)
          ? Object.fromEntries(
            Object.entries(row.extra as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => [k, String(v)]),
          )
          : undefined
        return [{ n: typeof row.n === 'number' ? row.n : i + 1, id, label, extra }]
      })
      : undefined
    return {
      kind: 'wizard',
      action: action as SusanSmsMenuActionId,
      step,
      data,
      options,
      startedAt,
    }
  }

  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function looksLikeEmail(raw: string): boolean {
  return EMAIL_RE.test(String(raw || '').trim())
}

export function parseSendInvoiceArgs(raw: unknown): {
  invoiceId?: string
  query?: string
  recipientEmail?: string
} {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const invoiceId = typeof obj.invoiceId === 'string' ? obj.invoiceId.trim() : ''
  const query = typeof obj.query === 'string' ? obj.query.trim() : ''
  const recipientEmail = typeof obj.recipientEmail === 'string' ? obj.recipientEmail.trim() : ''
  return {
    invoiceId: invoiceId || undefined,
    query: query || undefined,
    recipientEmail: recipientEmail || undefined,
  }
}

export function parseSendEstimateArgs(raw: unknown): {
  estimateId?: string
  query?: string
} {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const estimateId = typeof obj.estimateId === 'string' ? obj.estimateId.trim() : ''
  const query = typeof obj.query === 'string' ? obj.query.trim() : ''
  return {
    estimateId: estimateId || undefined,
    query: query || undefined,
  }
}

export function parseSendEmailArgs(raw: unknown): {
  toEmail?: string
  customerId?: string
  customerQuery?: string
  subject?: string
  body?: string
} {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const toEmail = typeof obj.toEmail === 'string' ? obj.toEmail.trim() : ''
  const customerId = typeof obj.customerId === 'string' ? obj.customerId.trim() : ''
  const customerQuery = typeof obj.customerQuery === 'string' ? obj.customerQuery.trim() : ''
  const subject = typeof obj.subject === 'string' ? obj.subject.trim() : ''
  const body = typeof obj.body === 'string' ? obj.body.trim() : ''
  return {
    toEmail: toEmail || undefined,
    customerId: customerId || undefined,
    customerQuery: customerQuery || undefined,
    subject: subject || undefined,
    body: body || undefined,
  }
}
