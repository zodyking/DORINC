import type { Db } from '../db/client'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { formatMoney, parseMoney } from '../../shared/money'
import {
  buildEntityRef,
  entityRefToken,
  postTeamChatMessage,
} from './team-chat.service'

function vehicleUnitLabel(
  busNumber: string | null | undefined,
  unitTag: string | null | undefined,
  fallback = 'Unit',
): string {
  const tag = unitTag?.trim() || busNumber?.trim()
  return tag ? `Unit ${tag}` : fallback
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
    invoiceId: string
    invoiceNumber: number
  },
) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const slLabel = `SL-${opts.logNumber}`
  const unitLabel = vehicleUnitLabel(opts.vehicleBusNumber, opts.vehicleUnitTag, 'vehicle')

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
  },
) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const parts = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    'has been sent to',
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
  },
) {
  const unitLabel = vehicleUnitLabel(opts.busNumber, opts.unitTag)
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
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const amount = moneyLabel(opts.paymentAmount)
  const refs = [buildEntityRef('invoice', opts.invoiceId, invoiceLabel)]
  const parts: string[] = []

  if (opts.paidInFull) {
    parts.push(entityRefToken('invoice', opts.invoiceId, invoiceLabel))
    parts.push('was paid in full for')
  }
  else {
    parts.push('Partial payment of', amount, 'received for')
    parts.push(entityRefToken('invoice', opts.invoiceId, invoiceLabel))
    parts.push('for')
  }

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
  })
}
