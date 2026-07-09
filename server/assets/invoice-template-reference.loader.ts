import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bundledReferenceHtml from './invoice-template-reference.html?raw'

/** Load default invoice HTML — bundled at build time, with filesystem fallbacks for dev. */
export function loadInvoiceTemplateReferenceHtml(): string {
  if (bundledReferenceHtml.trim()) return bundledReferenceHtml

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(moduleDir, 'invoice-template-reference.html'),
    join(process.cwd(), 'server', 'assets', 'invoice-template-reference.html'),
    join(process.cwd(), 'Agent-Files', 'invoice-template-reference.html'),
  ]

  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }

  throw new Error(
    `Missing invoice template reference HTML. Expected one of:\n${candidates.map(p => `  - ${p}`).join('\n')}`,
  )
}

/** @deprecated Use loadInvoiceTemplateReferenceHtml — kept for tests. */
export function resolveInvoiceTemplateReferencePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(moduleDir, 'invoice-template-reference.html'),
    join(process.cwd(), 'server', 'assets', 'invoice-template-reference.html'),
    join(process.cwd(), 'Agent-Files', 'invoice-template-reference.html'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  throw new Error(
    `Missing invoice template reference HTML. Expected one of:\n${candidates.map(p => `  - ${p}`).join('\n')}`,
  )
}
