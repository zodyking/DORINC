import type { H3Event } from 'h3'
import { hasPermission } from './require-permission'

/** Who can view Staples PrintMe jobs / barcodes. */
export function canViewStaplesPrint(event: H3Event): boolean {
  return hasPermission(event, 'staples.read.all')
    || hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')
}

/** Who can email a blank sheet to Staples PrintMe. */
export function canStartStaplesPrint(event: H3Event): boolean {
  return hasPermission(event, 'staples.print.all')
    || hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')
}
