import {
  BLADE_INVOICE_TEMPLATE_MARKER,
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  mergeTemplateSections,
  type InvoiceTemplateDesignSettings,
} from './invoice-template-design'

export function isBuiltInBladeMarker(marker: string): boolean {
  return marker === BLADE_INVOICE_TEMPLATE_MARKER || marker.startsWith('laravel-blade:')
}

export function isInlineBladeSource(marker: string): boolean {
  return marker.length > 0 && !isBuiltInBladeMarker(marker)
}

/** Legacy designer blades that pulled yellow/accent colors from design settings. */
export function isLegacyAccentBladeSource(source: string): boolean {
  const s = source.toLowerCase()
  if (isBuiltInBladeMarker(source)) return false
  return s.includes('#ffd400')
    || s.includes('ffd400')
    || s.includes('accent-bar')
    || s.includes('$accent = $doc')
    || s.includes('$doc[\'design\'][\'accentcolor\']')
    || s.includes('$doc["design"]["accentcolor"]')
}

/** Normalize stored design tokens — invoices render monochrome with safe margins. */
export function normalizeInvoiceTemplateDesign(
  settings: InvoiceTemplateDesignSettings,
): InvoiceTemplateDesignSettings {
  const margin = settings.marginInches ?? DEFAULT_INVOICE_TEMPLATE_DESIGN.marginInches
  return {
    ...settings,
    marginInches: Math.max(0.25, Math.min(1.5, margin)),
    accentColor: DEFAULT_INVOICE_TEMPLATE_DESIGN.accentColor,
    accentColor2: DEFAULT_INVOICE_TEMPLATE_DESIGN.accentColor2,
    fontSans: settings.fontSans || DEFAULT_INVOICE_TEMPLATE_DESIGN.fontSans,
    fontMono: settings.fontMono || DEFAULT_INVOICE_TEMPLATE_DESIGN.fontMono,
    sections: mergeTemplateSections(settings.sections),
  }
}

/**
 * Resolve layout marker / inline blade for PDF rendering.
 * Returns null to use the shipped Laravel view (current baseline).
 */
export function resolveEffectiveBladeSource(layoutMarker: string): string | null {
  if (isBuiltInBladeMarker(layoutMarker)) return null
  if (isLegacyAccentBladeSource(layoutMarker)) return null
  return layoutMarker
}

/** Coerce legacy inline blades to the built-in marker on publish/migration. */
export function coerceLayoutMarkerForStorage(layoutMarker: string): string {
  const trimmed = layoutMarker.trim()
  if (!trimmed || isBuiltInBladeMarker(trimmed)) return trimmed || BLADE_INVOICE_TEMPLATE_MARKER
  if (isLegacyAccentBladeSource(trimmed)) return BLADE_INVOICE_TEMPLATE_MARKER
  return trimmed
}
