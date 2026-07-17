import type { Db } from '../db/client'
import type { DeletionEntityType } from '../db/schema/deletion-requests'
import { formatInvoiceNumber, type InvoiceVehicleSnapshot } from '../db/schema/invoices'
import {
  buildDeletionRequestResultEmail,
  buildDeletionRequestSubmittedEmail,
  buildCustomerChangeRequestStaffEmail,
  buildCustomerEmailReceivedStaffEmail,
  buildCustomerServiceRequestStaffEmail,
  buildInvoicePendingApprovalEmail,
  buildServiceLogSentToInvoiceStaffEmail,
  buildUserSignupPendingEmail,
} from '../mail/templates/system'
import { enqueueJob } from './jobs.service'
import { resolveEmailBrand } from './email-branding.service'
import {
  listAccountants,
  listAllTeamMembers,
  listPermissionRecipients,
} from './notification-recipients.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'
import { getInvoice } from './invoices.service'
import { getCustomer } from './customers.service'
import {
  formatPdfVehicleUnitDisplay,
  formatPdfVehicleYearMakeModel,
} from '../../shared/document-pdf-payload'
import { cleanPlainEmailText, stripHtmlToText } from '../../shared/email-display'

const ENTITY_TYPE_LABELS: Record<DeletionEntityType, string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  service_log: 'Service log',
  invoice: 'Invoice',
  conversation: 'Conversation',
}

async function enqueueHtmlMail(
  db: Db,
  to: string,
  mail: { subject: string, text: string, html: string },
  meta: Record<string, unknown> = {},
) {
  return enqueueJob(db, 'email_send', {
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...meta,
  })
}

export async function notifyDeletionRequestSubmitted(
  db: Db,
  opts: {
    submitterName: string
    submitterId: string
    entityType: DeletionEntityType
    entityLabel: string
    reason: string
    requestId: string
  },
) {
  if (!(await isNotificationEnabled(db, 'deletionRequestSubmitted'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const reviewUrl = `${appUrl.replace(/\/$/, '')}/deletion-requests`
  const reviewers = await listPermissionRecipients(
    db,
    'deletion_requests.review.all',
    opts.submitterId,
  )

  let queued = 0
  for (const reviewer of reviewers) {
    const mail = buildDeletionRequestSubmittedEmail({
      reviewerName: reviewer.name,
      submitterName: opts.submitterName,
      entityTypeLabel: ENTITY_TYPE_LABELS[opts.entityType],
      entityLabel: opts.entityLabel,
      reason: opts.reason,
      reviewUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, reviewer.email, mail, {
      notificationKind: 'deletion_request_submitted',
      requestId: opts.requestId,
      recipientUserId: reviewer.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyDeletionRequestResult(
  db: Db,
  opts: {
    requestorEmail: string | null
    requestorName: string | null
    requestorId: string
    status: 'approved' | 'rejected'
    entityType: DeletionEntityType
    entityLabel: string
    reviewReason?: string | null
    reviewedByName?: string | null
    requestId: string
  },
) {
  if (!(await isNotificationEnabled(db, 'deletionRequestResult'))) {
    return { queued: false as const, reason: 'disabled' as const }
  }

  const to = opts.requestorEmail?.trim()
  if (!to) return { queued: false as const, reason: 'no_recipient' as const }

  const brand = await resolveEmailBrand(db)
  const mail = buildDeletionRequestResultEmail({
    requestorName: opts.requestorName || 'there',
    status: opts.status,
    entityTypeLabel: ENTITY_TYPE_LABELS[opts.entityType],
    entityLabel: opts.entityLabel,
    reviewReason: opts.reviewReason,
    reviewedByName: opts.reviewedByName,
    appUrl: brand.appUrl || getAppUrl(),
    brand,
  })

  await enqueueHtmlMail(db, to, mail, {
    notificationKind: 'deletion_request_result',
    requestId: opts.requestId,
    requestStatus: opts.status,
    recipientUserId: opts.requestorId,
  })

  return { queued: true as const }
}

export async function notifyUserSignupPendingApproval(
  db: Db,
  opts: { userId: string, userName: string, userEmail: string },
) {
  if (!(await isNotificationEnabled(db, 'userSignupPendingApproval'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const usersUrl = `${appUrl.replace(/\/$/, '')}/users`
  const admins = await listPermissionRecipients(db, 'users.manage.all', opts.userId)

  let queued = 0
  for (const admin of admins) {
    const mail = buildUserSignupPendingEmail({
      adminName: admin.name,
      userName: opts.userName,
      userEmail: opts.userEmail,
      usersUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, admin.email, mail, {
      notificationKind: 'user_signup_pending',
      userId: opts.userId,
      recipientUserId: admin.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyInvoicePendingApproval(db: Db, invoiceId: string, actorId?: string | null) {
  if (!(await isNotificationEnabled(db, 'invoicePendingApproval'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const invoice = await getInvoice(db, invoiceId)
  const customer = await getCustomer(db, invoice.customerId)
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const invoiceUrl = `${appUrl.replace(/\/$/, '')}/invoices/${invoice.id}`
  const invoiceNumber = formatInvoiceNumber(invoice.invoiceNumber)
  const approvers = await listPermissionRecipients(db, 'invoices.approve.all', actorId)

  let queued = 0
  for (const approver of approvers) {
    const mail = buildInvoicePendingApprovalEmail({
      approverName: approver.name,
      invoiceNumber,
      customerName: customer.displayName,
      total: invoice.total,
      invoiceUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, approver.email, mail, {
      notificationKind: 'invoice_pending_approval',
      invoiceId: invoice.id,
      recipientUserId: approver.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyCustomerServiceRequestSubmitted(
  db: Db,
  opts: {
    logId: string
    customerId: string
    customerName: string
    vehicleSnapshot: InvoiceVehicleSnapshot | null
    serviceCategory: string
    urgency: string
    message: string
  },
) {
  if (!(await isNotificationEnabled(db, 'customerServiceRequestSubmitted'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const detailUrl = `${appUrl.replace(/\/$/, '')}/service-logs/${opts.logId}`
  const vehicleUnit = opts.vehicleSnapshot
    ? formatPdfVehicleUnitDisplay(opts.vehicleSnapshot)
    : 'Unknown vehicle'
  const vehicleDetails = opts.vehicleSnapshot
    ? formatPdfVehicleYearMakeModel(opts.vehicleSnapshot)
    : null
  const recipients = await listAllTeamMembers(db)

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildCustomerServiceRequestStaffEmail({
      recipientName: recipient.name,
      customerName: opts.customerName,
      vehicleUnit,
      vehicleDetails,
      serviceCategory: opts.serviceCategory,
      urgency: opts.urgency,
      message: opts.message,
      detailUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, recipient.email, mail, {
      notificationKind: 'customer_service_request_submitted',
      serviceLogId: opts.logId,
      customerId: opts.customerId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyCustomerChangeRequestSubmitted(
  db: Db,
  opts: {
    requestId: string
    customerId: string
    customerName: string
    requestKind: 'invoice_change' | 'vehicle_change'
    topic: string
    message: string
    invoiceNumber?: string | null
    vehicleLabel?: string | null
  },
) {
  if (!(await isNotificationEnabled(db, 'customerChangeRequestSubmitted'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const detailUrl = `${appUrl.replace(/\/$/, '')}/portal-requests`
  const requestKindLabel = opts.requestKind === 'invoice_change'
    ? 'Billing correction request'
    : 'Vehicle correction request'
  const recipients = await listAccountants(db)

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildCustomerChangeRequestStaffEmail({
      recipientName: recipient.name,
      customerName: opts.customerName,
      requestKindLabel,
      topic: opts.topic,
      message: opts.message,
      invoiceNumber: opts.invoiceNumber ?? null,
      vehicleLabel: opts.vehicleLabel ?? null,
      detailUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, recipient.email, mail, {
      notificationKind: 'customer_change_request_submitted',
      requestId: opts.requestId,
      requestKind: opts.requestKind,
      customerId: opts.customerId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

function customerEmailStaffMessageBody(body: string, html?: string | null): string {
  const text = cleanPlainEmailText(body) || (html ? stripHtmlToText(html) : '')
  return text.trim() || '(empty message)'
}

export async function notifyCustomerEmailReceived(
  db: Db,
  opts: {
    conversationId: string
    customerName: string
    customerEmail: string
    subject: string
    messageBody: string
    htmlBody?: string | null
  },
) {
  if (!(await isNotificationEnabled(db, 'customerEmailReceived'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const messagesUrl = `${appUrl.replace(/\/$/, '')}/messages?conversation=${opts.conversationId}`
  const messagePreview = customerEmailStaffMessageBody(opts.messageBody, opts.htmlBody)
  const recipients = await listAllTeamMembers(db)

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildCustomerEmailReceivedStaffEmail({
      recipientName: recipient.name,
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      subject: opts.subject,
      messagePreview,
      messagesUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, recipient.email, mail, {
      notificationKind: 'customer_email_received',
      conversationId: opts.conversationId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

function formatServiceLogLabel(logNumber: number): string {
  return `SL-${logNumber}`
}

export async function notifyServiceLogSentToInvoice(
  db: Db,
  opts: {
    serviceLogId: string
    logNumber: number
    senderName: string
    senderUserId: string
    customerName: string
    vehicleSnapshot: InvoiceVehicleSnapshot | null
    invoiceId: string
    invoiceNumber: number
  },
) {
  if (!(await isNotificationEnabled(db, 'serviceLogSentToInvoice'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const base = appUrl.replace(/\/$/, '')
  const serviceLogLabel = formatServiceLogLabel(opts.logNumber)
  const invoiceNumber = formatInvoiceNumber(opts.invoiceNumber)
  const invoiceUrl = `${base}/invoices/${opts.invoiceId}`
  const serviceLogUrl = `${base}/service-logs/${opts.serviceLogId}`
  const vehicleUnit = opts.vehicleSnapshot
    ? formatPdfVehicleUnitDisplay(opts.vehicleSnapshot)
    : 'Unknown vehicle'
  const vehicleDetails = opts.vehicleSnapshot
    ? formatPdfVehicleYearMakeModel(opts.vehicleSnapshot)
    : null
  const recipients = await listPermissionRecipients(db, 'service_logs.review.all', opts.senderUserId)

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildServiceLogSentToInvoiceStaffEmail({
      recipientName: recipient.name,
      senderName: opts.senderName,
      serviceLogLabel,
      customerName: opts.customerName,
      vehicleUnit,
      vehicleDetails,
      invoiceNumber,
      invoiceUrl,
      serviceLogUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, recipient.email, mail, {
      notificationKind: 'service_log_sent_to_invoice',
      serviceLogId: opts.serviceLogId,
      invoiceId: opts.invoiceId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}
