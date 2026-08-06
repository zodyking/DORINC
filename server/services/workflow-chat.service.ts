import type { Db } from '../db/client'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { formatMoney, parseMoney } from '../../shared/money'
import { formatVehicleUnitLabel } from '../../shared/format/vehicle-unit'
import {
  buildEntityRef,
  entityRefToken,
  postTeamChatMessage,
} from './team-chat.service'

function vehicleUnitLabel(
  busNumber: string | null | undefined,
  unitTag: string | null | undefined,
  unitType?: string | null,
  fallback = 'vehicle',
): string {
  const number = unitTag?.trim() || busNumber?.trim()
  if (!number) return fallback
  return formatVehicleUnitLabel({ unitType, busNumber, unitTag })
}

function moneyLabel(value: string): string {
  return `$${formatMoney(parseMoney(value))}`
}

/** Mechanic sent service log to invoice — ask billing to complete the draft. */
export async function postServiceLogSentToInvoiceTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    serviceLogId: string
    logNumber: number
    customerId: string | null
    customerName: string
    vehicleId: string | null
    vehicleBusNumber: string | null
    vehicleUnitTag: string | null
    vehicleUnitType?: string | null
    invoiceId: string
    invoiceNumber: number
  },
) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const slLabel = `SL-${opts.logNumber}`
  const unitLabel = vehicleUnitLabel(opts.vehicleBusNumber, opts.vehicleUnitTag, opts.vehicleUnitType, 'vehicle')

  const refs = []
  const parts: string[] = ['Can you create']

  parts.push(entityRefToken('invoice', opts.invoiceId, invoiceLabel))
  refs.push(buildEntityRef('invoice', opts.invoiceId, invoiceLabel))

  parts.push('for')
  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
    refs.push(buildEntityRef('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }

  parts.push('using')
  if (opts.vehicleId) {
    parts.push(entityRefToken('vehicle', opts.vehicleId, unitLabel))
    refs.push(buildEntityRef('vehicle', opts.vehicleId, unitLabel))
  }
  else {
    parts.push(unitLabel)
  }

  parts.push('and')
  parts.push(entityRefToken('service_log', opts.serviceLogId, slLabel))
  refs.push(buildEntityRef('service_log', opts.serviceLogId, slLabel))
  parts.push('?')

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body: parts.join(' '),
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

export async function postInvoiceCreatedTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    invoiceId: string
    invoiceNumber: number
    customerId: string | null
    customerName: string
  },
) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const parts = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    'has been created for',
  ]

  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
    refs.push(buildEntityRef('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body: parts.join(' '),
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

export async function postInvoiceSentTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    invoiceId: string
    invoiceNumber: number
    customerId: string | null
    customerName: string
    isResend?: boolean
  },
) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const verb = opts.isResend ? 'has been resent to' : 'has been sent to'
  const parts = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    verb,
  ]

  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
    refs.push(buildEntityRef('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body: parts.join(' '),
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

export async function postCustomerCreatedTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    customerId: string
    customerName: string
  },
) {
  const refs = [buildEntityRef('customer', opts.customerId, opts.customerName)]
  const body = [
    entityRefToken('customer', opts.customerId, opts.customerName),
    'was created',
  ].join(' ')

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

export async function postVehicleCreatedTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    vehicleId: string
    customerId: string
    customerName: string
    busNumber: string | null
    unitTag: string | null
    unitType?: string | null
  },
) {
  const unitLabel = vehicleUnitLabel(opts.busNumber, opts.unitTag, opts.unitType)
  const refs = [
    buildEntityRef('vehicle', opts.vehicleId, unitLabel),
    buildEntityRef('customer', opts.customerId, opts.customerName),
  ]
  const body = [
    entityRefToken('vehicle', opts.vehicleId, unitLabel),
    'was created for',
    entityRefToken('customer', opts.customerId, opts.customerName),
  ].join(' ')

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

export async function postInvoicePaymentReceivedTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    invoiceId: string
    invoiceNumber: number
    customerId: string | null
    customerName: string
    paymentAmount: string
    paidInFull: boolean
  },
) {
  // Fully paid → status-change copy; partial payments keep amount-focused wording.
  if (opts.paidInFull) {
    return postInvoicePaymentStatusTeamMessage(db, {
      senderUserId: opts.senderUserId,
      invoiceId: opts.invoiceId,
      invoiceNumber: opts.invoiceNumber,
      customerId: opts.customerId,
      customerName: opts.customerName,
      status: 'paid',
    })
  }

  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const amount = moneyLabel(opts.paymentAmount)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const parts: string[] = [
    'Partial payment of',
    amount,
    'received for',
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    'for',
  ]

  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
    refs.push(buildEntityRef('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body: parts.join(' '),
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

/** Single invoice payment status change (paid / unpaid). */
export function buildInvoicePaymentStatusTeamMessageBody(opts: {
  invoiceId: string
  invoiceNumber: number
  customerId: string | null
  customerName: string
  status: 'paid' | 'unpaid'
}) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const customerPart = opts.customerId
    ? entityRefToken('customer', opts.customerId, opts.customerName)
    : opts.customerName
  if (opts.customerId) {
    refs.push(buildEntityRef('customer', opts.customerId, opts.customerName))
  }

  const body = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    'for',
    customerPart,
    'payment status has been set to',
    opts.status,
  ].join(' ')

  return { body, refs }
}

export async function postInvoicePaymentStatusTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    invoiceId: string
    invoiceNumber: number
    customerId: string | null
    customerName: string
    status: 'paid' | 'unpaid'
  },
) {
  const { body, refs } = buildInvoicePaymentStatusTeamMessageBody(opts)
  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

/** Bulk reconciliation chat — one line per customer. */
export function buildBulkInvoicePaymentStatusTeamMessageBody(opts: {
  status: 'paid' | 'unpaid'
  groups: Array<{
    customerId: string | null
    customerName: string
    count: number
    invoices: Array<{ invoiceId: string, invoiceNumber: number }>
  }>
}) {
  const refs: ReturnType<typeof buildEntityRef>[] = []
  const lines: string[] = []

  for (const group of opts.groups) {
    const customerPart = group.customerId
      ? entityRefToken('customer', group.customerId, group.customerName)
      : group.customerName
    if (group.customerId) {
      refs.push(buildEntityRef('customer', group.customerId, group.customerName))
    }
    for (const inv of group.invoices) {
      refs.push(buildEntityRef(
        'invoice',
        inv.invoiceId,
        formatInvoiceNumber(inv.invoiceNumber),
      ))
    }

    const noun = group.count === 1 ? 'invoice' : 'invoices'
    const verb = group.count === 1 ? 'has' : 'have'
    lines.push(`For ${customerPart} ${group.count} ${noun} ${verb} been set to ${opts.status}`)
  }

  return { body: lines.join('\n'), refs }
}

export async function postBulkInvoicePaymentStatusTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    status: 'paid' | 'unpaid'
    groups: Array<{
      customerId: string | null
      customerName: string
      count: number
      invoices: Array<{ invoiceId: string, invoiceNumber: number }>
    }>
  },
) {
  if (!opts.groups.length) return null
  const { body, refs } = buildBulkInvoicePaymentStatusTeamMessageBody(opts)
  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}

const DELETION_ENTITY_LABELS: Record<string, string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  service_log: 'Service log',
  invoice: 'Invoice',
  conversation: 'Conversation',
}

function deletionEntityToMessageType(entityType: string): import('../db/schema/messages').MessageEntityType | null {
  switch (entityType) {
    case 'customer': return 'customer'
    case 'vehicle': return 'vehicle'
    case 'service_log': return 'service_log'
    case 'invoice': return 'invoice'
    default: return null
  }
}

/** Human-readable reason clause for team chat (first person when empty). */
export function formatDeletionRequestReasonClause(reason: string): string {
  const trimmed = reason.trim()
  if (!trimmed) return 'I did not enter a reason.'
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed
  return `${normalized}.`
}

/** Submitter posts a first-person team message when requesting record deletion. */
export async function postDeletionRequestSubmittedTeamMessage(
  db: Db,
  opts: {
    senderUserId: string
    requestId: string
    entityType: string
    entityId: string
    entityLabel: string
    reason: string
  },
) {
  const refs: ReturnType<typeof buildEntityRef>[] = []
  const parts: string[] = []
  const assetLabel = DELETION_ENTITY_LABELS[opts.entityType] ?? 'Record'
  const messageEntityType = deletionEntityToMessageType(opts.entityType)

  if (messageEntityType) {
    const linkLabel = opts.entityType === 'customer'
      ? opts.entityLabel
      : `${assetLabel} ${opts.entityLabel}`
    parts.push(entityRefToken(messageEntityType, opts.entityId, linkLabel))
    refs.push(buildEntityRef(messageEntityType, opts.entityId, linkLabel))
  }
  else {
    parts.push(`${assetLabel} ${opts.entityLabel}`)
  }

  const reasonClause = formatDeletionRequestReasonClause(opts.reason)
  if (opts.reason.trim()) {
    parts.push('needs to be deleted because')
    parts.push(reasonClause)
  }
  else {
    parts.push('needs to be deleted.')
    parts.push(reasonClause)
  }
  parts.push('Can an administrator please review the')
  parts.push(entityRefToken('deletion_request', opts.requestId, 'deletion request'))
  refs.push(buildEntityRef('deletion_request', opts.requestId, 'deletion request'))
  parts.push('?')

  return postTeamChatMessage(db, {
    senderUserId: opts.senderUserId,
    body: parts.join(' '),
    entityRefs: refs,
    skipNormalize: true,
    workflowNotification: true,
  })
}
