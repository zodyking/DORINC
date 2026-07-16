import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { formatEstimateNumber } from '../db/schema/estimates'
import type { PortalRequestReviewKind } from '../../shared/validators/portal-request-review'
import {
  buildInvoiceSentEmail,
  buildRequestStatusEmail,
  buildEstimateSentEmail,
  type PortalRequestKindLabel,
} from '../mail/customer-email-templates'
import { getEstimate } from './estimates.service'
import { getInvoice } from './invoices.service'
import { enqueueJob } from './jobs.service'
import { resolveEmailBrand } from './email-branding.service'
import { isNotificationEnabled } from './workspace-settings.service'

export interface NotificationRecipient {
  email: string
  name: string
  userId?: string
}

async function resolvePortalRecipient(
  db: Db,
  customerId: string,
  submittedByUserId?: string | null,
): Promise<NotificationRecipient | null> {
  if (submittedByUserId) {
    const [submitter] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.id, submittedByUserId), eq(users.isActive, true)))
    if (submitter?.email) {
      return { email: submitter.email, name: submitter.name, userId: submitter.id }
    }
  }

  const [customer] = await db
    .select({ displayName: customers.displayName, email: customers.email })
    .from(customers)
    .where(eq(customers.id, customerId))

  const [portalUser] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.customerId, customerId),
      eq(accountTypes.key, 'customer'),
      eq(users.isActive, true),
    ))
    .limit(1)

  const accountEmail = customer?.email?.trim()
  if (accountEmail) {
    return {
      email: accountEmail,
      name: customer.displayName,
      userId: portalUser?.id,
    }
  }

  if (portalUser?.email) {
    return { email: portalUser.email, name: portalUser.name, userId: portalUser.id }
  }

  return null
}

async function shouldNotifyCustomer(db: Db, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ portalEnabled: customers.portalEnabled })
    .from(customers)
    .where(eq(customers.id, customerId))
  return !!row?.portalEnabled
}

export async function enqueueCustomerNotification(
  db: Db,
  recipient: NotificationRecipient,
  mail: { subject: string, text: string, html: string, notificationKind: string },
  meta: Record<string, unknown> = {},
) {
  return enqueueJob(db, 'email_send', {
    to: recipient.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notificationKind: mail.notificationKind,
    recipientUserId: recipient.userId ?? null,
    ...meta,
  })
}

export async function notifyInvoiceSent(db: Db, invoiceId: string) {
  if (!(await isNotificationEnabled(db, 'invoiceEmail'))) {
    return { queued: false as const, reason: 'disabled' }
  }

  const invoice = await getInvoice(db, invoiceId)
  if (!(await shouldNotifyCustomer(db, invoice.customerId))) {
    return { queued: false as const, reason: 'portal_disabled' }
  }

  const recipient = await resolvePortalRecipient(db, invoice.customerId)
  if (!recipient) return { queued: false as const, reason: 'no_recipient' }

  const brand = await resolveEmailBrand(db)
  const mail = buildInvoiceSentEmail({
    recipientName: recipient.name,
    invoiceNumber: formatInvoiceNumber(invoice.invoiceNumber),
    invoiceId: invoice.id,
    dueDate: invoice.dueDate,
    total: invoice.total,
    brand,
  })

  const job = await enqueueCustomerNotification(db, recipient, mail, {
    customerId: invoice.customerId,
    invoiceId: invoice.id,
  })

  return { queued: true as const, job, recipientEmail: recipient.email }
}

function requestKindLabel(kind: PortalRequestReviewKind): PortalRequestKindLabel {
  return kind
}

function requestTitle(kind: PortalRequestReviewKind, request: Record<string, unknown>): string {
  switch (kind) {
    case 'service':
      return String(request.serviceCategory ?? 'Service request')
    case 'invoice_change':
      return String(request.topic ?? 'Billing correction')
    case 'vehicle_change':
      return String(request.subject ?? 'Vehicle correction')
    case 'general':
      return String(request.subject ?? 'General request')
    case 'new_vehicle':
      return String(request.fleetTag ?? 'New vehicle')
    default:
      return 'Portal request'
  }
}

export async function notifyPortalRequestStatus(
  db: Db,
  kind: PortalRequestReviewKind,
  request: {
    customerId: string
    submittedBy: string
    reviewReason?: string | null
    [key: string]: unknown
  },
  status: 'approved' | 'rejected',
) {
  if (!(await isNotificationEnabled(db, 'portalRequestStatus'))) {
    return { queued: false as const, reason: 'disabled' }
  }

  if (!(await shouldNotifyCustomer(db, request.customerId))) {
    return { queued: false as const, reason: 'portal_disabled' }
  }

  const recipient = await resolvePortalRecipient(db, request.customerId, request.submittedBy)
  if (!recipient) return { queued: false as const, reason: 'no_recipient' }

  const brand = await resolveEmailBrand(db)
  const mail = buildRequestStatusEmail({
    recipientName: recipient.name,
    requestKind: requestKindLabel(kind),
    requestTitle: requestTitle(kind, request),
    status,
    reviewReason: request.reviewReason,
    brand,
  })

  const job = await enqueueCustomerNotification(db, recipient, mail, {
    customerId: request.customerId,
    requestKind: kind,
    requestId: request.id,
    requestStatus: status,
  })

  return { queued: true as const, job, recipientEmail: recipient.email }
}

/** Queue estimate-sent notification when estimate is sent to customer portal. */
export async function notifyEstimateSent(db: Db, estimateId: string) {
  if (!(await isNotificationEnabled(db, 'estimateEmail'))) {
    return { queued: false as const, reason: 'disabled' }
  }

  const estimate = await getEstimate(db, estimateId)
  if (!(await shouldNotifyCustomer(db, estimate.customerId))) {
    return { queued: false as const, reason: 'portal_disabled' }
  }

  const recipient = await resolvePortalRecipient(db, estimate.customerId)
  if (!recipient) return { queued: false as const, reason: 'no_recipient' }

  const brand = await resolveEmailBrand(db)
  const mail = buildEstimateSentEmail({
    recipientName: recipient.name,
    estimateNumber: formatEstimateNumber(estimate.estimateNumber),
    estimateId: estimate.id,
    brand,
  })

  const job = await enqueueCustomerNotification(db, recipient, mail, {
    customerId: estimate.customerId,
    estimateId: estimate.id,
  })

  return { queued: true as const, job, recipientEmail: recipient.email }
}
