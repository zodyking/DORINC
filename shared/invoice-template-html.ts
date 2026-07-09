import type { InvoiceTemplateDesignSettings, InvoiceTemplateSectionKey } from './invoice-template-design'
import { mergeTemplateSections } from './invoice-template-design'

const SECTION_SELECTORS: Partial<Record<InvoiceTemplateSectionKey, string>> = {
  company_info: '[data-section="company_info"]',
  invoice_meta: '[data-section="invoice_meta"]',
  customer: '[data-section="customer"]',
  job_summary: '[data-section="job_summary"]',
  vehicle: '[data-section="vehicle"]',
  symptoms: '[data-section="symptoms"]',
  line_items: '[data-section="line_items"]',
  totals: '[data-section="totals"]',
  payment: '[data-section="payment"]',
  terms: '[data-section="terms"]',
  footer: '[data-section="footer"]',
}

/** Apply designer settings to stored HTML (CSS vars, page size, optional logo). */
export function applyDesignSettingsToHtml(
  html: string,
  settings: InvoiceTemplateDesignSettings,
  logoPreviewPath?: string | null,
): string {
  let out = html

  out = out.replace(/--accent:\s*[^;]+;/, `--accent:${settings.accentColor};`)
  out = out.replace(/--accent2:\s*[^;]+;/, `--accent2:${settings.accentColor2};`)
  out = out.replace(/--sans:\s*[^;]+;/, `--sans:${settings.fontSans};`)
  out = out.replace(/--mono:\s*[^;]+;/, `--mono:${settings.fontMono};`)

  out = out.replace(
    /@page\s*\{[^}]*\}/,
    `@page { size: ${settings.pageSize}; margin: ${settings.marginInches}in; }`,
  )

  if (settings.logoFileId && logoPreviewPath) {
    out = out.replace(
      /<div class="logo"[^>]*>[\s\S]*?<\/div>/,
      `<div class="logo" aria-label="Shop logo"><img src="${logoPreviewPath}" alt="Logo" /></div>`,
    )
  }

  out = applySectionVisibilityToHtml(out, settings)

  return out
}

/** Hide template sections via injected CSS (no custom HTML injection). */
export function applySectionVisibilityToHtml(
  html: string,
  settings: Pick<InvoiceTemplateDesignSettings, 'sections'>,
): string {
  const sections = mergeTemplateSections(settings.sections)
  const rules: string[] = []

  for (const [key, selector] of Object.entries(SECTION_SELECTORS) as Array<[InvoiceTemplateSectionKey, string]>) {
    if (!selector) continue
    if (!sections[key]?.visible) {
      rules.push(`${selector}{ display:none !important; }`)
    }
  }

  if (!rules.length) return html

  const block = `<style data-designer-sections="true">\n${rules.join('\n')}\n</style>`
  if (html.includes('data-designer-sections="true"')) {
    return html.replace(/<style data-designer-sections="true">[\s\S]*?<\/style>/, block)
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', `${block}\n</head>`)
  }
  return `${block}\n${html}`
}
