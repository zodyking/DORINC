export type ServiceLogInvoiceLinkStatusKey = 'queued' | 'in_progress' | 'sent'

export interface ServiceLogInvoiceLinkStatus {
  key: ServiceLogInvoiceLinkStatusKey
  label: string
}

export function serviceLogInvoiceLinkStatusClass(key: ServiceLogInvoiceLinkStatusKey): string {
  return `sl-inv-status sl-inv-status--${key}`
}
