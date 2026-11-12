/**
 * PrintHarbor helpers shared by the staff Printers UI, APIs, and tests.
 * Ported from PrintHarbor (mailer.parse_command, printing condition/stats,
 * supplies, driver matching, IPP/lpinfo parsers).
 */

export const PRINTER_SIDES = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'] as const
export type PrinterSides = (typeof PRINTER_SIDES)[number]

export const PRINTER_JOB_STATUSES = [
  'preparing',
  'pending',
  'sending',
  'submitted',
  'error',
  'rejected',
  'cancelled',
] as const
export type PrinterJobStatus = (typeof PRINTER_JOB_STATUSES)[number]

export const PRINTER_TABS = ['overview', 'devices', 'jobs', 'email', 'tailscale'] as const
export type PrinterTab = (typeof PRINTER_TABS)[number]

export const PRINT_PAGE_TABS = ['printers', 'staples'] as const
export type PrintPageTab = (typeof PRINT_PAGE_TABS)[number]

export const PRINTER_SETTINGS_TABS = ['devices', 'email', 'tailscale'] as const
export type PrinterSettingsTab = (typeof PRINTER_SETTINGS_TABS)[number]

export const PRINTER_IMAGE_CATEGORIES = [
  'mono',
  'color',
  'mfp',
  'inkjet',
  'label',
  'receipt',
  'large',
  'generic',
] as const
export type PrinterImageCategory = (typeof PRINTER_IMAGE_CATEGORIES)[number]

export const IMAGE_CATEGORY_LABELS: Record<PrinterImageCategory, string> = {
  mono: 'Mono laser',
  color: 'Color laser',
  mfp: 'Multifunction',
  inkjet: 'Inkjet',
  label: 'Label',
  receipt: 'Receipt',
  large: 'Large format',
  generic: 'Generic',
}

export function illustrationUrl(category: string | null | undefined): string {
  const key = isPrinterImageCategory(category) ? category : 'generic'
  return `/printers/${key}.svg`
}

export const PRINTER_ALLOWED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.txt', '.docx', '.xlsx', '.odt', '.ods',
] as const

export const QUEUE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/
export const MODEL_RE = /^[A-Za-z0-9_.:/-]{1,180}$/
export const OPTION_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/
export const OPTION_VALUE_RE = /^[A-Za-z0-9_.:/+-]{1,64}$/
export const HOSTNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
export const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/

export const LOW_SUPPLY = 10

export const PRINTER_SETTING_DEFAULTS: Record<string, string> = {
  mail_enabled: '0',
  imap_host: 'imap.gmail.com',
  imap_port: '993',
  imap_user: '',
  imap_folder: 'INBOX',
  allowed_senders: '',
  mail_recipient: '',
  poll_seconds: '3',
  default_queue: '',
  default_sides: 'one-sided',
  max_pages: '40',
  max_files: '5',
  max_mb: '12',
  print_email_body: '0',
  reply_enabled: '0',
  smtp_from: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: '587',
  images_auto: '1',
  images_unifi: '1',
  images_wikimedia: '1',
  images_cache: '1',
  images_catalog_days: '14',
}

export const PRINTER_PRIVATE_KEYS = ['imap_password', 'email_pin'] as const

export const SIDE_LABELS: Record<string, string> = {
  'one-sided': 'Single-sided',
  'two-sided-long-edge': 'Long-edge duplex',
  'two-sided-short-edge': 'Short-edge duplex',
}

export const JOB_LABELS: Record<string, string> = {
  pending: 'Pending',
  sending: 'Sending',
  submitted: 'Sent',
  error: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  preparing: 'Preparing',
}

export const JOB_TONE: Record<string, 'wait' | 'online' | 'offline' | 'warn' | 'neutral'> = {
  pending: 'wait',
  sending: 'wait',
  submitted: 'online',
  error: 'offline',
  rejected: 'warn',
  cancelled: 'neutral',
  preparing: 'neutral',
}

export const IPP_STATES: Record<number, string> = { 3: 'Idle', 4: 'Printing', 5: 'Stopped' }
export const SNMP_STATES: Record<number, string> = { 3: 'Idle', 4: 'Printing', 5: 'Warming up' }

export const REASON_LABELS: Array<[string, string]> = [
  ['media-jam', 'Paper jam'],
  ['media-empty', 'Out of paper'],
  ['media-needed', 'Paper needed'],
  ['media-low', 'Paper low'],
  ['toner-empty', 'Toner empty'],
  ['toner-low', 'Toner low'],
  ['marker-supply-empty', 'Toner empty'],
  ['marker-supply-low', 'Toner low'],
  ['door-open', 'A door is open'],
  ['cover-open', 'A cover is open'],
  ['input-tray-missing', 'A tray is missing'],
  ['output-area-full', 'The output tray is full'],
  ['output-area-almost-full', 'The output tray is almost full'],
  ['paused', 'Paused'],
]

export const SNMP_OIDS = [
  '1.3.6.1.2.1.43.10.2.1.4.1.1',
  '1.3.6.1.2.1.43.5.1.1.17.1',
  '1.3.6.1.2.1.25.3.5.1.1.1',
  ...[1, 2, 3].flatMap(index =>
    ['6', '8', '9'].map(field => `1.3.6.1.2.1.43.11.1.1.${field}.1.${index}`),
  ),
]

export const IPP_FIELDS = [
  'printer-make-and-model', 'printer-device-id', 'printer-state', 'printer-state-reasons',
  'printer-is-accepting-jobs', 'marker-names', 'marker-levels', 'marker-high-levels',
  'printer-firmware-string', 'printer-firmware-name', 'printer-firmware-version',
  'printer-icons',
] as const

export type PrinterCommand = { sides: PrinterSides, copies: number }

export type PrinterSupply = { name: string, percent: number }

export type PrinterCheck = { label: string, value: string, bad: boolean }

export type PrinterStats = {
  state: string
  reasons: string[]
  pages: number | null
  pages_label: string
  supplies: PrinterSupply[]
  serial: string
  firmware: string
  checks: PrinterCheck[]
  model: string
  device_id: string
  health?: string
}

export type PrinterCondition = {
  toner: PrinterSupply | null
  drum: PrinterSupply | null
  paper: 'unknown' | 'ready' | 'low' | 'empty'
  jam: 'unknown' | 'clear' | 'jam'
  mark: string
  note: string
}

export type PrinterDiscovery = {
  reachable: boolean
  ipp: boolean
  socket: boolean
  make: string
  model: string
  device_id: string
  identity: string
}

export type CupsDriver = {
  name: string
  'make-and-model'?: string
  'device-id'?: string
}

export type DriverChoice = {
  model: string
  protocol: 'socket' | 'ipp'
  label: string
  driver: string
}

export type QueueOption = {
  key: string
  label: string
  values: string[]
  choices: Array<{ value: string, label: string }>
  current: string
  paper: boolean
}

const PAPER_NAMES: Record<string, string> = {
  letter: 'Letter', naletter85x11in: 'Letter',
  legal: 'Legal', nalegal85x14in: 'Legal',
  tabloid: 'Tabloid', ledger: 'Tabloid',
  executive: 'Executive',
  a4: 'A4', a5: 'A5', a6: 'A6', isob5: 'B5',
  env10: 'No. 10 envelope', envc5: 'C5 envelope',
  envdl: 'DL envelope', envmonarch: 'Monarch envelope',
  fanfoldgermanlegal: 'German legal fanfold',
}
const PAPER_FIRST = ['Letter', 'Legal', 'Tabloid', 'Executive', 'A4', 'A5', 'A6', 'B5']
const OPTION_NAMES: Record<string, string> = {
  pagesize: 'Paper size', mediasize: 'Paper size',
  mediasource: 'Paper source', inputslot: 'Paper source',
  mediatype: 'Paper type',
  duplex: 'Two-sided', sides: 'Two-sided',
  cupsprintquality: 'Print quality', printquality: 'Print quality',
  resolution: 'Resolution',
}

const TN660 = [
  'DCP-L2520DW', 'DCP-L2540DW', 'HL-L2300D', 'HL-L2305W', 'HL-L2315DW', 'HL-L2320D',
  'HL-L2340DW', 'HL-L2360DW', 'HL-L2380DW', 'MFC-L2680W', 'MFC-L2685DW', 'MFC-L2700DW',
  'MFC-L2705DW', 'MFC-L2707DW', 'MFC-L2720DW', 'MFC-L2740DW',
]
const GENERIC_TOKENS = new Set(['printer', 'unknown', 'ipp', 'everywhere', 'ippeverywhere', 'generic', 'driverless'])
const ID_KEYS = new Set(['MFG', 'MDL', 'CID', 'DES', 'SN', 'SERN', 'CMD', 'CLS'])

export const FRIENDLY_MAIL_REASONS: Record<string, string> = {
  'Sender address is missing': "We couldn't tell who sent this.",
  'Sender is not allowlisted': "This email address isn't approved to print.",
  'Recipient does not match mailbox address': 'Send it to the address for this printer.',
  'Missing or incorrect PIN in email subject': "The code in the subject line didn't match.",
  'Copies must be from 1 to 10': 'Ask for 1 to 10 copies.',
  'Email contained no supported attachments': 'Attach a PDF, photo, or Office document.',
  'It could not be printed.': "We couldn't print this.",
  'Printer not configured': "This printer isn't available right now.",
  'Empty attachment': 'The file was empty.',
  'Invalid PDF file': "That PDF couldn't be opened.",
  'Invalid print options': "Those print options aren't available.",
}

export function isPrinterTab(value: string | undefined | null): value is PrinterTab {
  return (PRINTER_TABS as readonly string[]).includes(value || '')
}

export function isPrinterSides(value: string | undefined | null): value is PrinterSides {
  return (PRINTER_SIDES as readonly string[]).includes(value || '')
}

export function isPrinterImageCategory(value: string | undefined | null): value is PrinterImageCategory {
  return (PRINTER_IMAGE_CATEGORIES as readonly string[]).includes(value || '')
}

export function normalizeQueue(raw: string): string {
  return String(raw || '').trim()
}

export function isValidQueue(raw: string): boolean {
  return QUEUE_RE.test(normalizeQueue(raw))
}

export function isValidIpv4(raw: string): boolean {
  return IPV4_RE.test(String(raw || '').trim())
}

export function compactName(text: string | null | undefined): string {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function normText(text: string | null | undefined): string {
  const cleaned = String(text || '').toLowerCase().replace(/series/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  return cleaned.split(/\s+/).filter(Boolean).join(' ')
}

export function modelCodes(text: string | null | undefined): string[] {
  return (normText(text).match(/[a-z]*\d[a-z0-9]*/g) || [])
}

export function deviceFields(deviceId: string | null | undefined): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const part of String(deviceId || '').split(';')) {
    if (!part.includes(':')) continue
    const [keyRaw, ...rest] = part.split(':')
    const key = (keyRaw || '').trim().toUpperCase()
    const value = rest.join(':').trim()
    if (key && value) fields[key] = value
  }
  return fields
}

function timingEqual(left: string, right: string): boolean {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Read duplex and copies from a subject. A PIN is required only when one is set. */
export function parsePrintCommand(subject: string, token: string): PrinterCommand | null {
  const value = subject || ''
  const pin = (token || '').trim()
  let normalized: string
  if (pin) {
    const match = value.match(/\bPIN:([A-Za-z0-9]{6,32})\b/i)
    if (!match?.[1] || !timingEqual(match[1], pin)) return null
    normalized = value.replace(/\bPIN:[A-Za-z0-9]+\b/gi, '').toUpperCase()
  }
  else {
    normalized = value.toUpperCase()
  }
  let sides: PrinterSides = 'one-sided'
  if (normalized.includes('SHORT EDGE')) sides = 'two-sided-short-edge'
  else if (normalized.includes('DUPLEX') || normalized.includes('2-SIDED')) sides = 'two-sided-long-edge'
  const copiesMatch = normalized.match(/\bCOPIES\s*[:=]\s*(\d{1,2})\b/)
  const copies = copiesMatch ? Number(copiesMatch[1]) : 1
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) return null
  return { sides, copies }
}

export function parseAddressList(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(/[;,]/)
    .map((part) => {
      const trimmed = part.trim()
      const angled = trimmed.match(/<([^>]+)>/)
      return (angled?.[1] || trimmed).trim().toLowerCase()
    })
    .filter(addr => addr.includes('@'))
}

export function evaluateMailMessage(opts: {
  from: string
  to: string
  cc?: string
  subject: string
  config: Record<string, string>
}): { ok: boolean, reason: string, command: PrinterCommand | null, sender: string } {
  const sender = parseAddressList(opts.from)[0] || ''
  const allow = parseAddressList(opts.config.allowed_senders)
  const recipient = (opts.config.mail_recipient || '').trim().toLowerCase()
  if (!sender) return { ok: false, reason: 'Sender address is missing', command: null, sender }
  if (allow.length && !allow.includes(sender)) {
    return { ok: false, reason: 'Sender is not allowlisted', command: null, sender }
  }
  if (recipient) {
    const recipients = parseAddressList(`${opts.to || ''},${opts.cc || ''}`)
    if (!recipients.includes(recipient)) {
      return { ok: false, reason: 'Recipient does not match mailbox address', command: null, sender }
    }
  }
  const pin = (opts.config.email_pin || '').trim()
  const command = parsePrintCommand(opts.subject, pin)
  if (!command) {
    if (pin) return { ok: false, reason: 'Missing or incorrect PIN in email subject', command: null, sender }
    return { ok: false, reason: 'Copies must be from 1 to 10', command: null, sender }
  }
  const upper = (opts.subject || '').toUpperCase()
  if (!upper.includes('DUPLEX') && !upper.includes('2-SIDED') && !upper.includes('SHORT EDGE')) {
    const fallback = opts.config.default_sides || 'one-sided'
    command.sides = isPrinterSides(fallback) ? fallback : 'one-sided'
  }
  return { ok: true, reason: '', command, sender }
}

export function customerMailLine(text: string): string {
  const raw = String(text || '').split(/\s+/).join(' ')
  if (raw in FRIENDLY_MAIL_REASONS) return FRIENDLY_MAIL_REASONS[raw]!
  if (raw.toLowerCase().startsWith('accepted for ') || raw.toLowerCase().includes('accepted by cups')) return 'Printed'
  const lowered = raw.toLowerCase()
  if (raw.startsWith('File larger than')) return 'This file is over the size limit.'
  if (raw.startsWith('Unsupported file type') || lowered.includes('no supported')) {
    return "That file type can't be printed. Send a PDF, photo, or Office document."
  }
  if (raw.startsWith('Document has') && lowered.includes('page')) {
    return raw.replace('Document has', 'This document has').replace('; limit is', '. The limit is')
  }
  if ([
    'cups', 'lpadmin', 'lpstat', 'imap', 'smtp', 'libreoffice', 'soffice',
    'traceback', 'uidvalidity', 'not installed', 'not on path', 'timed out',
    'office conversion', 'already processed',
  ].some(word => lowered.includes(word))) {
    return "The printer couldn't take this file. Send it again."
  }
  return raw
}

export function supplyKind(name: string | null | undefined): 'drum' | 'ink' | 'toner' | '' {
  const low = String(name || '').toLowerCase()
  if (['drum', 'opc', 'imaging', 'photoconductor'].some(word => low.includes(word))) return 'drum'
  if (low.includes('waste')) return ''
  if (low.includes('ink')) return 'ink'
  if (low.includes('toner') || low.includes('cartridge')) return 'toner'
  return ''
}

export function isDrumName(name: string | null | undefined): boolean {
  const low = String(name || '').toLowerCase()
  return ['drum', 'opc', 'imaging', 'photoconductor'].some(word => low.includes(word))
}

export function isTonerName(name: string | null | undefined): boolean {
  const low = String(name || '').toLowerCase()
  return (low.includes('toner') || low.includes('ink')) && !low.includes('waste') && !isDrumName(low)
}

export function supplyPercent(level: number | null | undefined, high: number | null | undefined): number | null {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 0) return null
  if (typeof high === 'number' && Number.isFinite(high) && high > 0) {
    return Math.max(0, Math.min(100, Math.round(level * 100 / high)))
  }
  if (level >= 0 && level <= 100) return level
  return null
}

export function reasonLabel(keyword: string | null | undefined): string {
  const key = (String(keyword || '').split(',')[0] || '').trim().toLowerCase()
  if (!key || key === 'none') return ''
  for (const [needle, label] of REASON_LABELS) {
    if (key.includes(needle)) return label
  }
  return ''
}

export function mergeSupplies(...groups: Array<PrinterSupply[] | null | undefined>): PrinterSupply[] {
  const chosen: PrinterSupply[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const item of group || []) {
      const name = String(item.name || '')
      let key = name.toLowerCase()
      if (isDrumName(name)) key = 'drum'
      else if (isTonerName(name)) key = 'toner'
      if (!key || seen.has(key) || item.percent == null) continue
      seen.add(key)
      chosen.push(item)
    }
  }
  return chosen.slice(0, 6)
}

export function printerCondition(stats: PrinterStats | null | undefined, online = false): PrinterCondition {
  const blank: PrinterCondition = { toner: null, drum: null, paper: 'unknown', jam: 'unknown', mark: 'Toner', note: '' }
  if (!online || !stats) return blank
  let toner: PrinterSupply | null = null
  let drum: PrinterSupply | null = null
  let mark = 'Toner'
  for (const item of stats.supplies || []) {
    const name = String(item.name || '')
    const low = name.toLowerCase()
    if (isDrumName(low)) {
      if (!drum) drum = item
      continue
    }
    if (low.includes('ink')) mark = 'Ink'
    if (!toner && !low.includes('waste')) toner = item
  }
  const reasons = (stats.reasons || []).map(String)
  let paper: PrinterCondition['paper'] = 'ready'
  if (reasons.includes('Out of paper') || reasons.includes('Paper needed')) paper = 'empty'
  else if (reasons.includes('Paper low')) paper = 'low'
  const jam: PrinterCondition['jam'] = reasons.includes('Paper jam') ? 'jam' : 'clear'
  const notes = reasons.filter(item => !['Out of paper', 'Paper needed', 'Paper low', 'Paper jam'].includes(item))
  return { toner, drum, paper, jam, mark, note: notes[0] || '' }
}

function checkBad(stats: PrinterStats | null | undefined, label: string): boolean {
  return Boolean((stats?.checks || []).some(row => row.label === label && row.bad))
}

function healthValue(stats: PrinterStats | null | undefined): string {
  if (stats?.health) return stats.health
  const row = (stats?.checks || []).find(item => item.label === 'Health')
  return row?.value || ''
}

export function printerIssues(stats: PrinterStats | null | undefined, online = true): string[] {
  if (!online) return ['The printer is not connected.']
  if (!stats) return []
  const issues: string[] = []
  for (const item of stats.supplies || []) {
    const kind = supplyKind(item.name)
    if (!kind || typeof item.percent !== 'number' || item.percent > LOW_SUPPLY) continue
    const label = String(item.name || kind).split(/\s+/).join(' ')
    issues.push(`${label} is at ${item.percent}%.`)
  }
  const reasons = (stats.reasons || []).map(String)
  const state = printerCondition(stats, true)
  if (state.paper === 'empty' || checkBad(stats, 'No paper')) issues.push('The paper tray is empty.')
  if (state.jam === 'jam' || checkBad(stats, 'Paper jam')) issues.push('There is a paper jam.')
  if (checkBad(stats, 'Door') || reasons.includes('A door is open') || reasons.includes('A cover is open')) {
    issues.push(reasons.includes('A cover is open') ? 'A cover is open.' : 'A door is open.')
  }
  const health = healthValue(stats)
  if (health === 'Warning') issues.push('Printer health is warning.')
  else if (health === 'Down') issues.push('The printer is down.')
  if (checkBad(stats, 'No toner') && !issues.some(item => item.toLowerCase().includes('toner'))) {
    issues.push('The toner is empty.')
  }
  if (checkBad(stats, 'No ink') && !issues.some(item => item.toLowerCase().includes('ink'))) {
    issues.push('The ink is empty.')
  }
  const extras: Array<[string, string]> = [
    ['A tray is missing', 'A paper tray is missing.'],
    ['The output tray is full', 'The output tray is full.'],
    ['Paused', 'The printer is paused.'],
    ['Not accepting jobs', 'The printer is not accepting jobs.'],
    ['Toner empty', 'The toner is empty.'],
  ]
  for (const [reason, sentence] of extras) {
    if (!reasons.includes(reason)) continue
    if (issues.includes(sentence) || issues.some(item => sentence.toLowerCase().includes(item.toLowerCase()))) continue
    if (reason === 'Toner empty' && issues.some(item => item.toLowerCase().includes('toner'))) continue
    issues.push(sentence)
  }
  if (!issues.length && stats.state === 'Stopped') issues.push('The printer is stopped.')
  return issues
}

export function supplyProblem(stats: PrinterStats | null | undefined): {
  reason: string
  problems: string[]
  notice: boolean
} | null {
  if (!stats) return null
  const problems: string[] = []
  let sawMark = false
  for (const item of stats.supplies || []) {
    const kind = supplyKind(item.name)
    if (!kind || typeof item.percent !== 'number' || item.percent > LOW_SUPPLY) continue
    sawMark = true
    const label = String(item.name || kind).split(/\s+/).join(' ')
    problems.push(`${label} is at ${item.percent}%`)
  }
  const reasons = (stats.reasons || []).map(String)
  if (!sawMark && reasons.includes('Toner empty')) problems.push('The toner is empty')
  if (reasons.includes('Out of paper') || reasons.includes('Paper needed')) problems.push('The printer is out of paper')
  if (reasons.includes('Paper jam')) problems.push('The printer has a paper jam')
  if (!problems.length) return null
  const state = printerCondition(stats, true)
  let reason = problems.join('. ')
  if (!reason.endsWith('.')) reason += '.'
  reason += ' The document was not printed.'
  return { reason, problems, notice: state.paper !== 'empty' && state.jam !== 'jam' }
}

function supplyKindLabel(source: string): 'Ink' | 'Toner' | 'Cartridge' {
  const low = source.toLowerCase()
  if (['inkjet', ' ink', 'officejet', 'deskjet', 'pixma', 'ecotank', 'eco tank', 'envy'].some(word => low.includes(word))) {
    return 'Ink'
  }
  if (['toner', 'laser', 'hl-l', 'laserjet', 'mfc-l', 'dcp-l'].some(word => low.includes(word))) {
    return 'Toner'
  }
  return 'Cartridge'
}

function supplyPhrase(source: string, kind: string): string {
  const words: string[] = []
  for (const raw of String(source || '').split(/[\s;]+/)) {
    let token = raw.trim().replace(/,$/, '')
    if (!token) continue
    if (token.includes(':')) {
      const [key, ...rest] = token.split(':')
      const value = rest.join(':').trim()
      if (!ID_KEYS.has((key || '').trim().toUpperCase()) || !value) continue
      if (['SN', 'SERN', 'CMD', 'CLS'].includes((key || '').trim().toUpperCase())) continue
      token = value
    }
    if (GENERIC_TOKENS.has(compactName(token))) continue
    words.push(token)
  }
  const phrase = words.join(' ')
  if (!phrase) return ''
  const supplyWord = kind === 'Cartridge' ? 'printer' : kind.toLowerCase()
  return `${phrase} ${supplyWord} cartridge`
}

export function amazonSearch(query: string): string {
  const term = encodeURIComponent(String(query || '').split(/\s+/).join(' ').slice(0, 120) || 'printer cartridge')
  return `https://www.amazon.com/s?k=${term}&s=price-asc-rank`
}

export function replacementFor(identity: string | null | undefined): {
  kind: string
  name: string
  note: string
  url: string
} | null {
  const source = String(identity || '').split(/\s+/).join(' ')
  if (!source) return null
  const compact = compactName(source)
  for (const model of TN660) {
    if (compact.includes(compactName(model))) {
      return {
        kind: 'Toner',
        name: 'TN660',
        note: 'High-yield cartridge. TN630 is the smaller one.',
        url: amazonSearch('TN660 toner cartridge'),
      }
    }
  }
  const kind = supplyKindLabel(source)
  const phrase = supplyPhrase(source, kind)
  if (!phrase) return null
  return { kind, name: '', note: '', url: amazonSearch(phrase) }
}

export function categoryFor(text: string | null | undefined): PrinterImageCategory {
  const low = String(text || '').toLowerCase()
  if (['receipt', 'thermal'].some(word => low.includes(word))) return 'receipt'
  if (['labelwriter', 'dymo', 'zebra', 'ql-', 'label printer'].some(word => low.includes(word))) return 'label'
  if (['plotter', 'designjet', 'surecolor', 'large format'].some(word => low.includes(word))) return 'large'
  if (['mfc', 'mfp', 'multifunction', 'all-in-one', 'all in one'].some(word => low.includes(word))) return 'mfp'
  if (['inkjet', 'pixma', 'ecotank', 'officejet', 'deskjet', 'stylus', 'workforce'].some(word => low.includes(word))) return 'inkjet'
  if (low.includes('color') || low.includes('colour')) return 'color'
  if (['laser', 'laserjet', 'hl-'].some(word => low.includes(word))) return 'mono'
  return 'generic'
}

const MAKERS: Array<[string, string]> = [
  ['hewlett packard', 'hp'],
  ['konica minolta', 'konica'],
  ['brother', 'brother'],
  ['canon', 'canon'],
  ['epson', 'epson'],
  ['xerox', 'xerox'],
  ['samsung', 'samsung'],
  ['lexmark', 'lexmark'],
  ['kyocera', 'kyocera'],
  ['ricoh', 'ricoh'],
  ['konica', 'konica'],
  ['sharp', 'sharp'],
  ['toshiba', 'toshiba'],
  ['panasonic', 'panasonic'],
  ['oki', 'oki'],
  ['okidata', 'oki'],
  ['dell', 'dell'],
  ['pantum', 'pantum'],
  ['dymo', 'dymo'],
  ['zebra', 'zebra'],
  ['fuji', 'fuji'],
  ['hp', 'hp'],
]
const MAKER_KEYS = new Set(MAKERS.map(([, key]) => key))
const CODE_STOP = new Set([
  'pro', 'plus', 'series', 'printer', 'printers', 'color', 'colour', 'laser', 'laserjet',
  'ink', 'inkjet', 'mono', 'wireless', 'network', 'all', 'one', 'eco', 'ecotank', 'pixma',
  'officejet', 'deskjet', 'workforce', 'expression', 'surecolor', 'designjet', 'imageclass',
  'workcentre', 'versalink', 'phaser', 'smart', 'tank', 'office',
])

function makerPhrase(phrase: string) {
  const body = phrase.split(' ').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[- ]')
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`)
}

export type PrinterModelIdentity = {
  manufacturer: string
  model: string
  code: string
  key: string
  display: string
  category: PrinterImageCategory
}

export function identifyPrinter(text: string | null | undefined): PrinterModelIdentity {
  let raw = String(text || '').toLowerCase()
  raw = raw.replace(/\b(series|industries|corporation|corp|inc|ltd|company)\b/g, ' ')
  let maker = ''
  const spaced = raw.replace(/-/g, ' ')
  for (const [phrase, key] of MAKERS) {
    const pattern = makerPhrase(phrase)
    if (pattern.test(spaced)) {
      maker = key
      raw = raw.replace(pattern, ' ')
      break
    }
  }
  const parts = raw.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []
  const found: Array<[string, string]> = []
  for (let index = 0; index < parts.length; index++) {
    const token = parts[index] || ''
    const compact = token.replace(/[^a-z0-9]/g, '')
    const prev = index ? (parts[index - 1] || '').replace(/[^a-z0-9]/g, '') : ''
    let glued = ''
    if (prev && /^[a-z]+$/.test(prev) && prev.length >= 1 && prev.length <= 4 && !CODE_STOP.has(prev) && !MAKER_KEYS.has(prev)) {
      if (/[a-z]/.test(compact) && /\d/.test(compact) && compact.length >= 3) glued = prev + compact
      else if (/^\d{3,6}$/.test(compact)) glued = prev + compact
    }
    if (glued) found.push([glued, token.includes('-') ? token : `${parts[index - 1]}-${token}`])
    else if (/[a-z]/.test(compact) && /\d/.test(compact) && compact.length >= 4) found.push([compact, token])
    else if (/^\d{3,6}$/.test(compact)) found.push([compact, token])
  }
  const picked = found.length ? found.reduce((best, item) => item[0].length > best[0].length ? item : best) : ['', '']
  const code = picked[0]
  const display = picked[1] || code
  const key = maker && code ? `${maker}|${code}` : code
  return {
    manufacturer: maker,
    model: code,
    code,
    key,
    display,
    category: categoryFor(text || ''),
  }
}

export function vendorBias(driver: CupsDriver): number {
  const blob = `${driver.name || ''} ${driver['make-and-model'] || ''}`.toLowerCase()
  if (blob.includes('brlaser')) return 8
  if (blob.includes('gutenprint')) return 6
  return 0
}

export function driverTitle(driver: CupsDriver): string {
  return String(driver['make-and-model'] || driver.name || 'Driver').trim().slice(0, 120)
}

export function chooseDriver(discovery: PrinterDiscovery, drivers: CupsDriver[]): DriverChoice {
  const model = normText(discovery.model)
  const make = normText(discovery.make)
  const identity = normText(discovery.identity)
  const wanted = modelCodes(model || identity)
  let best: CupsDriver | null = null
  let bestScore = 0
  for (const driver of drivers || []) {
    const name = driver.name || ''
    const low = name.toLowerCase()
    if (!MODEL_RE.test(name)) continue
    if (['everywhere', 'generic', 'driverless', 'drvless', 'foomatic'].some(word => low.includes(word))) continue
    const fields = deviceFields(driver['device-id'])
    const described = normText(fields.MDL || driver['make-and-model'] || '')
    const maker = normText(fields.MFG || '')
    if (make && maker && make !== maker) continue
    const offered = modelCodes(described)
    let score = 0
    if (wanted.length && offered.length && wanted[0] === offered[0]) score = 100
    else if (model && described && (model === described || model.includes(described) || described.includes(model))) {
      if (!wanted.length || !offered.length || wanted[0] === offered[0]) score = 90
    }
    else if (identity && described && (identity.includes(described) || described.includes(identity))) {
      if (!wanted.length || !offered.length || wanted[0] === offered[0]) score = 85
    }
    if (score && make && maker && make === maker) score += 5
    if (score) score += vendorBias(driver)
    if (score > bestScore) {
      best = driver
      bestScore = score
    }
  }
  const identityLabel = (discovery.identity || 'Printer').trim().slice(0, 120)
  if (best && bestScore >= 80) {
    if ((best.name || '').includes('brlaser')) {
      if (!discovery.socket) {
        if (discovery.ipp) {
          return { model: 'everywhere', protocol: 'ipp', label: identityLabel, driver: 'IPP Everywhere' }
        }
        throw new Error('This printer needs port 9100, and that port did not answer')
      }
      return { model: best.name, protocol: 'socket', label: identityLabel, driver: driverTitle(best) }
    }
    if (discovery.socket) {
      return { model: best.name, protocol: 'socket', label: identityLabel, driver: driverTitle(best) }
    }
  }
  if (discovery.ipp) {
    return { model: 'everywhere', protocol: 'ipp', label: identityLabel, driver: 'IPP Everywhere' }
  }
  throw new Error('The printer answered, but no driver matched it')
}

export function parseLpinfo(text: string): CupsDriver[] {
  const drivers: CupsDriver[] = []
  let current: Record<string, string> | null = null
  for (const line of String(text || '').split(/\n/)) {
    const stripped = line.trim()
    if (stripped === '{') {
      current = {}
      continue
    }
    if (stripped === '}' && current) {
      if (current.name) drivers.push(current as CupsDriver)
      current = null
      continue
    }
    if (current && stripped.includes('=')) {
      const idx = stripped.indexOf('=')
      current[stripped.slice(0, idx).trim()] = stripped.slice(idx + 1).trim()
      continue
    }
    if (!current && stripped && !stripped.startsWith('#')) {
      const space = stripped.indexOf(' ')
      const name = space === -1 ? stripped : stripped.slice(0, space)
      const desc = space === -1 ? '' : stripped.slice(space + 1)
      if (MODEL_RE.test(name)) drivers.push({ name, 'make-and-model': desc, 'device-id': '' })
    }
  }
  return drivers
}

export function choiceLabel(value: string): string {
  const compact = compactName(value)
  if (PAPER_NAMES[compact]) return PAPER_NAMES[compact]!
  const spaced = String(value || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.replace(/\b\w/g, ch => ch.toUpperCase()).slice(0, 40)
}

export function optionLabel(key: string, label: string): string {
  const compact = compactName(key)
  if (OPTION_NAMES[compact]) return OPTION_NAMES[compact]!
  const raw = (label || key).replace(/_/g, ' ')
  return raw.replace(/\b\w/g, ch => ch.toUpperCase()).slice(0, 40)
}

function isPaperSetting(key: string, label: string): boolean {
  const blob = `${key} ${label}`.toLowerCase()
  return ['pagesize', 'mediasize', 'paper size', 'page size'].some(word => blob.includes(word.replace(' ', '')) || blob.includes(word))
}

function orderChoices(values: string[], current: string, paper: boolean): string[] {
  const ordered = [...values]
  if (current && ordered.includes(current)) {
    ordered.splice(ordered.indexOf(current), 1)
    ordered.unshift(current)
  }
  if (!paper) return ordered
  const first = ordered.filter(value => PAPER_FIRST.includes(choiceLabel(value)))
  first.sort((a, b) => PAPER_FIRST.indexOf(choiceLabel(a)) - PAPER_FIRST.indexOf(choiceLabel(b)))
  const rest = ordered.filter(value => !first.includes(value))
  return [...first, ...rest]
}

export function parseQueueOptions(text: string): QueueOption[] {
  const options: QueueOption[] = []
  for (const line of String(text || '').split(/\n/)) {
    if (!line.includes(':')) continue
    const idx = line.indexOf(':')
    const left = line.slice(0, idx)
    const right = line.slice(idx + 1)
    const key = left.split('/', 1)[0]!.trim()
    const rawLabel = left.includes('/') ? left.split('/').slice(1).join('/').trim() : key
    if (!OPTION_RE.test(key)) continue
    let current = ''
    const values: string[] = []
    for (const token of right.split(/\s+/).filter(Boolean)) {
      const chosen = token.startsWith('*')
      const value = chosen ? token.slice(1) : token
      if (!value || !OPTION_VALUE_RE.test(value) || values.includes(value)) continue
      values.push(value)
      if (chosen) current = value
    }
    if (values.length < 2) continue
    const paper = isPaperSetting(key, rawLabel)
    const ordered = orderChoices(values, current || values[0]!, paper)
    options.push({
      key,
      label: optionLabel(key, rawLabel),
      values: ordered,
      choices: ordered.map(value => ({ value, label: choiceLabel(value) })),
      current: current || values[0]!,
      paper,
    })
  }
  options.sort((a, b) => {
    const rank = (option: QueueOption) => {
      if (option.paper) return 0
      const low = `${option.key} ${option.label}`.toLowerCase()
      if (['economode', 'toner save', 'density', 'quality', 'resolution'].some(word => low.includes(word))) return 1
      if (['duplex', 'two-sided', 'source', 'type'].some(word => low.includes(word))) return 2
      return 3
    }
    return rank(a) - rank(b)
  })
  return options
}

export function densityOptions(lpoptionsText: string): Array<[string, string]> {
  const chosen: Array<[string, string]> = []
  for (const line of String(lpoptionsText || '').split(/\n/)) {
    if (!line.includes(':')) continue
    const idx = line.indexOf(':')
    const left = line.slice(0, idx)
    const right = line.slice(idx + 1)
    const key = left.split('/', 1)[0]!.trim()
    if (!OPTION_RE.test(key)) continue
    const label = left.toLowerCase()
    const values = right.split(/\s+/).map(item => item.replace(/^\*/, '')).filter(Boolean)
    if (key.toLowerCase().includes('economode') || label.includes('toner save')) {
      if (values.includes('False')) chosen.push([key, 'False'])
      continue
    }
    if (!key.toLowerCase().includes('density') && !label.includes('density')) continue
    const numbered: Array<[number, string]> = []
    for (const value of values) {
      if (!OPTION_VALUE_RE.test(value)) continue
      const n = Number(value)
      if (Number.isInteger(n)) numbered.push([n, value])
    }
    if (numbered.length) chosen.push([key, numbered.reduce((a, b) => (a[0] > b[0] ? a : b))[1]])
  }
  return chosen
}

export function parseIpp(payload: Buffer): Record<string, Array<string | number | boolean>> {
  let raw = payload || Buffer.alloc(0)
  const sep = raw.indexOf(Buffer.from('\r\n\r\n'))
  if (raw.subarray(0, 5).toString() === 'HTTP/' && sep >= 0) raw = raw.subarray(sep + 4)
  if (raw.length < 8) return {}
  let index = 8
  const found: Record<string, Array<string | number | boolean>> = {}
  let current = ''
  while (index < raw.length) {
    const tag = raw[index]!
    index += 1
    if (tag === 0x03) break
    if (tag < 0x10) continue
    if (index + 4 > raw.length) break
    const nameLen = raw.readUInt16BE(index)
    index += 2
    const name = raw.subarray(index, index + nameLen).toString('utf8')
    index += nameLen
    if (index + 2 > raw.length) break
    const valueLen = raw.readUInt16BE(index)
    index += 2
    let value = raw.subarray(index, index + valueLen)
    index += valueLen
    if (name) current = name
    if (!current) continue
    if ((tag === 0x36 || tag === 0x37) && value.length >= 4) {
      const langLen = value.readUInt16BE(0)
      const textAt = 2 + langLen
      if (textAt + 2 <= value.length) {
        const textLen = value.readUInt16BE(textAt)
        value = value.subarray(textAt + 2, textAt + 2 + textLen)
      }
    }
    if ((tag === 0x21 || tag === 0x23) && value.length === 4) {
      ;(found[current] ||= []).push(value.readInt32BE(0))
    }
    else if (tag === 0x22 && value.length === 1) {
      ;(found[current] ||= []).push(value[0] === 1)
    }
    else if ([0x36, 0x37, 0x41, 0x42, 0x44, 0x45, 0x47, 0x48, 0x49].includes(tag)) {
      ;(found[current] ||= []).push(value.toString('utf8'))
    }
  }
  return found
}

export function readingsFromIpp(attrs: Record<string, Array<string | number | boolean>>): {
  state: string
  reasons: string[]
  pages: null
  supplies: PrinterSupply[]
  serial: string
  firmware: string
} {
  const stateValues = attrs['printer-state'] || []
  const state = typeof stateValues[0] === 'number' ? (IPP_STATES[stateValues[0]] || '') : ''
  const reasons: string[] = []
  for (const keyword of attrs['printer-state-reasons'] || []) {
    const label = reasonLabel(String(keyword))
    if (label && !reasons.includes(label)) reasons.push(label)
  }
  const accepting = attrs['printer-is-accepting-jobs'] || []
  if (accepting[0] === false && !reasons.includes('Not accepting jobs')) reasons.push('Not accepting jobs')
  const names = (attrs['marker-names'] || []).map(String)
  const levels = attrs['marker-levels'] || []
  const highs = attrs['marker-high-levels'] || []
  const supplies: PrinterSupply[] = []
  levels.forEach((level, i) => {
    const percent = supplyPercent(typeof level === 'number' ? level : null, typeof highs[i] === 'number' ? highs[i] as number : 100)
    if (percent == null) return
    const name = String(names[i] || '').trim() || 'Toner'
    supplies.push({ name: name.slice(0, 40), percent })
  })
  const fields = deviceFields(String((attrs['printer-device-id'] || [''])[0] || ''))
  let firmware = ''
  for (const key of ['printer-firmware-string', 'printer-firmware-version', 'printer-firmware-name']) {
    const values = attrs[key] || []
    if (values[0] && String(values[0]).trim()) {
      firmware = String(values[0]).trim().slice(0, 80)
      break
    }
  }
  return {
    state,
    reasons: reasons.slice(0, 4),
    pages: null,
    supplies: supplies.slice(0, 6),
    serial: String(fields.SN || fields.SERN || '').trim().slice(0, 40),
    firmware,
  }
}

export function hostnameFor(label: string, queue: string): string {
  let raw = String(label || queue || 'printer').replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 63).toLowerCase()
  if (!HOSTNAME_RE.test(raw || '')) raw = 'printer'
  return raw
}

export function paperWord(paper: PrinterCondition['paper']): string {
  if (paper === 'ready') return 'In the tray'
  if (paper === 'low') return 'Paper low'
  if (paper === 'empty') return 'Out of paper'
  return 'Not reported'
}

export function jamWord(jam: PrinterCondition['jam']): string {
  if (jam === 'clear') return 'Clear'
  if (jam === 'jam') return 'Paper jam'
  return 'Not reported'
}
