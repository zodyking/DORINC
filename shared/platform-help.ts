// Platform help content — shared between server fallback and client widget (P2-15).

export interface HelpAnswer {
  keys: string[]
  text: string
}

export const HELP_SUGGESTIONS: Record<string, string[]> = {
  dashboard: ['What needs my attention?', 'How do I create an invoice?', 'Where is the review queue?'],
  invoices: ['How do I send a payment reminder?', 'What does overdue mean?', 'How are PDFs generated?'],
  'invoice-detail': ['How do I record a payment?', 'Can I resend the portal link?', 'When does an invoice lock?'],
  create: ['Can I save a draft mid-wizard?', 'What happens on finalize?', 'How do I add line items?'],
  editor: ['How does description assist work?', 'When are totals updated?', 'Difference between save and finalize?'],
  customers: ['How do I enable the customer portal?', 'How are credential emails sent?', 'Can customers request vehicles?'],
  vehicles: ['Why are vehicle tags shown first?', 'How does VIN decode work?', 'Who can add vehicles?'],
  servicelogs: ['How does the review queue work?', 'Can AI extract line items?', 'Who can upload logs?'],
  catalog: ['How do labor rates apply?', 'Can I quick-add from the editor?', 'Parts vs labor types?'],
  admin: ['What is the moderation queue?', 'Do I need a .env file?', 'How does setup wizard work?'],
  audit: ['What gets logged here?', 'Can I export system logs?', 'Where is invoice change history?'],
  designer: ['How do templates affect PDFs?', 'Can I preview before saving?', 'How do I publish a template?'],
  account: ['How do I change my password?', 'What is step-up verification?', 'Who sees my sessions?'],
  default: ['How do I create an invoice?', 'What roles can use the platform?', 'How does the customer portal work?'],
}

export const HELP_PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  invoices: 'Invoices',
  create: 'New Invoice wizard',
  editor: 'Invoice Editor',
  admin: 'Control Panel',
  servicelogs: 'Service Logs',
  audit: 'System Logs',
  customers: 'Customers',
  vehicles: 'Vehicles',
  catalog: 'Catalog',
  account: 'My Account',
  designer: 'Template Designer',
}

export const HELP_ANSWERS: HelpAnswer[] = [
  { keys: ['attention', 'needs', 'review queue', 'dashboard'], text: 'The <b>Needs attention</b> table on your dashboard lists overdue invoices and drafts. The right sidebar shows your <b>Review queue</b> — service logs, portal requests, and AI extractions waiting for action. Click any row to jump straight there.' },
  { keys: ['create', 'new invoice', 'wizard'], text: 'Go to <b>Billing tools → New Invoice</b> or click <b>+ New Invoice</b>. The wizard lets you pick customer & vehicle, add line items, then review. You can <b>Save draft</b> at any step — the invoice keeps its number and you can resume from Invoices or the Editor.' },
  { keys: ['finalize', 'send', 'lock'], text: '<b>Finalize & send</b> locks the invoice, generates the official PDF, and notifies the customer by email and portal. After finalize, line totals cannot be edited without creating a revision.' },
  { keys: ['draft', 'save'], text: 'Drafts can be saved at any wizard step or from the Invoice Editor. Saving assigns an invoice number and updates totals. Find drafts in <b>Invoices</b> with the Draft status filter.' },
  { keys: ['payment', 'record', 'balance'], text: 'Open the invoice detail page and click <b>Record payment</b>. Enter amount, method, and date. Amounts over the open balance are rejected.' },
  { keys: ['pdf', 'template'], text: 'Official PDFs use your active invoice template. Customize layout in <b>Template Designer</b>. Customers can download PDFs from the portal; staff can email them from the invoice page.' },
  { keys: ['portal', 'customer', 'credential'], text: 'Enable portal access per customer in their detail page. <b>Credential emails</b> are sent manually from the customer menu (logged every time). Customers see only their invoices, vehicles, and can submit requests.' },
  { keys: ['service log', 'upload', 'review'], text: 'Mechanics upload logs from <b>Service Logs</b>. Accountants review the queue, optionally approve AI-extracted line items, then create an invoice from the log.' },
  { keys: ['description assist', 'ai line'], text: '<b>Description assist</b> drafts line-item text from context. It requires human approval before insert — distinct from this platform help chat.' },
  { keys: ['role', 'permission', 'accountant', 'mechanic', 'admin'], text: 'Account types: <b>Super Admin</b> (full system), <b>Accountant</b> (billing + approvals), <b>Mechanic</b> (vehicles + logs), <b>Customer</b> (portal only), <b>Viewer</b> (read-only). Permissions are enforced on every action.' },
  { keys: ['vehicle', 'tag', 'vin'], text: 'Vehicles are listed by <b>fleet tag</b> first because that is how shops think about fleet assets. VIN decode auto-fills year/make when you add a vehicle.' },
  { keys: ['moderation', 'approve', 'signup', 'pending'], text: 'The <b>Users</b> page shows pending signups. Approve or reject — every action writes an audit entry.' },
  { keys: ['env', 'setup', 'smtp', 'database', 'control panel'], text: 'DORINC is configured in the UI — no .env secrets for app settings. Use <b>Super Admin → Control Panel</b> or the <b>Server setup wizard</b> for database, SMTP, encryption, PDF worker, backup, and AI credentials.' },
  { keys: ['audit', 'log', 'system logs'], text: 'Platform-wide events live in <b>System Logs</b> — settings changes, role updates, backups, and security events. <b>Invoice, customer, and vehicle change history</b> is on each record detail page.' },
  { keys: ['overdue', 'reminder'], text: 'An invoice becomes <b>overdue</b> when past its due date with an open balance. Use <b>Send</b> on the invoice detail page to email the customer.' },
  { keys: ['backup', 'restore'], text: 'Encrypted backups can be run manually from <b>Control Panel → Backup</b>. Configure schedule and Google Drive from the control panel.' },
]

const DEFAULT_FALLBACK = 'I can help with invoices, service logs, roles, PDFs, the customer portal, and system setup. Try asking about a specific page you are on, or tap a suggested question below.'

/** Keyword scoring fallback when AI is unavailable or capped. */
export function matchPlatformHelpAnswer(question: string): string {
  const lower = question.toLowerCase()
  let best: HelpAnswer | null = null
  let bestScore = 0
  for (const entry of HELP_ANSWERS) {
    let score = 0
    for (const key of entry.keys) {
      if (lower.includes(key)) score += key.length
    }
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }
  return best?.text ?? DEFAULT_FALLBACK
}

export function helpSuggestionsForPage(pageKey: string): string[] {
  return HELP_SUGGESTIONS[pageKey] ?? HELP_SUGGESTIONS.default!
}

export function helpContextLabel(pageKey: string): string {
  const label = HELP_PAGE_LABELS[pageKey] ?? pageKey.replace(/-/g, ' ')
  return `Viewing · ${label}`
}
