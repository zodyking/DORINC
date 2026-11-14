/**
 * Labels and small rules the Print page, Control Panel, and print APIs share.
 * The print engine itself (drivers, Tailscale, email-to-print) is PrintHarbor,
 * running in its own container; see printharbor/ and server/services/printers.
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

/** Views the engine can build. Each one reads only what that screen needs. */
export const PRINTER_PAGES = ['overview', 'printers', 'jobs', 'email', 'tailscale'] as const
export type PrinterPage = (typeof PRINTER_PAGES)[number]

export const PRINT_PAGE_TABS = ['printers', 'staples'] as const
export type PrintPageTab = (typeof PRINT_PAGE_TABS)[number]

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

export const PRINTER_ALLOWED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.txt', '.docx', '.xlsx', '.odt', '.ods',
] as const

export const QUEUE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/
export const HOSTNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
export const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/

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

export type PrinterSupply = { name: string, percent: number }

export type PrinterCondition = {
  toner: PrinterSupply | null
  drum: PrinterSupply | null
  paper: 'unknown' | 'ready' | 'low' | 'empty'
  jam: 'unknown' | 'clear' | 'jam'
  mark: string
  note: string
}

export function isPrinterSides(value: string | undefined | null): value is PrinterSides {
  return PRINTER_SIDES.includes(value as PrinterSides)
}

export function isValidIpv4(raw: string): boolean {
  return IPV4_RE.test(String(raw || '').trim())
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
