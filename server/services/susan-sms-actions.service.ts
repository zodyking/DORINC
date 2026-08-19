import type { Db } from '../db/client'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { formatEstimateNumber } from '../db/schema/estimates'
import { splitPersonName } from '../../shared/format/person-name'
import {
  extractEstimateNumber,
  extractInvoiceNumber,
} from '../../shared/susan-entity-query'
import {
  classifySusanSmsTurn,
  formatSusanSmsMenu,
  inferSusanSmsActionIntent,
  isPendingActionExpired,
  looksLikeEmail,
  parseSendEmailArgs,
  parseSendEstimateArgs,
  parseSendInvoiceArgs,
  parseSusanSmsPendingAction,
  visibleSusanSmsMenuActions,
  type SusanSmsMenuActionId,
  type SusanSmsPendingAction,
  type SusanSmsPickOption,
  SUSAN_SMS_MENU_ACTIONS,
} from '../../shared/susan-sms-actions'
import { writeAudit } from './audit.service'
import {
  executeLookupCustomer,
  executeLookupInvoice,
  executeLookupServiceLog,
  executeSearchCatalog,
} from './ai-entity-tools.service'
import {
  formatSusanPermissionDenial,
  loadSusanAuthByUserId,
  susanHasPermission,
  susanPermissionDecision,
  type SusanAuthContext,
} from './susan-auth.service'
import {
  findInvoiceIdByNumber,
  getInvoiceDetail,
  InvoicesServiceError,
  isInvoiceResendable,
  listInvoices,
} from './invoices.service'
import {
  InvoiceSendServiceError,
  queueInvoiceSend,
  resolveInvoiceSendRecipient,
} from './invoice-send.service'
import {
  EstimatesServiceError,
  findEstimateIdByNumber,
  getEstimateDetail,
  listEstimates,
  sendEstimate,
} from './estimates.service'
import { EmailInboxError, startEmailThread } from './email-inbox.service'
import { getCustomer, listContacts, listCustomers } from './customers.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SusanSmsActionResult = {
  ok: boolean
  content: string
  pendingAction?: SusanSmsPendingAction | null
}

export type SusanSmsActionTurnResult = {
  handled: boolean
  reply?: string
  pendingAction?: SusanSmsPendingAction | null
}

function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID_RE.test(value.trim())
}

function money(value: unknown): string {
  if (value == null || value === '') return '0.00'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toFixed(2)
}

function nowIso(): string {
  return new Date().toISOString()
}

function firstNameFrom(userName?: string | null): string {
  const first = splitPersonName(String(userName ?? '').trim()).firstName
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function confirmText(preview: string): string {
  return `${preview}\n\nReply YES to send, NO to cancel.`
}

function menuForAuth(auth: SusanAuthContext, firstName?: string | null): string {
  const actions = visibleSusanSmsMenuActions(key => susanHasPermission(auth, key))
  return formatSusanSmsMenu(actions, firstName)
}

function menuActionAt(auth: SusanAuthContext, n: number) {
  const actions = visibleSusanSmsMenuActions(key => susanHasPermission(auth, key))
  return actions[n - 1] ?? null
}

function startWizard(action: SusanSmsMenuActionId): SusanSmsActionResult {
  const def = SUSAN_SMS_MENU_ACTIONS.find(a => a.id === action)
  const step = action === 'send_email' ? 'await_to' as const : 'await_query' as const
  return {
    ok: true,
    content: def?.prompt ?? 'Reply with the details, or CANCEL.',
    pendingAction: {
      kind: 'wizard',
      action,
      step,
      data: {},
      startedAt: nowIso(),
    },
  }
}

function pickList(prompt: string, options: SusanSmsPickOption[], action: SusanSmsMenuActionId, data: Record<string, string> = {}): SusanSmsActionResult {
  const lines = options.map(o => `${o.n} ${o.label}`)
  return {
    ok: true,
    content: [prompt, '', ...lines, '', 'Reply with a number, or CANCEL.'].join('\n'),
    pendingAction: {
      kind: 'wizard',
      action,
      step: 'pick',
      data,
      options,
      startedAt: nowIso(),
    },
  }
}

async function requireAuth(db: Db, userId: string): Promise<SusanAuthContext | null> {
  return loadSusanAuthByUserId(db, userId)
}

function deny(auth: SusanAuthContext, permission: Parameters<typeof susanPermissionDecision>[1]): SusanSmsActionResult {
  const decision = susanPermissionDecision(auth, permission)
  return {
    ok: false,
    content: formatSusanPermissionDenial(permission, decision)
      || `You need permission ${permission} for that.`,
    pendingAction: null,
  }
}

export async function listSusanSmsActionsForUser(db: Db, userId: string): Promise<SusanSmsActionResult> {
  const auth = await requireAuth(db, userId)
  if (!auth) {
    return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  }
  return { ok: true, content: menuForAuth(auth, auth.user.name), pendingAction: null }
}

export async function previewSusanSmsSendInvoice(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<SusanSmsActionResult> {
  const auth = await requireAuth(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  if (!susanHasPermission(auth, 'invoices.send.all')) return deny(auth, 'invoices.send.all')

  const args = parseSendInvoiceArgs(argsRaw)
  const query = args.query || ''
  const invoiceNumber = extractInvoiceNumber(query) || extractInvoiceNumber(args.invoiceId || '')

  if (isUuid(args.invoiceId) && !invoiceNumber) {
    return previewInvoiceById(db, args.invoiceId, args.recipientEmail)
  }
  if (invoiceNumber != null) {
    const id = await findInvoiceIdByNumber(db, invoiceNumber)
    if (!id) {
      return {
        ok: true,
        content: `No invoice found for INV-${String(invoiceNumber).padStart(6, '0')}. Try another number or CANCEL.`,
      }
    }
    return previewInvoiceById(db, id, args.recipientEmail)
  }
  if (!query) {
    return startWizard('send_invoice')
  }

  const listed = await listInvoices(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: 5,
  })
  if (!listed.items.length) {
    return { ok: true, content: `No invoices matched ${JSON.stringify(query)}. Try another search or CANCEL.` }
  }
  if (listed.items.length === 1) {
    return previewInvoiceById(db, listed.items[0]!.id, args.recipientEmail)
  }
  return pickList(
    `I found ${listed.items.length} invoices. Which one?`,
    listed.items.map((row, i) => ({
      n: i + 1,
      id: row.id,
      label: `${row.invoiceNumberFormatted} · ${row.customerName} · $${money(row.total)} [${row.status}]`,
      extra: args.recipientEmail ? { recipientEmail: args.recipientEmail } : undefined,
    })),
    'send_invoice',
    args.recipientEmail ? { recipientEmail: args.recipientEmail } : {},
  )
}

async function previewInvoiceById(
  db: Db,
  invoiceId: string,
  recipientEmail?: string,
): Promise<SusanSmsActionResult> {
  try {
    const inv = await getInvoiceDetail(db, invoiceId)
    const override = recipientEmail?.trim()
    const recipient = override
      ? { email: override, name: inv.customerName }
      : await resolveInvoiceSendRecipient(db, inv.customerId)
    if (!recipient?.email) {
      return {
        ok: true,
        content: `${inv.invoiceNumberFormatted} (${inv.customerName}) has no billing email on file. Add one in the app, then try again.`,
        pendingAction: null,
      }
    }
    const verb = isInvoiceResendable(inv.status) ? 'resend' : 'send'
    const preview = `I'll ${verb} ${inv.invoiceNumberFormatted} ($${money(inv.total)}, ${inv.status}) for ${inv.customerName} to ${recipient.email}.`
    return {
      ok: true,
      content: confirmText(preview),
      pendingAction: {
        kind: 'confirm',
        tool: 'send_invoice',
        args: {
          invoiceId: inv.id,
          ...(override ? { recipientEmail: override } : {}),
        },
        preview,
        startedAt: nowIso(),
      },
    }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      return { ok: true, content: 'That invoice was not found.', pendingAction: null }
    }
    throw err
  }
}

export async function previewSusanSmsSendEstimate(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<SusanSmsActionResult> {
  const auth = await requireAuth(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  if (!susanHasPermission(auth, 'estimates.manage.all')) return deny(auth, 'estimates.manage.all')

  const args = parseSendEstimateArgs(argsRaw)
  const query = args.query || ''
  const estimateNumber = extractEstimateNumber(query) || extractEstimateNumber(args.estimateId || '')

  if (isUuid(args.estimateId) && !estimateNumber) {
    return previewEstimateById(db, args.estimateId)
  }
  if (estimateNumber != null) {
    const id = await findEstimateIdByNumber(db, estimateNumber)
    if (!id) {
      return {
        ok: true,
        content: `No estimate found for EST-${String(estimateNumber).padStart(6, '0')}. Try another number or CANCEL.`,
      }
    }
    return previewEstimateById(db, id)
  }
  if (!query) return startWizard('send_estimate')

  const listed = await listEstimates(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: 5,
  })
  if (!listed.items.length) {
    return { ok: true, content: `No estimates matched ${JSON.stringify(query)}. Try another search or CANCEL.` }
  }
  if (listed.items.length === 1) {
    return previewEstimateById(db, listed.items[0]!.id)
  }
  return pickList(
    `I found ${listed.items.length} estimates. Which one?`,
    listed.items.map((row, i) => ({
      n: i + 1,
      id: row.id,
      label: `${row.estimateNumberFormatted} · ${row.customerName} · $${money(row.total)} [${row.status}]`,
    })),
    'send_estimate',
  )
}

async function previewEstimateById(db: Db, estimateId: string): Promise<SusanSmsActionResult> {
  try {
    const est = await getEstimateDetail(db, estimateId)
    if (est.status !== 'draft') {
      return {
        ok: true,
        content: `${est.estimateNumberFormatted} is ${est.status} — I can only send draft estimates.`,
        pendingAction: null,
      }
    }
    const recipient = await resolveInvoiceSendRecipient(db, est.customerId)
    const to = recipient?.email ? ` to ${recipient.email}` : ' (no billing email on file — send may not notify)'
    const preview = `I'll send ${est.estimateNumberFormatted} ($${money(est.total)}) for ${est.customerName}${to}.`
    return {
      ok: true,
      content: confirmText(preview),
      pendingAction: {
        kind: 'confirm',
        tool: 'send_estimate',
        args: { estimateId: est.id },
        preview,
        startedAt: nowIso(),
      },
    }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError && err.code === 'NOT_FOUND') {
      return { ok: true, content: 'That estimate was not found.', pendingAction: null }
    }
    throw err
  }
}

export async function previewSusanSmsSendEmail(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<SusanSmsActionResult> {
  const auth = await requireAuth(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  if (!susanHasPermission(auth, 'messages.send.own')) return deny(auth, 'messages.send.own')

  const args = parseSendEmailArgs(argsRaw)
  const resolved = await resolveEmailRecipient(db, auth, args)
  if (resolved.kind === 'result') return resolved.result
  if (resolved.kind === 'need_to') {
    return {
      ok: true,
      content: 'Who should I email? Reply with a customer name or an email address.',
      pendingAction: {
        kind: 'wizard',
        action: 'send_email',
        step: 'await_to',
        data: {
          ...(args.subject ? { subject: args.subject } : {}),
          ...(args.body ? { body: args.body } : {}),
        },
        startedAt: nowIso(),
      },
    }
  }
  if (!args.subject) {
    return {
      ok: true,
      content: `To: ${resolved.label}. What's the subject?`,
      pendingAction: {
        kind: 'wizard',
        action: 'send_email',
        step: 'await_subject',
        data: {
          toEmail: resolved.toEmail,
          ...(resolved.customerId ? { customerId: resolved.customerId } : {}),
          recipientLabel: resolved.label,
          ...(args.body ? { body: args.body } : {}),
        },
        startedAt: nowIso(),
      },
    }
  }
  if (!args.body) {
    return {
      ok: true,
      content: `Subject: ${args.subject}. What's the message?`,
      pendingAction: {
        kind: 'wizard',
        action: 'send_email',
        step: 'await_body',
        data: {
          toEmail: resolved.toEmail,
          ...(resolved.customerId ? { customerId: resolved.customerId } : {}),
          recipientLabel: resolved.label,
          subject: args.subject,
        },
        startedAt: nowIso(),
      },
    }
  }

  const preview = `I'll email ${resolved.label} (${resolved.toEmail})\nSubject: ${args.subject}\n${args.body}`
  return {
    ok: true,
    content: confirmText(preview),
    pendingAction: {
      kind: 'confirm',
      tool: 'send_email',
      args: {
        toEmail: resolved.toEmail,
        ...(resolved.customerId ? { customerId: resolved.customerId } : {}),
        subject: args.subject,
        body: args.body,
      },
      preview,
      startedAt: nowIso(),
    },
  }
}

type EmailRecipientResolution =
  | { kind: 'resolved', toEmail: string, customerId?: string, label: string }
  | { kind: 'need_to' }
  | { kind: 'result', result: SusanSmsActionResult }

async function resolveEmailRecipient(
  db: Db,
  auth: SusanAuthContext,
  args: { toEmail?: string, customerId?: string, customerQuery?: string },
): Promise<EmailRecipientResolution> {
  if (isUuid(args.customerId)) {
    try {
      const customer = await getCustomer(db, args.customerId)
      const contacts = await listContacts(db, customer.id)
      const email = args.toEmail
        || contacts.find(c => c.isBilling && c.email)?.email
        || contacts.find(c => c.isPrimary && c.email)?.email
        || contacts.find(c => c.email)?.email
        || customer.email
      if (!email) {
        return {
          kind: 'result',
          result: {
            ok: true,
            content: `${customer.displayName} has no email on file. Add one in the app, or send to another address.`,
            pendingAction: null,
          },
        }
      }
      if (args.toEmail && args.toEmail.toLowerCase() !== email.toLowerCase()) {
        const allowed = new Set(
          [customer.email, ...contacts.map(c => c.email)].filter(Boolean).map(e => String(e).toLowerCase()),
        )
        if (!allowed.has(args.toEmail.toLowerCase())) {
          return {
            kind: 'result',
            result: {
              ok: true,
              content: `${args.toEmail} is not an email on ${customer.displayName}'s account.`,
              pendingAction: null,
            },
          }
        }
      }
      return {
        kind: 'resolved',
        toEmail: (args.toEmail || email).toLowerCase(),
        customerId: customer.id,
        label: customer.displayName,
      }
    }
    catch {
      return { kind: 'result', result: { ok: true, content: 'That customer was not found.', pendingAction: null } }
    }
  }

  const q = (args.toEmail || args.customerQuery || '').trim()
  if (!q) return { kind: 'need_to' }

  if (looksLikeEmail(q)) {
    const listed = await listCustomers(db, {
      q,
      includeArchived: false,
      page: 1,
      pageSize: 5,
    })
    const match = listed.items.find(c => c.email?.toLowerCase() === q.toLowerCase())
    if (match) {
      return { kind: 'resolved', toEmail: q.toLowerCase(), customerId: match.id, label: match.displayName }
    }
    if (!susanHasPermission(auth, 'email.send_noncustomer.all')) {
      return { kind: 'result', result: deny(auth, 'email.send_noncustomer.all') }
    }
    return { kind: 'resolved', toEmail: q.toLowerCase(), label: q.toLowerCase() }
  }

  const listed = await listCustomers(db, {
    q,
    includeArchived: false,
    page: 1,
    pageSize: 5,
  })
  if (!listed.items.length) {
    return {
      kind: 'result',
      result: { ok: true, content: `No customers matched ${JSON.stringify(q)}. Try a name, an email, or CANCEL.` },
    }
  }
  if (listed.items.length > 1) {
    return {
      kind: 'result',
      result: pickList(
        `I found ${listed.items.length} customers. Who should I email?`,
        listed.items.map((row, i) => ({
          n: i + 1,
          id: row.id,
          label: `${row.displayName}${row.email ? ` · ${row.email}` : ''}`,
        })),
        'send_email',
      ),
    }
  }
  const customer = listed.items[0]!
  return resolveEmailRecipient(db, auth, { customerId: customer.id, toEmail: args.toEmail })
}

async function commitSendInvoice(
  db: Db,
  auth: SusanAuthContext,
  args: Record<string, string>,
): Promise<SusanSmsActionResult> {
  try {
    const result = await queueInvoiceSend(
      db,
      args.invoiceId,
      auth.user.id,
      args.recipientEmail ? { recipientEmail: args.recipientEmail } : undefined,
    )
    await writeAudit(null, {
      entityType: 'invoice',
      entityId: args.invoiceId,
      action: result.alreadyQueued ? 'invoices.send_queued' : 'invoices.send_queued',
      actor: { id: auth.user.id, accountType: auth.user.accountType, name: auth.user.name },
      permissionKey: 'invoices.send.all',
      riskLevel: 'sensitive',
      afterData: {
        via: 'susan_sms',
        sendJobId: result.job.id,
        recipientEmail: result.recipient.email,
      },
    })
    const label = formatInvoiceNumber(result.invoice.invoiceNumber)
    const already = result.alreadyQueued ? ' Delivery was already in progress.' : ''
    return {
      ok: true,
      content: `Queued. ${label} will go to ${result.recipient.email}.${already} Text MENU for more.`,
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof InvoiceSendServiceError) {
      return { ok: false, content: invoiceSendSmsError(err), pendingAction: null }
    }
    throw err
  }
}

function invoiceSendSmsError(err: InvoiceSendServiceError): string {
  switch (err.code) {
    case 'NOT_FOUND':
      return 'That invoice was not found.'
    case 'INVALID_TRANSITION':
      return 'That invoice cannot be emailed from its current status.'
    case 'NO_RECIPIENT':
      return 'No billing email is on file for that customer.'
    case 'ALREADY_QUEUED':
      return 'That invoice is already queued for delivery.'
    case 'NOTIFICATION_DISABLED':
      return 'Invoice emails are disabled in Control Panel → Notifications.'
    case 'PDF_FAILED':
      return 'PDF generation failed — try again from the app.'
    default:
      return 'I could not queue that invoice send.'
  }
}

async function commitSendEstimate(
  db: Db,
  auth: SusanAuthContext,
  args: Record<string, string>,
): Promise<SusanSmsActionResult> {
  try {
    const { estimate } = await sendEstimate(db, args.estimateId, auth.user.id)
    await writeAudit(null, {
      entityType: 'estimate',
      entityId: args.estimateId,
      action: 'estimates.send',
      actor: { id: auth.user.id, accountType: auth.user.accountType, name: auth.user.name },
      permissionKey: 'estimates.manage.all',
      riskLevel: 'sensitive',
      afterData: { via: 'susan_sms', status: estimate.status },
    })
    const label = formatEstimateNumber(estimate.estimateNumber)
    return {
      ok: true,
      content: `Sent. ${label} is now marked sent. Text MENU for more.`,
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') return { ok: false, content: 'That estimate was not found.', pendingAction: null }
      if (err.code === 'INVALID_TRANSITION') {
        return { ok: false, content: 'That estimate cannot be sent from its current status.', pendingAction: null }
      }
    }
    throw err
  }
}

async function commitSendEmail(
  db: Db,
  auth: SusanAuthContext,
  args: Record<string, string>,
): Promise<SusanSmsActionResult> {
  try {
    const canSendNonCustomer = susanHasPermission(auth, 'email.send_noncustomer.all')
    await startEmailThread(
      db,
      auth.user.id,
      {
        customerId: args.customerId || undefined,
        toEmail: args.toEmail,
        subject: args.subject,
        body: args.body,
      },
      [],
      { canSendNonCustomer },
    )
    await writeAudit(null, {
      entityType: 'email',
      entityId: args.customerId || args.toEmail,
      action: 'email.thread_started',
      actor: { id: auth.user.id, accountType: auth.user.accountType, name: auth.user.name },
      permissionKey: 'messages.send.own',
      riskLevel: 'sensitive',
      afterData: { via: 'susan_sms', toEmail: args.toEmail, subject: args.subject },
    })
    return {
      ok: true,
      content: `Sent. Email went to ${args.toEmail}. Text MENU for more.`,
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof EmailInboxError) {
      if (err.code === 'NOT_CONFIGURED') {
        return { ok: false, content: 'Email is not configured (SMTP). An admin can set that in Control Panel.', pendingAction: null }
      }
      if (err.code === 'INVALID_RECIPIENT') {
        return { ok: false, content: 'That address is not a valid recipient.', pendingAction: null }
      }
      if (err.code === 'NOT_ALLOWED') {
        return deny(auth, 'email.send_noncustomer.all')
      }
      if (err.code === 'SEND_FAILED') {
        return { ok: false, content: 'The email could not be delivered. Try again from Messages.', pendingAction: null }
      }
    }
    throw err
  }
}

async function commitPending(
  db: Db,
  auth: SusanAuthContext,
  pending: Extract<SusanSmsPendingAction, { kind: 'confirm' }>,
): Promise<SusanSmsActionResult> {
  if (pending.tool === 'send_invoice') return commitSendInvoice(db, auth, pending.args)
  if (pending.tool === 'send_estimate') return commitSendEstimate(db, auth, pending.args)
  return commitSendEmail(db, auth, pending.args)
}

type SusanSmsMutatingId = 'send_invoice' | 'send_estimate' | 'send_email'

async function runLookup(
  db: Db,
  userId: string,
  action: Exclude<SusanSmsMenuActionId, SusanSmsMutatingId>,
  query: string,
): Promise<SusanSmsActionResult> {
  if (action === 'lookup_invoice') {
    const result = await executeLookupInvoice(db, userId, { query })
    return { ok: result.ok, content: `${result.content}\n\nText MENU for more.`, pendingAction: null }
  }
  if (action === 'lookup_customer') {
    const result = await executeLookupCustomer(db, userId, { query })
    return { ok: result.ok, content: `${result.content}\n\nText MENU for more.`, pendingAction: null }
  }
  if (action === 'lookup_service_log') {
    const result = await executeLookupServiceLog(db, userId, { query })
    return { ok: result.ok, content: `${result.content}\n\nText MENU for more.`, pendingAction: null }
  }
  const result = await executeSearchCatalog(db, userId, { query })
  return { ok: result.ok, content: `${result.content}\n\nText MENU for more.`, pendingAction: null }
}

async function continueWizard(
  db: Db,
  userId: string,
  pending: Extract<SusanSmsPendingAction, { kind: 'wizard' }>,
  text: string,
): Promise<SusanSmsActionResult> {
  const action = pending.action

  if (pending.step === 'pick') {
    const n = Number(text.replace(/[.)]/g, ''))
    const option = pending.options?.find(o => o.n === n)
    if (!option) {
      return {
        ok: true,
        content: 'Reply with a number from the list, or CANCEL.',
        pendingAction: pending,
      }
    }
    if (action === 'send_invoice') {
      return previewSusanSmsSendInvoice(db, userId, {
        invoiceId: option.id,
        recipientEmail: option.extra?.recipientEmail || pending.data.recipientEmail,
      })
    }
    if (action === 'send_estimate') {
      return previewSusanSmsSendEstimate(db, userId, { estimateId: option.id })
    }
    if (action === 'send_email') {
      return previewSusanSmsSendEmail(db, userId, {
        customerId: option.id,
        subject: pending.data.subject,
        body: pending.data.body,
      })
    }
    return runLookup(db, userId, action, option.id)
  }

  if (action === 'send_invoice') {
    return previewSusanSmsSendInvoice(db, userId, {
      query: text,
      recipientEmail: pending.data.recipientEmail,
    })
  }
  if (action === 'send_estimate') {
    return previewSusanSmsSendEstimate(db, userId, { query: text })
  }
  if (action === 'send_email') {
    if (pending.step === 'await_to') {
      return previewSusanSmsSendEmail(db, userId, {
        customerQuery: text,
        toEmail: looksLikeEmail(text) ? text : undefined,
        subject: pending.data.subject,
        body: pending.data.body,
      })
    }
    if (pending.step === 'await_subject') {
      return previewSusanSmsSendEmail(db, userId, {
        toEmail: pending.data.toEmail,
        customerId: pending.data.customerId,
        subject: text,
        body: pending.data.body,
      })
    }
    if (pending.step === 'await_body') {
      return previewSusanSmsSendEmail(db, userId, {
        toEmail: pending.data.toEmail,
        customerId: pending.data.customerId,
        subject: pending.data.subject,
        body: text,
      })
    }
    return startWizard('send_email')
  }

  if (action === 'send_invoice' || action === 'send_estimate' || action === 'send_email') {
    return startWizard(action)
  }

  return runLookup(db, userId, action, text)
}

/**
 * Intercept SMS turns that belong to the numbered menu / YES-NO confirm
 * flow so they do not depend on the LLM.
 */
export async function handleSusanSmsActionTurn(
  db: Db,
  input: {
    userId: string
    userName?: string | null
    question: string
    pending: unknown
  },
): Promise<SusanSmsActionTurnResult> {
  const auth = await requireAuth(db, input.userId)
  if (!auth) return { handled: false }

  const first = firstNameFrom(input.userName || auth.user.name)
  let pending = parseSusanSmsPendingAction(input.pending)
  const question = String(input.question || '').trim()

  if (pending && isPendingActionExpired(pending)) {
    const cls = classifySusanSmsTurn(question, pending)
    pending = null
    if (cls.type === 'confirm' || cls.type === 'reject' || cls.type === 'confirm_needed' || cls.type === 'wizard_input') {
      return {
        handled: true,
        reply: 'That timed out. Text MENU to start over.',
        pendingAction: null,
      }
    }
  }

  const cls = classifySusanSmsTurn(question, pending)

  if (cls.type === 'menu') {
    return { handled: true, reply: menuForAuth(auth, first), pendingAction: null }
  }
  if (cls.type === 'cancel') {
    if (!pending) {
      return { handled: true, reply: 'Nothing to cancel. Text MENU for actions.', pendingAction: null }
    }
    return { handled: true, reply: 'Cancelled. Text MENU for actions.', pendingAction: null }
  }
  if (cls.type === 'reject') {
    return { handled: true, reply: 'Cancelled. Text MENU for actions.', pendingAction: null }
  }
  if (cls.type === 'confirm' && pending?.kind === 'confirm') {
    const result = await commitPending(db, auth, pending)
    return { handled: true, reply: result.content, pendingAction: result.pendingAction ?? null }
  }
  if (cls.type === 'confirm_needed' && pending?.kind === 'confirm') {
    return {
      handled: true,
      reply: `${pending.preview}\n\nReply YES to send, NO to cancel, or MENU.`,
      pendingAction: pending,
    }
  }
  if (cls.type === 'number' && pending?.kind === 'wizard' && pending.step === 'pick') {
    const result = await continueWizard(db, input.userId, pending, question)
    return { handled: true, reply: result.content, pendingAction: result.pendingAction ?? null }
  }
  if (cls.type === 'wizard_input' && pending?.kind === 'wizard') {
    const result = await continueWizard(db, input.userId, pending, question)
    return { handled: true, reply: result.content, pendingAction: result.pendingAction ?? null }
  }
  if (cls.type === 'number' && !pending) {
    const action = menuActionAt(auth, cls.n)
    if (!action) {
      return { handled: true, reply: menuForAuth(auth, first), pendingAction: null }
    }
    const result = startWizard(action.id)
    return { handled: true, reply: result.content, pendingAction: result.pendingAction ?? null }
  }

  const intent = inferSusanSmsActionIntent(question)
  if (intent) {
    let result: SusanSmsActionResult
    if (intent.action === 'send_invoice') {
      result = await previewSusanSmsSendInvoice(db, input.userId, { query: intent.query })
    }
    else if (intent.action === 'send_estimate') {
      result = await previewSusanSmsSendEstimate(db, input.userId, { query: intent.query })
    }
    else if (intent.action === 'send_email') {
      result = await previewSusanSmsSendEmail(db, input.userId, {
        customerQuery: intent.query,
        toEmail: intent.query && looksLikeEmail(intent.query) ? intent.query : undefined,
      })
    }
    else {
      result = startWizard(intent.action)
    }
    return { handled: true, reply: result.content, pendingAction: result.pendingAction ?? null }
  }

  return { handled: false }
}
