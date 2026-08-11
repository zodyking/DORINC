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
  buildNotifyChannelChangedEmail,
  buildUserSignupPendingEmail,
} from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import {
  listAccountants,
  listAllTeamMembers,
  listPermissionRecipients,
} from './notification-recipients.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'
import { shouldSuppressActorNotifications } from './notification-suppression.service'
import { getInvoice } from './invoices.service'
import { getCustomer } from './customers.service'
import {
  formatPdfVehicleUnitDisplay,
  formatPdfVehicleYearMakeModel,
} from '../../shared/document-pdf-payload'
import { cleanPlainEmailText, stripHtmlToText } from '../../shared/email-display'
import { deliverUserNotification } from './notify-delivery.service'
import { loadUserNotifyProfile } from './user-notify-channel.service'

const ENTITY_TYPE_LABELS: Record<DeletionEntityType, string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  service_log: 'Service log',
  invoice: 'Invoice',
  conversation: 'Conversation',
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
  if (await shouldSuppressActorNotifications(db, opts.submitterId)) {
    return { queued: 0 as const, reason: 'suppressed' as const }
  }

  if (!(await isNotificationEnabled(db, 'deletionRequestSubmitted'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'deletion_request_submitted')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, reviewer, {
      sms: {
        typeKey: 'deletion_request_submitted',
        vars: {
          reviewerName: reviewer.name,
          submitterName: opts.submitterName,
          entityTypeLabel: ENTITY_TYPE_LABELS[opts.entityType],
          entityLabel: opts.entityLabel,
          reason: opts.reason,
          reviewUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'deletion_request_submitted',
        requestId: opts.requestId,
      },
    })
    if (result.channel !== 'none') queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyDeletionRequestResult(
  db: Db,
  opts: {
    requestorEmail: string | null
    requestorName: string | null
    requestorId: string
    status: 'approved' | 'rejected' | 'deferred'
    entityType: DeletionEntityType
    entityLabel: string
    reason?: string | null
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
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'deletion_request_result')
  const mail = buildDeletionRequestResultEmail({
    requestorName: opts.requestorName || 'there',
    status: opts.status,
    entityTypeLabel: ENTITY_TYPE_LABELS[opts.entityType],
    entityLabel: opts.entityLabel,
    reason: opts.reason,
    reviewReason: opts.reviewReason,
    reviewedByName: opts.reviewedByName,
    appUrl: brand.appUrl || getAppUrl(),
    brand,
    templateOverride,
  })

  const profile = await loadUserNotifyProfile(db, opts.requestorId)
  const statusLabel = opts.status === 'approved'
    ? 'Approved'
    : opts.status === 'deferred'
      ? 'Awaiting human review'
      : 'Denied'
  const detailLine = opts.status === 'deferred'
    ? (opts.reviewReason?.trim() || 'Susan left this open for a human administrator.')
    : (opts.reviewedByName
        ? `Reviewed by ${opts.reviewedByName}.`
        : (opts.reviewReason?.trim() ? opts.reviewReason.trim() : ''))
  const result = await deliverUserNotification(db, {
    id: opts.requestorId,
    email: to,
    phone: profile?.phone,
    messageNotifyChannel: profile?.messageNotifyChannel,
  }, {
    sms: {
      typeKey: 'deletion_request_result',
      vars: {
        requestorName: opts.requestorName || 'there',
        entityTypeLabel: ENTITY_TYPE_LABELS[opts.entityType],
        entityLabel: opts.entityLabel,
        statusLabel,
        reviewedByName: opts.reviewedByName ?? '',
        reviewReason: opts.reviewReason?.trim() ?? '',
        detailLine,
      },
    },
    email: mail,
    meta: {
      notificationKind: 'deletion_request_result',
      requestId: opts.requestId,
      requestStatus: opts.status,
    },
  })

  return { queued: result.channel !== 'none' }
}

export async function notifyUserSignupPendingApproval(
  db: Db,
  opts: { userId: string, userName: string, userEmail: string },
) {
  if (!(await isNotificationEnabled(db, 'userSignupPendingApproval'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'user_signup_pending')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, admin, {
      sms: {
        typeKey: 'user_signup_pending',
        vars: {
          adminName: admin.name,
          userName: opts.userName,
          userEmail: opts.userEmail,
          usersUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'user_signup_pending',
        userId: opts.userId,
      },
    })
    if (result.channel !== 'none') queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

export async function notifyInvoicePendingApproval(db: Db, invoiceId: string, actorId?: string | null) {
  if (await shouldSuppressActorNotifications(db, actorId)) {
    return { queued: 0 as const, reason: 'suppressed' as const }
  }

  if (!(await isNotificationEnabled(db, 'invoicePendingApproval'))) {
    return { queued: 0 as const, reason: 'disabled' as const }
  }

  const invoice = await getInvoice(db, invoiceId)
  const customer = await getCustomer(db, invoice.customerId)
  const brand = await resolveEmailBrand(db)
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'invoice_pending_approval')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, approver, {
      sms: {
        typeKey: 'invoice_pending_approval',
        vars: {
          approverName: approver.name,
          invoiceNumber,
          customerName: customer.displayName,
          total: String(invoice.total),
          invoiceUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'invoice_pending_approval',
        invoiceId: invoice.id,
      },
    })
    if (result.channel !== 'none') queued++
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
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'customer_service_request_staff')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, recipient, {
      sms: {
        typeKey: 'customer_service_request_staff',
        vars: {
          recipientName: recipient.name,
          customerName: opts.customerName,
          vehicleUnit,
          vehicleDetails: vehicleDetails ?? '',
          serviceCategory: opts.serviceCategory,
          urgency: opts.urgency,
          message: opts.message,
          detailUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'customer_service_request_submitted',
        serviceLogId: opts.logId,
        customerId: opts.customerId,
      },
    })
    if (result.channel !== 'none') queued++
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
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'customer_change_request_staff')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, recipient, {
      sms: {
        typeKey: 'customer_change_request_staff',
        vars: {
          recipientName: recipient.name,
          customerName: opts.customerName,
          requestKindLabel,
          topic: opts.topic,
          invoiceNumber: opts.invoiceNumber ?? '',
          vehicleLabel: opts.vehicleLabel ?? '',
          message: opts.message,
          detailUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'customer_change_request_submitted',
        requestId: opts.requestId,
        requestKind: opts.requestKind,
        customerId: opts.customerId,
      },
    })
    if (result.channel !== 'none') queued++
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
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'customer_email_received_staff')
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
      templateOverride,
    })
    const result = await deliverUserNotification(db, recipient, {
      sms: {
        typeKey: 'customer_email_received_staff',
        vars: {
          recipientName: recipient.name,
          customerName: opts.customerName,
          customerEmail: opts.customerEmail,
          subject: opts.subject,
          messagePreview,
          messagesUrl,
        },
      },
      email: mail,
      meta: {
        notificationKind: 'customer_email_received',
        conversationId: opts.conversationId,
      },
    })
    if (result.channel !== 'none') queued++
  }

  return { queued, reason: queued ? undefined : 'no_recipients' as const }
}

/**
 * Notify a staff user that their Email vs Text preference changed
 * (self-serve My Account or admin User Control).
 * When switching to Text: also send the Dorinc contact card SMS and schedule
 * a Susan AI intro five minutes later.
 */
export async function notifyNotifyChannelChanged(
  db: Db,
  opts: {
    userId: string
    name: string
    email: string
    phone?: string | null
    channel: 'email' | 'sms'
  },
) {
  const brand = await resolveEmailBrand(db)
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'notify_channel_changed')
  const appUrl = brand.appUrl || getAppUrl()
  const accountUrl = `${appUrl.replace(/\/$/, '')}/account`
  const toSms = opts.channel === 'sms'
  const channelLabel = toSms ? 'Text' : 'Email'
  const leadMessage = toSms
    ? 'The system has changed your notification channel to Text.'
    : 'The system has changed your notification channel to Email.'
  const detailMessage = toSms
    ? 'Quicker, cleaner notifications without cluttering your email inbox. If you prefer emails, you can change this on the My Account page.'
    : 'Alerts will arrive in your inbox so you can keep a lasting record. If you prefer text messages, you can change this on the My Account page.'

  const mail = buildNotifyChannelChangedEmail({
    name: opts.name,
    channel: opts.channel,
    accountUrl,
    appUrl,
    brand,
    templateOverride,
  })

  const delivery = await deliverUserNotification(db, {
    id: opts.userId,
    email: opts.email,
    phone: opts.phone,
    messageNotifyChannel: opts.channel,
  }, {
    sms: {
      typeKey: 'notify_channel_changed',
      vars: {
        name: opts.name,
        channelLabel,
        leadMessage,
        detailMessage,
        accountUrl,
      },
    },
    email: mail,
    meta: {
      notificationKind: 'notify_channel_changed',
      channel: opts.channel,
    },
  })

  if (toSms && opts.phone) {
    try {
      const { sendDorincContactCardSms } = await import('./dorinc-contact-notify.service')
      await sendDorincContactCardSms(db, {
        name: opts.name,
        phone: opts.phone,
        userId: opts.userId,
      })
    }
    catch (err) {
      console.warn(
        '[notify-channel] contact card / Susan intro failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return delivery
}
