import type {
  InvoiceTemplateDesignSettings,
  InvoiceTemplateSectionKey,
} from '#shared/invoice-template-design'
import {
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  mergeTemplateSections,
  TEMPLATE_SECTION_DEFS,
} from '#shared/invoice-template-design'

export type { InvoiceTemplateDesignSettings, InvoiceTemplateSectionKey }
export { DEFAULT_INVOICE_TEMPLATE_DESIGN, TEMPLATE_SECTION_DEFS, mergeTemplateSections }

export type TemplateFontPreset = 'system' | 'inter' | 'georgia' | 'ibm-plex'

export interface TemplateFontOption {
  key: TemplateFontPreset
  label: string
  fontSans: string
  fontMono: string
}

export const TEMPLATE_FONT_OPTIONS: TemplateFontOption[] = [
  {
    key: 'system',
    label: 'System UI',
    fontSans: DEFAULT_INVOICE_TEMPLATE_DESIGN.fontSans,
    fontMono: DEFAULT_INVOICE_TEMPLATE_DESIGN.fontMono,
  },
  {
    key: 'inter',
    label: 'Inter',
    fontSans: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    key: 'georgia',
    label: 'Georgia (serif)',
    fontSans: 'Georgia, "Times New Roman", Times, serif',
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    key: 'ibm-plex',
    label: 'IBM Plex',
    fontSans: '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontMono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
]

export const TEMPLATE_PAGE_SIZE_OPTIONS = [
  { value: 'Letter' as const, label: 'US Letter (8.5 × 11 in)' },
  { value: 'A4' as const, label: 'A4 (210 × 297 mm)' },
]

export interface TemplatePreviewLine {
  description: string
  sub?: string
  qty: string
  rate: string
  amount: string
}

export interface TemplatePreviewSample {
  businessName: string
  tagline: string
  invoiceNumber: string
  issued: string
  due: string
  customer: string
  vehicle: string
  vin: string
  odometer: string
  lines: TemplatePreviewLine[]
  subtotal: string
  adjustments: Array<{ label: string, value: string }>
  balanceDue: string
  workNotes: string
  paymentTerms: string
  footer: string
}

export const TEMPLATE_PREVIEW_SAMPLE: TemplatePreviewSample = {
  businessName: 'Devon Onsite Repairs',
  tagline: 'Diesel · Fleet · On-Call Service',
  invoiceNumber: 'INV-000092',
  issued: 'Jul 03, 2026',
  due: 'Aug 02, 2026',
  customer: 'Hollis Logistics LLC',
  vehicle: '2019 Freightliner Cascadia',
  vin: '3AKJHHDR9KSJV1234',
  odometer: '412,806 mi',
  lines: [
    {
      description: 'Diesel diagnostic — DPF regeneration fault',
      sub: 'Scan, forced regen, backpressure test',
      qty: '2.0',
      rate: '145.00',
      amount: '290.00',
    },
    {
      description: 'NOx sensor, outlet (OEM 2894940)',
      sub: 'Replaces failed unit, SPN 3226',
      qty: '1',
      rate: '412.68',
      amount: '412.68',
    },
    {
      description: 'NOx sensor replacement + ECM relearn',
      qty: '1.5',
      rate: '145.00',
      amount: '217.50',
    },
    {
      description: 'Onsite service call — Dover DE',
      sub: 'Mobile unit dispatch, 22 mi round trip',
      qty: '1',
      rate: '95.00',
      amount: '95.00',
    },
  ],
  subtotal: '1,117.88',
  adjustments: [
    { label: 'Fuel surcharge', value: '24.00' },
    { label: 'Deposit applied', value: '−300.00' },
  ],
  balanceDue: '$841.88',
  workNotes: 'Aftertreatment fault traced to failed outlet NOx sensor. Replaced and completed ECM relearn; verified normal regeneration post-repair.',
  paymentTerms: 'Net 30 · Fleet rate. A 1.5% monthly finance charge applies to past-due balances.',
  footer: 'Devon Onsite Repairs · Dover, DE · (302) 555-0114\nRemit within 30 days. ACH preferred — details on request.',
}

export interface PreviewInvoiceApiRow {
  invoiceNumberFormatted: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  customerName: string
  vehicleLabel: string | null
  vin: string | null
  odometer: string | null
  complaint: string | null
  lineItems: Array<{ description: string, qty: string, rate: string, amount: string }>
  subtotal: string
  taxAmount: string
  discountAmount: string
  feesAmount: string
  paymentTerms: string
}

function formatPreviewDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function moneyPlain(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function previewSampleFromInvoice(row: PreviewInvoiceApiRow): TemplatePreviewSample {
  const adjustments: Array<{ label: string, value: string }> = []
  if (row.taxAmount !== '0') adjustments.push({ label: 'Tax', value: moneyPlain(row.taxAmount) })
  if (row.discountAmount !== '0') adjustments.push({ label: 'Discount', value: `−${moneyPlain(row.discountAmount)}` })
  if (row.feesAmount !== '0') adjustments.push({ label: 'Fees', value: moneyPlain(row.feesAmount) })

  return {
    ...TEMPLATE_PREVIEW_SAMPLE,
    invoiceNumber: row.invoiceNumberFormatted,
    issued: formatPreviewDate(row.invoiceDate),
    due: formatPreviewDate(row.dueDate),
    customer: row.customerName,
    vehicle: row.vehicleLabel ?? '—',
    vin: row.vin ?? '—',
    odometer: row.odometer ?? '—',
    lines: row.lineItems.map(line => ({
      description: line.description,
      qty: line.qty,
      rate: moneyPlain(line.rate),
      amount: moneyPlain(line.amount),
    })),
    subtotal: moneyPlain(row.subtotal),
    adjustments,
    balanceDue: `$${moneyPlain(row.balanceDue)}`,
    workNotes: row.complaint ?? TEMPLATE_PREVIEW_SAMPLE.workNotes,
    paymentTerms: row.paymentTerms.replace(/_/g, ' '),
  }
}

export function sectionVisible(
  sections: InvoiceTemplateDesignSettings['sections'],
  key: InvoiceTemplateSectionKey,
): boolean {
  return mergeTemplateSections(sections)[key]?.visible ?? true
}

export function sectionLabel(
  sections: InvoiceTemplateDesignSettings['sections'],
  key: InvoiceTemplateSectionKey,
): string {
  const def = TEMPLATE_SECTION_DEFS.find(s => s.key === key)
  return mergeTemplateSections(sections)[key]?.label ?? def?.label ?? key
}

export function detectFontPreset(settings: Pick<InvoiceTemplateDesignSettings, 'fontSans' | 'fontMono'>): TemplateFontPreset {
  const hit = TEMPLATE_FONT_OPTIONS.find(o => o.fontSans === settings.fontSans && o.fontMono === settings.fontMono)
  return hit?.key ?? 'system'
}

export function versionStatusLabel(status: string, versionNumber: number): string {
  return `v${versionNumber} · ${status}`
}

export function publishStatusLabel(
  publishedAt: string | Date | null | undefined,
  versionNumber: number,
  usageCount?: number,
): string {
  const usage = usageCount != null ? ` · ${usageCount} invoice${usageCount === 1 ? '' : 's'} use this template` : ''
  if (!publishedAt) return `Draft · v${versionNumber}${usage}`
  const when = new Date(publishedAt)
  const stamp = when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Published v${versionNumber} · ${stamp}${usage}`
}

export function previewStyleVars(settings: Pick<InvoiceTemplateDesignSettings, 'accentColor' | 'fontSans'>) {
  return {
    '--pv-accent': settings.accentColor,
    fontFamily: settings.fontSans,
  } as Record<string, string>
}

export function logoPreviewUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}/preview` : null
}

export function designSettingsFromForm(form: {
  pageSize: 'Letter' | 'A4'
  marginInches: number
  accentColor: string
  accentColor2: string
  fontPreset: TemplateFontPreset
  logoFileId: string | null
  sections: Record<InvoiceTemplateSectionKey, { visible: boolean, label: string }>
}): InvoiceTemplateDesignSettings {
  const fonts = TEMPLATE_FONT_OPTIONS.find(o => o.key === form.fontPreset) ?? TEMPLATE_FONT_OPTIONS[0]!
  return {
    pageSize: form.pageSize,
    marginInches: form.marginInches,
    accentColor: form.accentColor,
    accentColor2: form.accentColor2,
    fontSans: fonts.fontSans,
    fontMono: fonts.fontMono,
    logoFileId: form.logoFileId,
    sections: form.sections,
  }
}

export function sectionsFromSettings(
  settings?: InvoiceTemplateDesignSettings,
): Record<InvoiceTemplateSectionKey, { visible: boolean, label: string }> {
  const merged = mergeTemplateSections(settings?.sections)
  const out = {} as Record<InvoiceTemplateSectionKey, { visible: boolean, label: string }>
  for (const def of TEMPLATE_SECTION_DEFS) {
    out[def.key] = {
      visible: merged[def.key]?.visible ?? true,
      label: merged[def.key]?.label ?? def.label,
    }
  }
  return out
}

export function templateOptionLabel(name: string, isDefault: boolean, latestStatus?: string): string {
  const suffix = isDefault ? ' (default)' : latestStatus === 'draft' ? ' (draft)' : ''
  return `${name}${suffix}`
}
