/** Customer-facing SMTP templates — unified notification layout. */
import { formatMoneyForDisplay } from '../../shared/money'
import { getAppUrl } from '../services/app-config.service'
import type { EmailBrandContext } from '../services/email-branding.service'
import {
  buildStyledEmail,
} from './email-layout'

function portalUrl(path = '', appUrl?: string): string {
  const base = (appUrl || getAppUrl()).replace(/\/$/, '')
  return `${base}/portal${path}`
}

export type PortalRequestKindLabel
  = | 'service'
    | 'invoice_change'
    | 'vehicle_change'
    | 'general'
    | 'new_vehicle'
    | 'document'

const REQUEST_KIND_LABELS: Record<PortalRequestKindLabel, string> = {
  service: 'Service request',
  invoice_change: 'Billing correction request',
  vehicle_change: 'Vehicle correction request',
  general: 'General request',
  new_vehicle: 'New vehicle request',
  document: 'Document change request',
}

export type CustomerNotificationKind = 'invoice_sent' | 'request_status' | 'estimate_sent'

export interface InvoiceSentTemplateInput {
  recipientName: string
  invoiceNumber: string
  invoiceId: string
  dueDate?: string | null
  total?: string | null
  brand?: EmailBrandContext
  appUrl?: string
  /** Optional staff-edited subject line; falls back to the default when blank. */
  customSubject?: string | null
  /** Optional staff-edited message body; falls back to the default when blank. */
  customMessage?: string | null
}

/** Editable defaults surfaced to the send-compose UI (subject + message body). */
export function invoiceSendEditableDefaults(invoiceNumber: string) {
  return {
    subject: `Invoice ${invoiceNumber} Is Ready`,
    message: `Invoice ${invoiceNumber} has been sent and is available in your customer portal.`,
  }
}

export function buildInvoiceSentEmail(input: InvoiceSentTemplateInput) {
  const appUrl = input.appUrl || input.brand?.appUrl || getAppUrl()
  const detailUrl = portalUrl(`/invoices/${input.invoiceId}`, appUrl)
  const dueLine = input.dueDate || null
  const totalLine = formatMoneyForDisplay(input.total)
  const defaults = invoiceSendEditableDefaults(input.invoiceNumber)
  const subject = input.customSubject?.trim() || defaults.subject
  const message = input.customMessage?.trim() || defaults.message
  const text = [
    `Hello ${input.recipientName},`,
    '',
    message,
    dueLine ? `Due date: ${dueLine}` : '',
    totalLine ? `Total: ${totalLine}` : '',
    '',
    `View invoice: ${detailUrl}`,
    '',
    'If you have questions, reply to this email or submit a request through the portal.',
  ].filter(Boolean).join('\n')

  return {
    ...buildStyledEmail({
      subject,
      text,
      eyebrow: 'Invoice',
      headline: `Invoice ${input.invoiceNumber}`,
      lead: message,
      highlight: totalLine
        ? {
            label: 'Invoice total',
            value: totalLine,
            status: 'Ready',
            statusTone: 'ok',
          }
        : undefined,
      details: [
        { label: 'Customer', value: input.recipientName },
        { label: 'Invoice', value: input.invoiceNumber },
        dueLine ? { label: 'Due date', value: dueLine } : null,
        { label: 'Portal', value: 'Available now' },
      ].filter(Boolean) as Array<{ label: string, value: string }>,
      note: {
        title: 'Need help?',
        body: 'If you have questions, reply to this email or submit a request through the portal.',
      },
      primaryAction: { href: detailUrl, label: 'View invoice in the portal' },
      appUrl,
      brand: input.brand,
    }),
    notificationKind: 'invoice_sent' as const,
  }
}

export interface RequestStatusTemplateInput {
  recipientName: string
  requestKind: PortalRequestKindLabel
  requestTitle: string
  status: 'approved' | 'rejected'
  reviewReason?: string | null
  brand?: EmailBrandContext
  appUrl?: string
}

export function buildRequestStatusEmail(input: RequestStatusTemplateInput) {
  const appUrl = input.appUrl || input.brand?.appUrl || getAppUrl()
  const kindLabel = REQUEST_KIND_LABELS[input.requestKind]
  const statusLabel = input.status === 'approved' ? 'Approved' : 'Rejected'
  const subject = `${kindLabel} ${statusLabel}`
  const reasonLine = input.reviewReason?.trim() || null
  const requestsUrl = portalUrl('/requests', appUrl)
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
    reasonLine ? `Staff note: ${reasonLine}` : '',
    '',
    `Track requests: ${requestsUrl}`,
  ].filter(Boolean).join('\n')

  return {
    ...buildStyledEmail({
      subject,
      text,
      eyebrow: 'Portal request',
      headline: `Request ${statusLabel}`,
      lead: `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
      highlight: {
        label: 'Decision',
        value: input.status === 'approved' ? 'Approved' : 'Rejected',
        status: input.status === 'approved' ? 'Completed' : 'Closed',
        statusTone: input.status === 'approved' ? 'ok' : 'error',
      },
      details: [
        { label: 'Request', value: input.requestTitle },
        { label: 'Type', value: kindLabel },
        { label: 'Customer', value: input.recipientName },
        { label: 'Status', value: statusLabel },
      ],
      note: reasonLine
        ? { title: 'Staff note', body: reasonLine }
        : undefined,
      primaryAction: { href: requestsUrl, label: 'View your requests' },
      appUrl,
      brand: input.brand,
    }),
    notificationKind: 'request_status' as const,
  }
}

export interface EstimateSentTemplateInput {
  recipientName: string
  estimateNumber: string
  estimateId: string
  brand?: EmailBrandContext
  appUrl?: string
}

export function buildEstimateSentEmail(input: EstimateSentTemplateInput) {
  const appUrl = input.appUrl || input.brand?.appUrl || getAppUrl()
  const detailUrl = portalUrl(`/estimates/${input.estimateId}`, appUrl)
  const subject = `Estimate ${input.estimateNumber} Ready For Review`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    '',
    `View estimate: ${detailUrl}`,
  ].join('\n')

  return {
    ...buildStyledEmail({
      subject,
      text,
      eyebrow: 'Estimate',
      headline: `Estimate ${input.estimateNumber}`,
      lead: `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
      details: [
        { label: 'Estimate', value: input.estimateNumber },
        { label: 'Customer', value: input.recipientName },
        { label: 'Status', value: 'Ready for review' },
      ],
      primaryAction: { href: detailUrl, label: 'View estimate in the portal' },
      appUrl,
      brand: input.brand,
    }),
    notificationKind: 'estimate_sent' as const,
  }
}
