/** Customer-facing SMTP templates — unified notification layout. */
import { getAppUrl } from '../services/app-config.service'
import type { EmailBrandContext } from '../services/email-branding.service'
import {
  buildCustomerSupportNote,
  buildStyledEmail,
  escapeHtml,
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

const REQUEST_KIND_LABELS: Record<PortalRequestKindLabel, string> = {
  service: 'Service request',
  invoice_change: 'Billing correction request',
  vehicle_change: 'Vehicle correction request',
  general: 'General request',
  new_vehicle: 'New vehicle request',
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
  const totalLine = input.total || null
  const defaults = invoiceSendEditableDefaults(input.invoiceNumber)
  const subject = input.customSubject?.trim() || defaults.subject
  const message = input.customMessage?.trim() || defaults.message
  const support = buildCustomerSupportNote(input.brand, appUrl)
  const text = [
    `Hello ${input.recipientName},`,
    '',
    message,
    dueLine ? `Due date: ${dueLine}` : '',
    totalLine ? `Total: ${totalLine}` : '',
    '',
    `View invoice: ${detailUrl}`,
    '',
    support.text,
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
          }
        : undefined,
      details: [
        { label: 'Invoice', value: input.invoiceNumber },
        dueLine ? { label: 'Due date', value: dueLine } : null,
      ].filter(Boolean) as Array<{ label: string, value: string }>,
      note: support,
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
  const support = buildCustomerSupportNote(input.brand, appUrl)
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
    reasonLine ? `Staff note: ${reasonLine}` : '',
    '',
    `Track requests: ${requestsUrl}`,
    '',
    support.text,
  ].filter(Boolean).join('\n')

  return {
    ...buildStyledEmail({
      subject,
      text,
      eyebrow: 'Portal request',
      headline: `Request ${statusLabel}`,
      lead: `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
      details: [
        { label: 'Request', value: input.requestTitle },
        { label: 'Type', value: kindLabel },
        { label: 'Status', value: statusLabel },
      ],
      note: reasonLine
        ? {
            title: 'Update from our team',
            bodyHtml: `<p style="margin:0 0 14px;color:#6b7280;font-size:13px;line-height:20px;">${escapeHtml(reasonLine)}</p>${support.bodyHtml}`,
          }
        : support,
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
  const support = buildCustomerSupportNote(input.brand, appUrl)
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    '',
    `View estimate: ${detailUrl}`,
    '',
    support.text,
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
      ],
      note: support,
      primaryAction: { href: detailUrl, label: 'View estimate in the portal' },
      appUrl,
      brand: input.brand,
    }),
    notificationKind: 'estimate_sent' as const,
  }
}
