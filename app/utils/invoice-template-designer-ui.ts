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

export function designSettingsFromForm(form: {
  pageSize: 'Letter' | 'A4'
  marginInches: number
  accentColor: string
  accentColor2: string
  fontPreset: TemplateFontPreset
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
