/** Customer-facing SMTP templates (SPEC §18) — unified modern white layout. */
import { getAppUrl } from '../services/app-config.service'
import {
  buildStyledEmail,
  emailButton,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from './email-layout'

function portalUrl(path = ''): string {
  const base = getAppUrl().replace(/\/$/, '')
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
}

export function buildInvoiceSentEmail(input: InvoiceSentTemplateInput) {
  const appUrl = getAppUrl()
  const detailUrl = portalUrl(`/invoices/${input.invoiceId}`)
  const dueLine = input.dueDate ? `Due date: ${input.dueDate}` : null
  const totalLine = input.total ? `Total: ${input.total}` : null
  const subject = `Invoice ${input.invoiceNumber} is ready`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Invoice ${input.invoiceNumber} has been sent and is available in your customer portal.`,
    dueLine,
    totalLine,
    '',
    `View invoice: ${detailUrl}`,
    '',
    'If you have questions, reply to this email or submit a request through the portal.',
  ].filter(Boolean).join('\n')

  const metaBits = [dueLine, totalLine].filter(Boolean).map(line => emailMuted(escapeHtml(line!))).join('')
  const bodyHtml = [
    emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
    emailParagraph(`Invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> has been sent and is available in your customer portal.`),
    metaBits,
    emailButton(detailUrl, 'View invoice in the portal'),
    emailMuted('If you have questions, reply to this email or submit a request through the portal.'),
  ].join('')

  return {
    ...buildStyledEmail({
      subject,
      text,
      title: `Invoice ${input.invoiceNumber}`,
      preheader: `Invoice ${input.invoiceNumber} is ready in your portal`,
      bodyHtml,
      appUrl,
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
}

export function buildRequestStatusEmail(input: RequestStatusTemplateInput) {
  const appUrl = getAppUrl()
  const kindLabel = REQUEST_KIND_LABELS[input.requestKind]
  const statusLabel = input.status === 'approved' ? 'approved' : 'rejected'
  const subject = `${kindLabel} ${statusLabel}`
  const reasonLine = input.reviewReason?.trim()
    ? `Staff note: ${input.reviewReason.trim()}`
    : null
  const requestsUrl = portalUrl('/requests')
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
    reasonLine,
    '',
    `Track requests: ${requestsUrl}`,
  ].filter(Boolean).join('\n')

  const bodyHtml = [
    emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
    emailParagraph(`Your <strong>${escapeHtml(kindLabel.toLowerCase())}</strong> &ldquo;${escapeHtml(input.requestTitle)}&rdquo; has been <strong>${statusLabel}</strong>.`),
    reasonLine ? emailMuted(escapeHtml(reasonLine)) : '',
    emailButton(requestsUrl, 'View your requests'),
  ].filter(Boolean).join('')

  return {
    ...buildStyledEmail({
      subject,
      text,
      title: subject,
      preheader: `Your ${kindLabel.toLowerCase()} was ${statusLabel}`,
      bodyHtml,
      appUrl,
    }),
    notificationKind: 'request_status' as const,
  }
}

/** Phase 3 stub — template ready for estimate delivery notifications. */
export interface EstimateSentTemplateInput {
  recipientName: string
  estimateNumber: string
  estimateId: string
}

export function buildEstimateSentEmail(input: EstimateSentTemplateInput) {
  const appUrl = getAppUrl()
  const detailUrl = portalUrl(`/estimates/${input.estimateId}`)
  const subject = `Estimate ${input.estimateNumber} is ready for review`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    '',
    `View estimate: ${detailUrl}`,
  ].join('\n')

  const bodyHtml = [
    emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
    emailParagraph(`Estimate <strong>${escapeHtml(input.estimateNumber)}</strong> is ready for your review in the customer portal.`),
    emailButton(detailUrl, 'View estimate in the portal'),
  ].join('')

  return {
    ...buildStyledEmail({
      subject,
      text,
      title: `Estimate ${input.estimateNumber}`,
      preheader: `Estimate ${input.estimateNumber} is ready for review`,
      bodyHtml,
      appUrl,
    }),
    notificationKind: 'estimate_sent' as const,
  }
}
