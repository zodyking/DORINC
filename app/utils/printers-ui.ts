import { JOB_TONE } from '#shared/printers'

export type PrinterDevice = {
  queue: string
  label: string
  host: string
  protocol: string
  identity: string
  driver: string
  online: boolean
  stats: {
    state?: string
    pages_label?: string
    serial?: string
    firmware?: string
    checks?: Array<{ label: string, value: string, bad: boolean }>
  } | null
  condition: {
    toner: { name: string, percent: number } | null
    drum: { name: string, percent: number } | null
    paper: 'unknown' | 'ready' | 'low' | 'empty'
    jam: 'unknown' | 'clear' | 'jam'
    mark: string
    note: string
  }
  supply: { url?: string, name?: string, note?: string } | null
  image: { url: string, pending?: boolean, category?: string }
  tail: { online: boolean, hostname: string, ip: string, state: string }
  options: Array<{ key: string, label: string, current: string, paper: boolean, choices: Array<{ value: string, label: string }> }>
  driverInfo: { name: string, package: string, connection: string, ppd: string } | null
}

export type PrintersPage = {
  tab: string
  printers: PrinterDevice[]
  jobs: Array<{
    id: string
    filename: string
    source: string
    sender: string
    queue: string
    pages: number | null
    copies: number
    sides: string
    status: string
    cupsId: string
    error: string
    createdAt: string
  }>
  events: Array<{ id: string, level: string, message: string, createdAt: string }>
  settings: Record<string, string>
  mail: { state: string, detail: string, checked: string | null }
  tail: { installed: boolean, online: boolean, state: string, detail: string }
  cups: { ok: boolean, lines: string[], error: string }
  activeJobs: { ok: boolean, lines: string[], error: string }
  counts: { total: number, errors: number, submitted: number, pending: number, printers: number }
}

export function printerStatusClass(status: string) {
  const tone = JOB_TONE[status] || 'neutral'
  return `status-pill is-${tone}`
}

export function printerLiveLabel(printer: PrinterDevice) {
  if (printer.online && printer.stats?.state) return printer.stats.state
  return printer.online ? 'Online' : 'Offline'
}

export function formatPrinterWhen(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
