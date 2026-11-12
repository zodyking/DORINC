import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { printers } from '../../db/schema/printers'
import {
  categoryFor,
  identifyPrinter,
  illustrationUrl,
  isPrinterImageCategory,
  type PrinterImageCategory,
  type PrinterModelIdentity,
} from '../../../shared/printers'
import { PrintError } from './errors'
import {
  clearImageCatalog,
  getImageCatalogRow,
  getPrinterRow,
  listPrinterRows,
  printerSettingsMap,
  printersDataDir,
  recordPrinterEvent,
  setPrinterSetting,
  upsertImageCatalog,
} from './store'

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

const UA = 'DORINC/1.0 (printer image cache)'
const FINGERPRINT_URL = 'https://raw.githubusercontent.com/CANTI-BOT/UniFi-Icon-Browser/main/chrome-extension/data/fingerprint-database.json'
const FINGERPRINT_PATH = '/CANTI-BOT/UniFi-Icon-Browser/main/chrome-extension/data/fingerprint-database.json'
const HOSTS = new Set(['static.ui.com', 'commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org'])
const lastTried = new Map<string, number>()
let fingerprintCache: { mtime: number, entries: Array<{ id: string, name: string } & PrinterModelIdentity> } = { mtime: 0, entries: [] }

type CatalogRow = NonNullable<Awaited<ReturnType<typeof getImageCatalogRow>>>

export function illustrationPath(category: PrinterImageCategory): string {
  return join(process.cwd(), 'public', 'printers', `${category}.svg`)
}

function imagesDir() {
  const folder = join(printersDataDir(), 'images')
  mkdirSync(folder, { recursive: true })
  return folder
}

function fingerprintFile() {
  return join(imagesDir(), 'fingerprint-database.json')
}

function cacheFile(key: string) {
  return join(imagesDir(), `${createHash('sha256').update(key).digest('hex').slice(0, 24)}.png`)
}

function networkEnabled() {
  return process.env.PRINTER_IMAGE_NETWORK !== '0'
}

function identityOf(printer: { identity?: string | null, driver?: string | null, label?: string | null, queue?: string | null }) {
  const driver = String(printer.driver || '').replace(/,\s*using\s+.*$/i, '').trim()
  const blob = [printer.identity, driver, printer.label].filter(Boolean).join(' ')
  for (const text of [printer.identity, driver]) {
    const found = identifyPrinter(text)
    if (found.code) {
      found.category = categoryFor(blob || text)
      return found
    }
  }
  for (const text of [printer.label, printer.queue]) {
    const found = identifyPrinter(text)
    if (found.code) {
      found.category = categoryFor(blob || text)
      return found
    }
  }
  return identifyPrinter(blob)
}

export function describePrinterImage(row: {
  queue: string
  identity?: string | null
  label?: string | null
  driver?: string | null
  imageMode?: string | null
  imageSource?: string | null
  imageData?: Buffer | null
  imageContentType?: string | null
}) {
  const ident = identityOf(row)
  const category = ident.category || categoryFor(row.identity || row.label || '')
  const hasPhoto = Boolean(row.imageData && row.imageData.length)
  const pending = (row.imageMode || 'auto') !== 'manual' && !hasPhoto && Boolean(ident.key)
  return {
    mode: row.imageMode || 'auto',
    source: row.imageSource || (hasPhoto ? 'upload' : 'illustration'),
    pending,
    category,
    url: hasPhoto
      ? `/api/printers/${encodeURIComponent(row.queue)}/image`
      : illustrationUrl(category),
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

export async function printerImageBytes(db: Db, queue: string): Promise<{ body: Buffer, contentType: string, pending: boolean } | null> {
  const [row] = await db.select().from(printers).where(eq(printers.queue, queue)).limit(1)
  if (!row) return null
  const described = describePrinterImage(row)
  if (row.imageData && row.imageData.length) {
    return { body: row.imageData, contentType: row.imageContentType || 'image/png', pending: described.pending }
  }
  const file = staticIllustration(described.category)
  return { ...file, pending: described.pending }
}

function remoteOk(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname === 'raw.githubusercontent.com') return parsed.pathname === FINGERPRINT_PATH
    if (parsed.hostname === 'thumb.wikimedia.org') return parsed.pathname.startsWith('/wikipedia/commons/')
    return HOSTS.has(parsed.hostname)
  }
  catch {
    return false
  }
}

async function fetchRemote(url: string, timeout = 12_000, limit = 2_000_000): Promise<{ body: Buffer, type: string }> {
  if (!networkEnabled()) throw new PrintError('Printer image downloads are turned off')
  if (!remoteOk(url)) throw new PrintError('Unsupported image address')
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'image/*,application/json' },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  })
  if (!remoteOk(res.url)) throw new PrintError('The image address changed host')
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length || buf.length > limit) throw new PrintError('The image provider returned an unexpected file')
  return { body: buf, type: (res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase() }
}

function rasterOk(data: Buffer) {
  if (!data.length || data[0] === 0x3c || data[0] === 0x7b) return false
  const head = data.subarray(0, 400).toString('latin1').toLowerCase()
  if (head.includes('<html') || head.includes('<!doctype')) return false
  return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    || data.subarray(0, 4).toString() === 'RIFF'
}

function imageOk(data: Buffer, contentType = '') {
  const type = contentType.toLowerCase()
  if (type.includes('html') || type.includes('json') || type.startsWith('text/')) return false
  if (type.includes('svg')) return data.includes(Buffer.from('<svg'))
  return rasterOk(data)
}

function edits(left: string, right: string) {
  if (left === right) return 0
  if (!left || !right) return Math.max(left.length, right.length)
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      current.push(Math.min(current[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1)))
    }
    for (let j = 0; j <= right.length; j++) prev[j] = current[j]!
  }
  return prev[right.length]!
}

type FingerEntry = { id: string, name: string } & PrinterModelIdentity

function loadIndex(): FingerEntry[] {
  const path = fingerprintFile()
  if (!existsSync(path)) return []
  const mtime = Number(readFileSync(path).length)
  if (fingerprintCache.mtime === mtime) return fingerprintCache.entries
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string> | Array<{ id?: string, name?: string }>
    const pairs: Array<[string, string]> = Array.isArray(raw)
      ? raw.map(item => [String(item.id || ''), String(item.name || '')])
      : Object.entries(raw)
    const entries: FingerEntry[] = []
    for (const [id, name] of pairs) {
      if (!id || !name) continue
      const found = identifyPrinter(name)
      if (!found.code) continue
      entries.push({ id: String(id), name: String(name), ...found })
    }
    fingerprintCache = { mtime, entries }
    return entries
  }
  catch {
    return []
  }
}

async function refreshFingerprint(force = false) {
  const path = fingerprintFile()
  if (existsSync(path) && !force) return true
  try {
    const { body } = await fetchRemote(FINGERPRINT_URL, 20_000, 8_000_000)
    JSON.parse(body.toString('utf8'))
    writeFileSync(path, body)
    fingerprintCache = { mtime: 0, entries: [] }
    return true
  }
  catch {
    return existsSync(path)
  }
}

function makersOk(left: string, right: string) {
  return !left || !right || left === right
}

function near(left: string, right: string) {
  if (!left || !right || left === right) return false
  if (left.startsWith(right) || right.startsWith(left)) {
    const extra = left.startsWith(right) ? left.slice(right.length) : right.slice(left.length)
    return /^[a-z]{1,3}$/.test(extra)
  }
  return false
}

function matchEntries(entries: FingerEntry[], ident: PrinterModelIdentity) {
  const code = ident.code || ''
  const maker = ident.manufacturer || ''
  if (!code) return { match: null as FingerEntry | null, confidence: 0, candidates: [] as FingerEntry[] }
  const exact: FingerEntry[] = []
  const nearby: FingerEntry[] = []
  for (const item of entries) {
    if (!item.code || !makersOk(maker, item.manufacturer)) continue
    if (item.code === code) exact.push(item)
    else if (near(code, item.code)) nearby.push(item)
  }
  if (exact.length === 1) {
    return { match: exact[0]!, confidence: maker && exact[0]!.manufacturer === maker ? 1 : 0.9, candidates: nearby.slice(0, 6) }
  }
  if (exact.length > 1) {
    const same = exact.filter(item => maker && item.manufacturer === maker)
    if (same.length === 1) return { match: same[0]!, confidence: 1, candidates: exact.filter(item => item !== same[0]).slice(0, 6) }
    return { match: null, confidence: 0, candidates: exact.slice(0, 6) }
  }
  return { match: null, confidence: 0, candidates: nearby.slice(0, 6) }
}

function nearestEntry(entries: FingerEntry[], ident: PrinterModelIdentity) {
  const code = ident.code || ''
  const maker = ident.manufacturer || ''
  if (!code || !maker || code.length < 4) return null
  let best: FingerEntry | null = null
  let bestKey: [number, number, string] | null = null
  for (const item of entries) {
    if (!item.code || item.code === code || item.manufacturer !== maker || item.code.length < 4) continue
    const distance = edits(code, item.code)
    if (distance < 1 || distance > 2) continue
    let prefix = 0
    for (let i = 0; i < Math.min(code.length, item.code.length); i++) {
      if (code[i] !== item.code[i]) break
      prefix += 1
    }
    if (prefix < Math.max(2, Math.floor((Math.min(code.length, item.code.length) + 1) / 2))) continue
    const leftNums = (code.match(/\d+/g) || []).map(Number)
    const rightNums = (item.code.match(/\d+/g) || []).map(Number)
    if (!leftNums.length || leftNums.length !== rightNums.length) continue
    const gap = leftNums.reduce((sum, n, i) => sum + Math.abs(n - (rightNums[i] || 0)), 0)
    if (gap > 40) continue
    const key: [number, number, string] = [distance, gap, item.code]
    if (!bestKey || key < bestKey) {
      bestKey = key
      best = item
    }
  }
  return best
}

function licenseOk(name: string) {
  const low = (name || '').toLowerCase().replace(/[_-]/g, ' ')
  if (!low.trim()) return false
  if (/\bnc\b|non ?commercial|\bnd\b|no deriv/.test(low)) return false
  return ['public domain', 'cc0', 'cc by', 'gfdl'].some(token => low.includes(token))
}

function wikiAcceptable(title: string, license: string, code: string, manufacturer = '') {
  const compact = title.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!code || !compact.includes(code)) return false
  const maker = manufacturer.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (maker && !compact.includes(maker)) return false
  const low = title.toLowerCase()
  if (['logo', 'screenshot', 'icon', 'diagram', 'manual', 'packaging', 'box'].some(word => low.includes(word))) return false
  return licenseOk(license)
}

async function downloadUnifi(db: Db, ident: PrinterModelIdentity, match: FingerEntry, confidence: number) {
  const itemId = String(match.id || '')
  if (!/^\d{1,12}$/.test(itemId)) return null
  const url = `https://static.ui.com/fingerprint/0/${itemId}_257x257.png`
  try {
    const { body, type } = await fetchRemote(url)
    if (!imageOk(body, type)) return null
    writeFileSync(cacheFile(ident.key), body)
    return upsertImageCatalog(db, {
      modelKey: ident.key,
      manufacturer: ident.manufacturer,
      model: ident.code,
      source: 'unifi',
      fingerprintId: itemId,
      localPath: cacheFile(ident.key),
      confidence,
      attribution: confidence >= 0.9 ? 'Ubiquiti' : (match.name || 'Ubiquiti'),
      category: ident.category,
      candidates: '[]',
    }).then(row => ({ row, body }))
  }
  catch {
    return null
  }
}

function wikiPages(payload: { query?: { pages?: Record<string, unknown> | unknown[] } }) {
  const pages = payload.query?.pages || {}
  const values = Array.isArray(pages) ? pages : Object.values(pages)
  const found: Array<{ title: string, license: string, artist: string, url: string, page: string, mime: string }> = []
  for (const page of values) {
    if (!page || typeof page !== 'object') continue
    const rec = page as { title?: string, imageinfo?: Array<{ thumburl?: string, url?: string, mime?: string, descriptionurl?: string, extmetadata?: Record<string, { value?: string }> }> }
    const info = rec.imageinfo?.[0] || {}
    const meta = info.extmetadata || {}
    const val = (key: string) => String(meta[key]?.value || '')
    found.push({
      title: rec.title || '',
      license: val('LicenseShortName').replace(/<[^>]+>/g, ' ').split(/\s+/).join(' ').slice(0, 180),
      artist: val('Artist').replace(/<[^>]+>/g, ' ').split(/\s+/).join(' ').slice(0, 180),
      url: info.thumburl || info.url || '',
      page: info.descriptionurl || '',
      mime: info.mime || '',
    })
  }
  return found
}

async function downloadWiki(db: Db, ident: PrinterModelIdentity) {
  const shown = ident.display || ident.code || ''
  const query = [shown ? `intitle:${shown}` : '', ident.manufacturer, 'printer'].filter(Boolean).join(' ')
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '480',
  }).toString()}`
  try {
    const { body } = await fetchRemote(url, 12_000, 1_000_000)
    const payload = JSON.parse(body.toString('utf8')) as { query?: { pages?: Record<string, unknown> } }
    for (const page of wikiPages(payload)) {
      if (!wikiAcceptable(page.title, page.license, ident.code, ident.manufacturer) || !remoteOk(page.url)) continue
      const image = await fetchRemote(page.url).catch(() => null)
      if (!image || !imageOk(image.body, image.type || page.mime)) continue
      writeFileSync(cacheFile(ident.key), image.body)
      return {
        row: await upsertImageCatalog(db, {
          modelKey: ident.key,
          manufacturer: ident.manufacturer,
          model: ident.code,
          source: 'wikimedia',
          localPath: cacheFile(ident.key),
          confidence: 0.9,
          license: page.license,
          attribution: page.artist || 'Wikimedia Commons',
          sourcePage: page.page,
          category: ident.category,
        }),
        body: image.body,
      }
    }
  }
  catch {
    return null
  }
  return null
}

async function applyCatalogPhoto(db: Db, queue: string, ident: PrinterModelIdentity, saved: { row: CatalogRow | null, body: Buffer }) {
  if (!saved.row) return null
  await db.update(printers).set({
    imageKey: ident.key,
    imageSource: saved.row.source,
    imageData: saved.body,
    imageContentType: 'image/png',
    imageAttribution: saved.row.attribution,
    imageLicense: saved.row.license,
    imagePage: saved.row.sourcePage,
    updatedAt: new Date(),
  }).where(and(eq(printers.queue, queue), eq(printers.imageMode, 'auto')))
  return saved.row
}

async function resolveModel(db: Db, ident: PrinterModelIdentity, cfg: Record<string, string>) {
  if (!ident.code || !ident.key) return null
  const current = await getImageCatalogRow(db, ident.key)
  if (current?.localPath && existsSync(current.localPath) && ['unifi', 'wikimedia', 'printer', 'upload'].includes(current.source)) {
    return { row: current, body: existsSync(current.localPath) ? readFileSync(current.localPath) : null }
  }
  await refreshFingerprint(false)
  const entries = loadIndex()
  const result = matchEntries(entries, ident)
  if (cfg.images_unifi !== '0' && result.match) {
    const saved = await downloadUnifi(db, ident, result.match, result.confidence)
    if (saved?.body) return saved
  }
  if (cfg.images_wikimedia !== '0') {
    const wiki = await downloadWiki(db, ident)
    if (wiki?.body) return wiki
  }
  if (cfg.images_unifi !== '0') {
    const nearMatch = nearestEntry(entries, ident)
    if (nearMatch) {
      const saved = await downloadUnifi(db, ident, nearMatch, 0.6)
      if (saved?.body) return saved
    }
  }
  return null
}

export async function resolvePrinterImage(db: Db, queue: string) {
  const printer = await getPrinterRow(db, queue)
  if (!printer || (printer.imageMode || 'auto') === 'manual') return null
  const cfg = await printerSettingsMap(db)
  if (cfg.images_auto === '0') return null
  const ident = identityOf(printer)
  if (!ident.key) return null
  lastTried.set(queue, Date.now())
  const saved = await resolveModel(db, ident, cfg)
  if (saved?.body) {
    await applyCatalogPhoto(db, queue, ident, { row: saved.row, body: saved.body })
    await recordPrinterEvent(db, 'success', `Printer picture found for ${printer.label}`)
    return saved.row
  }
  await db.update(printers).set({ imageKey: ident.key, updatedAt: new Date() }).where(eq(printers.queue, queue))
  return null
}

export async function resolvePendingPrinterImages(db: Db, limit = 1) {
  if (!networkEnabled()) return 0
  const cfg = await printerSettingsMap(db)
  if (cfg.images_auto === '0') return 0
  let done = 0
  for (const printer of await listPrinterRows(db)) {
    if (done >= limit) break
    if ((printer.imageMode || 'auto') === 'manual') continue
    if (printer.imageData && printer.imageData.length) continue
    const ident = identityOf(printer)
    if (!ident.key) continue
    const tried = lastTried.get(printer.queue) || 0
    if (Date.now() - tried < 30 * 60 * 1000) continue
    try {
      await resolvePrinterImage(db, printer.queue)
      done += 1
    }
    catch {
      await recordPrinterEvent(db, 'warning', `Printer image lookup could not finish for ${printer.label}`)
    }
  }
  return done
}

export async function saveImageSettings(db: Db, body: Record<string, string | boolean | number | undefined>) {
  const days = Math.max(1, Math.min(90, Number(body.images_catalog_days ?? 14) || 14))
  await setPrinterSetting(db, 'images_auto', body.images_auto ? '1' : '0')
  await setPrinterSetting(db, 'images_unifi', body.images_unifi ? '1' : '0')
  await setPrinterSetting(db, 'images_wikimedia', body.images_wikimedia ? '1' : '0')
  await setPrinterSetting(db, 'images_cache', body.images_cache ? '1' : '0')
  await setPrinterSetting(db, 'images_catalog_days', String(days))
  await recordPrinterEvent(db, 'success', 'Printer image settings saved')
  return printerSettingsMap(db)
}

export async function refreshImageCatalog(db: Db) {
  const ok = await refreshFingerprint(true)
  if (!ok) throw new PrintError('The printer catalog could not be refreshed. The previous copy was kept.')
  await recordPrinterEvent(db, 'success', 'Printer catalog refreshed')
}

export async function rescanPrinterImages(db: Db) {
  lastTried.clear()
  await db.update(printers).set({
    imageData: null,
    imageContentType: null,
    imageKey: '',
    updatedAt: new Date(),
  }).where(eq(printers.imageMode, 'auto'))
  await resolvePendingPrinterImages(db, 1)
  await recordPrinterEvent(db, 'success', 'Printer images will be looked up again')
}

export async function clearPrinterImageCache(db: Db) {
  lastTried.clear()
  await clearImageCatalog(db)
  await recordPrinterEvent(db, 'success', 'Printer image cache cleared')
}

export async function applyPrinterImage(
  db: Db,
  queue: string,
  opts: { action: string, illustration?: string, upload?: { filename: string, data: Buffer, type?: string } },
) {
  const [row] = await db.select().from(printers).where(eq(printers.queue, queue)).limit(1)
  if (!row) throw new PrintError('Printer not found')
  if (opts.action === 'auto' || opts.action === 'search') {
    await db.update(printers).set({
      imageMode: 'auto',
      imageSource: '',
      imageData: null,
      imageContentType: null,
      updatedAt: new Date(),
    }).where(eq(printers.queue, queue))
    lastTried.delete(queue)
    if (opts.action === 'search') await resolvePrinterImage(db, queue)
    return
  }
  if (opts.action === 'apply' && opts.illustration && isPrinterImageCategory(opts.illustration)) {
    const file = staticIllustration(opts.illustration)
    await db.update(printers).set({
      imageMode: 'manual',
      imageSource: 'illustration',
      imagePath: opts.illustration,
      imageFingerprint: opts.illustration,
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
