import { formatMoney, parseMoney } from './money'
import { normalizeLineType } from './line-item-types'
import type { InvoiceTemplateDesignSettings } from '../server/db/schema/invoice-templates'
import { DEFAULT_INVOICE_TEMPLATE_DESIGN, mergeTemplateSections } from './invoice-template-design'

export type DocumentPdfType = 'invoice' | 'estimate'

export interface DocumentPdfCompany {
  name: string
  tagline: string
  addressLine1: string
  addressLine2: string
  phone: string
  email: string
  hours: string
  logoUrl?: string | null
  logoText?: string
}

export interface DocumentPdfCustomer {
  name: string
  addressLines: string[]
  phone: string
  email: string
}

export interface DocumentPdfVehicle {
  unitNumber: string
  year: string
  makeModel: string
  vin: string
  plate: string
}

export interface DocumentPdfLineItem {
  description: string
  typeBadge: string
  quantity: string
  unitPrice: string
  lineAmount: string
}

export interface DocumentPdfTotals {
  parts: string
  labor: string
  fees: string
  discount: string
  tax: string
  total: string
  balanceDue: string
}

export interface DocumentPdfData {
  documentType: DocumentPdfType
  documentTitle: string
  numberLabel: string
  number: string
  dateLabel: string
  date: string
  dueDateLabel: string
  dueLabel: string
  statusLabel: string
  generatedAt: string
  customer: DocumentPdfCustomer
  vehicle: DocumentPdfVehicle | null
  lineItems: DocumentPdfLineItem[]
  totals: DocumentPdfTotals
  note: string
  company: DocumentPdfCompany
  design: Pick<InvoiceTemplateDesignSettings, 'accentColor' | 'accentColor2' | 'fontSans' | 'fontMono' | 'sections'>
}

export interface DocumentPdfRenderPayload {
  documentType: DocumentPdfType
  data: DocumentPdfData
  options: {
    paper: 'letter' | 'a4'
    margins: { top: number, right: number, bottom: number, left: number }
    bladeSource?: string
  }
}

/** Serialized Blade render payload stored in pdf_render_jobs.html_content. */
export const PDF_RENDER_PAYLOAD_VERSION = 2 as const

export interface StoredPdfRenderPayload extends DocumentPdfRenderPayload {
  _pdf_v: typeof PDF_RENDER_PAYLOAD_VERSION
}

const LINE_TYPE_BADGE: Record<string, string> = {
  part: 'P',
  labor: 'L',
  fee: 'F',
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'DRAFT',
  pending_manager_approval: 'PENDING APPROVAL',
  approved: 'APPROVED',
  sent: 'SENT',
  paid: 'PAID',
  void: 'VOID',
}

const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  draft: 'DRAFT',
  sent: 'SENT',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  converted: 'CONVERTED',
  expired: 'EXPIRED',
  void: 'VOID',
}

function moneyDisplay(value: string): string {
  return `$${formatMoney(parseMoney(value))}`
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${Number(month)}/${Number(day)}/${year}`
}

function formatGeneratedAt(date = new Date()): string {
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function paymentTermsLabel(terms: string): string {
  return PAYMENT_TERMS_LABELS[terms] ?? terms.replace(/_/g, ' ')
}

/** Customer addresses use `zip`; some snapshots/tests use `postalCode`. */
export type DocumentPdfAddressInput = {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  postalCode?: string | null
} | null | undefined

function cleanAddressPart(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return ''
  return trimmed
}

/** Format address lines without leaking JS `undefined` into the PDF. */
export function addressLines(addr: DocumentPdfAddressInput): string[] {
  if (!addr) return []
  const lines: string[] = []
  const line1 = cleanAddressPart(addr.line1)
  if (line1) lines.push(line1)
  const line2 = cleanAddressPart(addr.line2)
  if (line2) lines.push(line2)

  const city = cleanAddressPart(addr.city)
  const state = cleanAddressPart(addr.state)
  const postal = cleanAddressPart(addr.postalCode) || cleanAddressPart(addr.zip)
  const locality = [city, state].filter(Boolean).join(', ')
  const cityLine = [locality, postal].filter(Boolean).join(' ').trim()
  if (cityLine) lines.push(cityLine)

  return lines
}

export function defaultDocumentPdfCompany(businessName?: string): DocumentPdfCompany {
  return {
    name: businessName?.trim() || 'Devon Onsite Repairs',
    tagline: 'Diesel • Fleet • On-Call Service',
    addressLine1: '387 Van Siclen Ave',
    addressLine2: 'Brooklyn, NY 11207',
    phone: '(646) 731-7021',
    email: 'devononsiterepairs@gmail.com',
    hours: 'Mon–Sat 7:00AM–7:00PM',
    logoText: 'DOR<br/>INC',
  }
}

export interface BuildInvoicePdfPayloadInput {
  invoiceNumberFormatted: string
  invoiceDate: string
  paymentTerms: string
  status: string
  complaint?: string | null
  customerNotes?: string | null
  customerName?: string | null
  customerSnapshot?: {
    displayName?: string | null
    phone?: string | null
    email?: string | null
    billingAddress?: DocumentPdfAddressInput
    serviceAddress?: DocumentPdfAddressInput
  } | null
  vehicleSnapshot?: {
    busNumber?: string | null
    unitTag?: string | null
    year?: number | null
    make?: string | null
    model?: string | null
    vin?: string | null
    plate?: string | null
  } | null
  lineItems: Array<{
    description: string
    lineType: string
    quantity: string
    unitPrice: string
    lineAmount: string
  }>
  partsAmount?: string
  laborAmount?: string
  feesAmount: string
  discountAmount: string
  taxAmount: string
  total: string
  balanceDue: string
}

export function buildInvoicePdfData(
  detail: BuildInvoicePdfPayloadInput,
  options: {
    company?: DocumentPdfCompany
    design?: InvoiceTemplateDesignSettings
    logoUrl?: string | null
  } = {},
): DocumentPdfData {
  const customer = detail.customerSnapshot
  const customerName = customer?.displayName ?? detail.customerName ?? 'Customer'
  const customerAddr = customer?.billingAddress ?? customer?.serviceAddress ?? null
  const vehicle = detail.vehicleSnapshot

  const design = options.design ?? DEFAULT_INVOICE_TEMPLATE_DESIGN
  const company = {
    ...defaultDocumentPdfCompany(options.company?.name),
    ...options.company,
    logoUrl: options.logoUrl ?? options.company?.logoUrl ?? null,
  }

  let partsTotal = 0n
  let laborTotal = 0n
  if (detail.partsAmount || detail.laborAmount) {
    partsTotal = parseMoney(detail.partsAmount ?? '0')
    laborTotal = parseMoney(detail.laborAmount ?? '0')
  }
  else {
    for (const line of detail.lineItems) {
      const amt = parseMoney(line.lineAmount)
      const badge = LINE_TYPE_BADGE[normalizeLineType(line.lineType)] ?? 'L'
      if (badge === 'P') partsTotal += amt
      else laborTotal += amt
    }
  }

  return {
    documentType: 'invoice',
    documentTitle: 'INVOICE',
    numberLabel: 'Invoice #',
    number: detail.invoiceNumberFormatted,
    dateLabel: 'Date',
    date: formatDisplayDate(detail.invoiceDate),
    dueDateLabel: 'Due',
    dueLabel: paymentTermsLabel(detail.paymentTerms),
    statusLabel: INVOICE_STATUS_LABELS[detail.status] ?? String(detail.status).toUpperCase(),
    generatedAt: formatGeneratedAt(),
    customer: {
      name: customerName,
      addressLines: addressLines(customerAddr),
      phone: customer?.phone ?? '—',
      email: customer?.email ?? '—',
    },
    vehicle: vehicle
      ? {
          unitNumber: vehicle.busNumber ?? vehicle.unitTag ?? '—',
          year: vehicle.year != null ? String(vehicle.year) : '—',
          makeModel: [vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—',
          vin: vehicle.vin ?? '—',
          plate: vehicle.plate ?? 'Not on file',
        }
      : null,
    lineItems: detail.lineItems.map(line => ({
      description: line.description,
      typeBadge: LINE_TYPE_BADGE[normalizeLineType(line.lineType)] ?? 'L',
      quantity: line.quantity,
      unitPrice: moneyDisplay(line.unitPrice),
      lineAmount: moneyDisplay(line.lineAmount),
    })),
    totals: {
      parts: moneyDisplay(formatMoney(partsTotal)),
      labor: moneyDisplay(formatMoney(laborTotal)),
      fees: moneyDisplay(detail.feesAmount),
      discount: moneyDisplay(detail.discountAmount),
      tax: moneyDisplay(detail.taxAmount),
      total: moneyDisplay(detail.total),
      balanceDue: moneyDisplay(detail.balanceDue),
    },
    note: detail.complaint ?? detail.customerNotes ?? '—',
    company,
    design: {
      accentColor: design.accentColor,
      accentColor2: design.accentColor2,
      fontSans: design.fontSans,
      fontMono: design.fontMono,
      sections: mergeTemplateSections(design.sections),
    },
  }
}

export function buildEstimatePdfData(
  detail: BuildInvoicePdfPayloadInput & { validUntil?: string | null },
  options: Parameters<typeof buildInvoicePdfData>[1] = {},
): DocumentPdfData {
  const base = buildInvoicePdfData({
    ...detail,
    paymentTerms: 'due_on_receipt',
  }, options)

  return {
    ...base,
    documentType: 'estimate',
    documentTitle: 'ESTIMATE',
    numberLabel: 'Estimate #',
    number: detail.invoiceNumberFormatted,
    dueDateLabel: 'Valid',
    dueLabel: detail.validUntil
      ? `Valid until ${formatDisplayDate(detail.validUntil)}`
      : 'Subject to approval',
    statusLabel: ESTIMATE_STATUS_LABELS[detail.status] ?? String(detail.status).toUpperCase(),
  }
}

export function buildDocumentPdfRenderPayload(
  data: DocumentPdfData,
  renderOptions: { paper?: 'letter' | 'a4', marginInches?: number, bladeSource?: string },
): DocumentPdfRenderPayload {
  const margin = renderOptions.marginInches ?? 0.5
  return {
    documentType: data.documentType,
    data,
    options: {
      paper: renderOptions.paper ?? 'letter',
      margins: { top: margin, right: margin, bottom: margin, left: margin },
      bladeSource: renderOptions.bladeSource,
    },
  }
}

export function serializePdfRenderPayload(payload: DocumentPdfRenderPayload): string {
  const stored: StoredPdfRenderPayload = { _pdf_v: PDF_RENDER_PAYLOAD_VERSION, ...payload }
  return JSON.stringify(stored)
}

export function parsePdfRenderPayload(raw: string): DocumentPdfRenderPayload | null {
  try {
    const parsed = JSON.parse(raw) as StoredPdfRenderPayload
    if (parsed?._pdf_v === PDF_RENDER_PAYLOAD_VERSION && parsed.data && parsed.options) {
      return {
        documentType: parsed.documentType,
        data: parsed.data,
        options: parsed.options,
      }
    }
  }
  catch {
    // legacy HTML jobs
  }
  return null
}
