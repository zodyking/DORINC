/** Customer-facing SMTP templates (SPEC §18). */

export type CustomerNotificationKind = 'invoice_sent' | 'request_status' | 'estimate_sent'

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

function portalUrl(path = ''): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/portal${path}`
}

export interface InvoiceSentTemplateInput {
  recipientName: string
  invoiceNumber: string
  invoiceId: string
  dueDate?: string | null
  total?: string | null
}

export function buildInvoiceSentEmail(input: InvoiceSentTemplateInput) {
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
  const html = [
    `<p>Hello ${input.recipientName},</p>`,
    `<p>Invoice <strong>${input.invoiceNumber}</strong> has been sent and is available in your customer portal.</p>`,
    dueLine ? `<p>${dueLine}</p>` : '',
    totalLine ? `<p>${totalLine}</p>` : '',
    `<p><a href="${detailUrl}">View invoice in the portal</a></p>`,
    '<p>If you have questions, reply to this email or submit a request through the portal.</p>',
  ].filter(Boolean).join('')
  return { subject, text, html, notificationKind: 'invoice_sent' as const }
}

export interface RequestStatusTemplateInput {
  recipientName: string
  requestKind: PortalRequestKindLabel
  requestTitle: string
  status: 'approved' | 'rejected'
  reviewReason?: string | null
}

export function buildRequestStatusEmail(input: RequestStatusTemplateInput) {
  const kindLabel = REQUEST_KIND_LABELS[input.requestKind]
  const statusLabel = input.status === 'approved' ? 'approved' : 'rejected'
  const subject = `${kindLabel} ${statusLabel}`
  const reasonLine = input.reviewReason?.trim()
    ? `Staff note: ${input.reviewReason.trim()}`
    : null
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
    reasonLine,
    '',
    `Track requests: ${portalUrl('/requests')}`,
  ].filter(Boolean).join('\n')
  const html = [
    `<p>Hello ${input.recipientName},</p>`,
    `<p>Your <strong>${kindLabel.toLowerCase()}</strong> &ldquo;${input.requestTitle}&rdquo; has been <strong>${statusLabel}</strong>.</p>`,
    reasonLine ? `<p>${reasonLine}</p>` : '',
    `<p><a href="${portalUrl('/requests')}">View your requests in the portal</a></p>`,
  ].filter(Boolean).join('')
  return { subject, text, html, notificationKind: 'request_status' as const }
}

/** Phase 3 stub — template ready for estimate delivery notifications. */
export interface EstimateSentTemplateInput {
  recipientName: string
  estimateNumber: string
  estimateId: string
}

export function buildEstimateSentEmail(input: EstimateSentTemplateInput) {
  const detailUrl = portalUrl(`/estimates/${input.estimateId}`)
  const subject = `Estimate ${input.estimateNumber} is ready for review`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    '',
    `View estimate: ${detailUrl}`,
  ].join('\n')
  const html = [
    `<p>Hello ${input.recipientName},</p>`,
    `<p>Estimate <strong>${input.estimateNumber}</strong> is ready for your review in the customer portal.</p>`,
    `<p><a href="${detailUrl}">View estimate in the portal</a></p>`,
  ].join('')
  return { subject, text, html, notificationKind: 'estimate_sent' as const }
}
