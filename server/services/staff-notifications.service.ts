import type { Db } from '../db/client'
import type { DeletionEntityType } from '../db/schema/deletion-requests'
import { formatInvoiceNumber } from '../db/schema/invoices'
import {
  buildDeletionRequestResultEmail,
  buildDeletionRequestSubmittedEmail,
  buildInvoicePendingApprovalEmail,
  buildUserSignupPendingEmail,
} from '../mail/templates/system'
import { enqueueJob } from './jobs.service'
import { resolveEmailBrand } from './email-branding.service'
import {
  listPermissionRecipients,
} from './notification-recipients.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'
import { getInvoice } from './invoices.service'
import { getCustomer } from './customers.service'

const ENTITY_TYPE_LABELS: Record<DeletionEntityType, string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  service_log: 'Service log',
  invoice: 'Invoice',
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
