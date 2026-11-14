import { JOB_TONE, type PrinterCondition } from '#shared/printers'

/** Background work the print engine is doing for a printer (add, re-read, tailnet join). */
export type PrinterSetup = {
  kind: 'add' | 'update' | 'join'
  queue: string
  label: string
  host: string
  phase: string
  error: string
  notice: string
  running: boolean
  seconds: number
}

export type PrinterImageCandidate = {
  kind: string
  id: string
  title: string
  license: string
  url: string
}

export type PrinterDevice = {
  queue: string
  label: string
  host: string
  protocol: string
  identity: string
  driver: string
  /** False until the printer has answered and a driver is installed. */
  ready: boolean
  online: boolean
  stats: {
    state?: string
    pages_label?: string
    serial?: string
    firmware?: string
    checks?: Array<{ label: string, value: string, bad: boolean }>
  } | null
  condition: PrinterCondition
  supply: { url?: string, name?: string, note?: string } | null
  image: {
    url: string
    pending?: boolean
    mode?: string
    source_label?: string
    attribution?: string
    license?: string
    candidates: PrinterImageCandidate[]
  }
  tail: { online: boolean, hostname: string, ip: string, state: string, detail?: string }
  setup: PrinterSetup | null
  options?: Array<{ key: string, label: string, current: string, paper: boolean, choices: Array<{ value: string, label: string }> }>
  driver_info?: { name: string, package: string, connection: string, ppd: string } | null
}

export type PrinterJob = {
  id: number
  filename: string
  source: string
  sender: string
  queue: string
  pages: number | null
  copies: number
  sides: string
  status: string
  cups_id: string
  error: string
  has_file: boolean
  created_at: string
}

export type PrintersPage = {
  engine: { ok: boolean, message: string }
  ready: boolean
  printers: PrinterDevice[]
  setups: PrinterSetup[]
  jobs: PrinterJob[]
  events: Array<{ id: number, level: string, message: string, created_at: string }>
  settings: Record<string, string | boolean>
  mail: { state: string, detail: string, checked: string | null }
  tail: { installed: boolean, online: boolean, state: string, detail: string }
  cups: { ok: boolean, lines: string[], error: string }
  active_jobs: { ok: boolean, lines: string[], error: string }
  counts: { total: number, errors: number, submitted: number, pending: number, printers: number }
}

export function printerStatusClass(status: string) {
  const tone = JOB_TONE[status] || 'neutral'
  return `status-pill is-${tone}`
}

export function printerLiveLabel(printer: PrinterDevice) {
  if (printer.setup?.running) return 'Setting up'
  if (!printer.ready) return 'Waiting for printer'
  if (printer.online && printer.stats?.state) return printer.stats.state
  return printer.online ? 'Online' : 'Offline'
}

export function printerLiveTone(printer: PrinterDevice): 'online' | 'offline' | 'warn' | 'wait' {
  if (printer.setup?.running) return 'wait'
  if (!printer.ready) return 'warn'
  if (!printer.online) return 'offline'
  return printer.stats?.state === 'Stopped' ? 'warn' : 'online'
}

/** The engine stores UTC timestamps without a zone ("2026-11-14 13:30:48"). */
export function formatPrinterWhen(value: string) {
  const text = String(value || '')
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** True while something on the page is still changing and worth a quick re-read. */
export function printersBusy(page: PrintersPage | null): boolean {
  if (!page) return false
  return page.setups.some(item => item.running)
    || page.printers.some(printer => printer.setup?.running || printer.image.pending)
}
