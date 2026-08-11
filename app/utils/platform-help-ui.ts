// Platform help assistant — route mapping for client widget (P2-15).
export {
  helpContextLabel,
  helpSuggestionsForPage,
} from '#shared/platform-help'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Map Nuxt route path to mockup page key for contextual suggestions. */
export function helpPageKeyFromRoute(path: string, query?: Record<string, unknown>): string {
  if (path === '/dashboard') return 'dashboard'
  if (path === '/invoices/new') return 'create'
  if (/^\/invoices\/[^/]+\/edit/.test(path)) return 'editor'
  if (/^\/invoices\/[^/]+/.test(path)) return 'invoice-detail'
  if (path.startsWith('/invoices')) return 'invoices'
  if (path.startsWith('/customers')) return 'customers'
  if (path.startsWith('/vehicles')) return 'vehicles'
  if (path.startsWith('/service-logs')) return 'servicelogs'
  if (path.startsWith('/catalog')) return 'catalog'
  if (path.startsWith('/admin') && query?.tab === 'designer') return 'designer'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/system-logs')) return 'audit'
  if (path.startsWith('/templates/email')) return 'admin'
  if (path.startsWith('/templates/designer')) return 'designer'
  if (path.startsWith('/account')) return 'account'
  return 'default'
}

/** Resolve the open record from the route so Susan can answer “this invoice/log”. */
export function helpEntityFromRoute(path: string): {
  entityType?: 'invoice' | 'service_log' | 'customer'
  entityId?: string
} {
  const invoice = path.match(/^\/invoices\/([^/]+)/i)
  if (invoice?.[1] && invoice[1] !== 'new' && UUID_RE.test(invoice[1])) {
    return { entityType: 'invoice', entityId: invoice[1] }
  }
  const serviceLog = path.match(/^\/service-logs\/([^/]+)/i)
  if (serviceLog?.[1] && UUID_RE.test(serviceLog[1])) {
    return { entityType: 'service_log', entityId: serviceLog[1] }
  }
  const customer = path.match(/^\/customers\/([^/]+)/i)
  if (customer?.[1] && customer[1] !== 'new' && UUID_RE.test(customer[1])) {
    return { entityType: 'customer', entityId: customer[1] }
  }
  return {}
}

/** Floating helper is shown only when the user may use help and admin enabled it. */
export function isPlatformHelpWidgetVisible(
  canUseHelp: boolean,
  helpStatus: { enabled: boolean } | null | undefined,
): boolean {
  return canUseHelp && helpStatus?.enabled === true
}

/** Short OpenRouter model label for “Powered by …” footers (id after maker/). */
export function platformHelpModelLabel(modelId: string | null | undefined): string | null {
  const raw = modelId?.trim()
  if (!raw) return null
  const slash = raw.lastIndexOf('/')
  const name = slash >= 0 ? raw.slice(slash + 1) : raw
  return name || raw
}

export function platformHelpPoweredByLabel(modelId: string | null | undefined): string {
  const label = platformHelpModelLabel(modelId)
  return label ? `Powered by ${label}` : 'Powered by AI'
}
