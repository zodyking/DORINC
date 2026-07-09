// Platform help assistant — route mapping for client widget (P2-15).
export {
  helpContextLabel,
  helpSuggestionsForPage,
} from '#shared/platform-help'

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
  if (path.startsWith('/templates/designer')) return 'designer'
  if (path.startsWith('/account')) return 'account'
  return 'default'
}
