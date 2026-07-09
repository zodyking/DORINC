import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

  throw new Error(
    `Missing invoice template reference HTML. Expected one of:\n${referenceHtmlCandidates().map(p => `  - ${p}`).join('\n')}`,
  )
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
