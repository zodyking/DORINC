import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { printers } from '../../db/schema/printers'
import {
  categoryFor,
  isPrinterImageCategory,
  type PrinterImageCategory,
} from '../../../shared/printers'
import { PrintError } from './errors'

const ILLUSTRATION_TYPES: Record<PrinterImageCategory, string> = {
  mono: 'image/svg+xml',
  color: 'image/svg+xml',
  mfp: 'image/svg+xml',
  inkjet: 'image/svg+xml',
  label: 'image/svg+xml',
  receipt: 'image/svg+xml',
  large: 'image/svg+xml',
  generic: 'image/svg+xml',
}

export function illustrationPath(category: PrinterImageCategory): string {
  return join(process.cwd(), 'public', 'printers', `${category}.svg`)
}

export function describePrinterImage(row: {
  queue: string
  identity?: string | null
  label?: string | null
  imageMode?: string | null
  imageSource?: string | null
  imageData?: Buffer | null
  imageContentType?: string | null
}) {
  const category = categoryFor(row.identity || row.label || '')
  const pending = row.imageMode === 'auto' && !row.imageData
  return {
    mode: row.imageMode || 'auto',
    source: row.imageSource || (row.imageData ? 'upload' : 'illustration'),
    pending,
    category,
    url: `/api/printers/${encodeURIComponent(row.queue)}/image`,
    candidates: [] as Array<{ kind: string, id: string, title: string, license?: string }>,
  }
}

export function staticIllustration(category: string): { body: Buffer, contentType: string } {
  const key = isPrinterImageCategory(category) ? category : 'generic'
  const path = illustrationPath(key)
  if (existsSync(path)) return { body: readFileSync(path), contentType: ILLUSTRATION_TYPES[key] }
  const fallback = illustrationPath('generic')
  return { body: existsSync(fallback) ? readFileSync(fallback) : Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), contentType: 'image/svg+xml' }
}

export async function printerImageBytes(db: Db, queue: string): Promise<{ body: Buffer, contentType: string } | null> {
  const [row] = await db.select().from(printers).where(eq(printers.queue, queue)).limit(1)
  if (!row) return null
  if (row.imageData && row.imageData.length) {
    return { body: row.imageData, contentType: row.imageContentType || 'image/png' }
  }
  return staticIllustration(categoryFor(row.identity || row.label))
}

export async function applyPrinterImage(
  db: Db,
  queue: string,
  opts: { action: string, illustration?: string, upload?: { filename: string, data: Buffer, type?: string } },
) {
  const [row] = await db.select().from(printers).where(eq(printers.queue, queue)).limit(1)
  if (!row) throw new PrintError('Printer not found')
  if (opts.action === 'auto') {
    await db.update(printers).set({
      imageMode: 'auto',
      imageSource: '',
      imageData: null,
      imageContentType: null,
      updatedAt: new Date(),
    }).where(eq(printers.queue, queue))
    return
  }
  if (opts.action === 'apply' && opts.illustration && isPrinterImageCategory(opts.illustration)) {
    const file = staticIllustration(opts.illustration)
    await db.update(printers).set({
      imageMode: 'manual',
      imageSource: 'illustration',
      imagePath: opts.illustration,
      imageData: file.body,
      imageContentType: file.contentType,
      updatedAt: new Date(),
    }).where(eq(printers.queue, queue))
    return
  }
  if ((opts.action === 'apply' || opts.action === 'preview' || opts.action === 'apply-preview') && opts.upload) {
    const type = (opts.upload.type || '').toLowerCase()
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(type)
      || /\.(png|jpe?g|webp|svg)$/i.test(opts.upload.filename)
    if (!ok) throw new PrintError('Upload a PNG, JPEG, WebP, or SVG')
    if (opts.upload.data.length > 2_000_000) throw new PrintError('Image is larger than 2 MB')
    await db.update(printers).set({
      imageMode: 'manual',
      imageSource: 'upload',
      imageData: opts.upload.data,
      imageContentType: type || 'image/png',
      updatedAt: new Date(),
    }).where(eq(printers.queue, queue))
  }
}
