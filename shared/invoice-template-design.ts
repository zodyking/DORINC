/** Marker stored in invoice_template_versions.html_content — layout is always Laravel Blade. */
export const BLADE_INVOICE_TEMPLATE_VIEW = 'invoices/pdf'
export const BLADE_INVOICE_TEMPLATE_MARKER = `laravel-blade:${BLADE_INVOICE_TEMPLATE_VIEW}`

/** Designer settings persisted with each template version (SPEC §9). */
export interface InvoiceTemplateSectionConfig {
  visible: boolean
  label?: string
}

export type InvoiceTemplateSectionKey =
  | 'company_info'
  | 'invoice_meta'
  | 'customer'
  | 'job_summary'
  | 'vehicle'
  | 'symptoms'
  | 'line_items'
  | 'totals'
  | 'payment'
  | 'terms'
  | 'footer'

export interface InvoiceTemplateDesignSettings {
  pageSize: 'Letter' | 'A4'
  marginInches: number
  accentColor: string
  accentColor2: string
  fontSans: string
  fontMono: string
  /** Logo stored in app_files with ownerEntityType template. */
  logoFileId?: string | null
  sections?: Partial<Record<InvoiceTemplateSectionKey, InvoiceTemplateSectionConfig>>
}

export const TEMPLATE_SECTION_DEFS: Array<{
  key: InvoiceTemplateSectionKey
  label: string
  required?: boolean
}> = [
  { key: 'company_info', label: 'Company logo & contact' },
  { key: 'invoice_meta', label: 'Invoice number & dates' },
  { key: 'customer', label: 'Bill to / customer block' },
  { key: 'job_summary', label: 'Job summary & technician' },
  { key: 'vehicle', label: 'Vehicle information' },
  { key: 'symptoms', label: 'Symptoms / complaints' },
  { key: 'line_items', label: 'Line item matrix', required: true },
  { key: 'totals', label: 'Totals & balance due', required: true },
  { key: 'payment', label: 'Payment instructions' },
  { key: 'terms', label: 'Terms & conditions' },
  { key: 'footer', label: 'Footer & signature' },
]

export function defaultTemplateSections(): Record<InvoiceTemplateSectionKey, InvoiceTemplateSectionConfig> {
  const out = {} as Record<InvoiceTemplateSectionKey, InvoiceTemplateSectionConfig>
  for (const def of TEMPLATE_SECTION_DEFS) {
    out[def.key] = { visible: true, label: def.label }
  }
  return out
}

export function mergeTemplateSections(
  sections?: Partial<Record<InvoiceTemplateSectionKey, InvoiceTemplateSectionConfig>>,
): Record<InvoiceTemplateSectionKey, InvoiceTemplateSectionConfig> {
  const base = defaultTemplateSections()
  if (!sections) return base
  for (const def of TEMPLATE_SECTION_DEFS) {
    const patch = sections[def.key]
    if (patch) {
      base[def.key] = {
        visible: def.required ? true : patch.visible,
        label: patch.label?.trim() || def.label,
      }
    }
  }
  return base
}

export const DEFAULT_INVOICE_TEMPLATE_DESIGN: InvoiceTemplateDesignSettings = {
  pageSize: 'Letter',
  marginInches: 0.5,
  accentColor: '#2563eb',
  accentColor2: '#1e293b',
  fontSans: 'DejaVu Sans, Helvetica, Arial, sans-serif',
  fontMono: 'DejaVu Sans Mono, Courier, monospace',
  sections: defaultTemplateSections(),
}
