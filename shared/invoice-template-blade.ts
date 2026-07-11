import { BLADE_INVOICE_TEMPLATE_MARKER } from './invoice-template-design'

export function isBuiltInBladeMarker(marker: string): boolean {
  return marker === BLADE_INVOICE_TEMPLATE_MARKER || marker.startsWith('laravel-blade:')
}

export function isInlineBladeSource(marker: string): boolean {
  return marker.length > 0 && !isBuiltInBladeMarker(marker)
}
