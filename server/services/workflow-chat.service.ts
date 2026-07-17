import type { Db } from '../db/client'
import { formatInvoiceNumber } from '../db/schema/invoices'
import {
  buildEntityRef,
  entityRefToken,
  postTeamChatMessage,
} from './team-chat.service'

function vehicleUnitLabel(busNumber: string | null | undefined, unitTag: string | null | undefined): string {
  const tag = unitTag?.trim() || busNumber?.trim()
  return tag ? `Unit ${tag}` : 'vehicle'
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
  const unitLabel = vehicleUnitLabel(opts.vehicleBusNumber, opts.vehicleUnitTag)

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
