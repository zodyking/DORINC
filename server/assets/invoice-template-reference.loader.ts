import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FALLBACK_INVOICE_TEMPLATE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice INV-000081</title>
  <style>
    body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 24px; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    .meta { color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px 4px; text-align: left; }
    th.r, td.r { text-align: right; }
  </style>
</head>
<body>
  <h1>Devon Onsite Repairs Inc.</h1>
  <div class="meta">Invoice INV-000081 · Brandon Kadeem King</div>
  <table>
    <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>
      <tr><td>Service</td><td class="r">1</td><td class="r">$0.00</td><td class="r">$0.00</td></tr>
    </tbody>
  </table>
</body>
</html>
`

function referenceHtmlCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  return [
    join(process.cwd(), 'server', 'assets', 'invoice-template-reference.html'),
    join(moduleDir, 'invoice-template-reference.html'),
    join(process.cwd(), 'Agent-Files', 'invoice-template-reference.html'),
  ]
}

/** Load default invoice HTML from server/assets (copied into the app image at deploy). */
export function loadInvoiceTemplateReferenceHtml(): string {
  for (const path of referenceHtmlCandidates()) {
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  console.warn('[invoice-templates] reference HTML missing on disk — using built-in fallback')
  return FALLBACK_INVOICE_TEMPLATE_HTML
}

/** @deprecated Use loadInvoiceTemplateReferenceHtml — kept for tests. */
export function resolveInvoiceTemplateReferencePath(): string {
  for (const path of referenceHtmlCandidates()) {
    if (existsSync(path)) return path
  }
  throw new Error(
    `Missing invoice template reference HTML. Expected one of:\n${referenceHtmlCandidates().map(p => `  - ${p}`).join('\n')}`,
  )
}
