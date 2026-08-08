import type { H3Event } from 'h3'
import { hasPermission } from './require-permission'

/** Who can view Staples PrintMe jobs / barcodes / PDFs. */
export function canViewStaplesPrint(event: H3Event): boolean {
  return hasPermission(event, 'staples.read.all')
    || hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')
    || hasPermission(event, 'invoices.read.all')
}

/** Who can email a blank sheet (or other Staples docs) to Staples PrintMe. */
export function canStartStaplesPrint(event: H3Event): boolean {
  return hasPermission(event, 'staples.print.all')
    || hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')
    || hasPermission(event, 'invoices.read.all')
    || hasPermission(event, 'invoices.update.all')
}
