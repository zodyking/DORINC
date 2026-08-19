/**
 * Structured application knowledge for Susan’s get_app_knowledge tool.
 * Source of truth for page/feature documentation (not stuffed into every prompt).
 */

export interface AppKnowledgeDoc {
  id: string
  title: string
  /** High-level product area. */
  area: string
  /** Matches PlatformHelpWidget pageContext keys when known. */
  pageKeys: string[]
  tags: string[]
  summary: string
  /** In-depth plain-text documentation for the model. */
  body: string
}

export const APP_KNOWLEDGE_DOCS: AppKnowledgeDoc[] = [
  {
    id: 'nav-overview',
    title: 'Staff navigation and home areas',
    area: 'navigation',
    pageKeys: ['dashboard', 'default'],
    tags: ['nav', 'menu', 'sidebar', 'pages', 'overview', 'home'],
    summary: 'Where staff areas live in the left nav and what each major section is for.',
    body: [
      'Staff app areas (permission-gated):',
      '- Dashboard: attention items, review queues, quick actions.',
      '- Invoices: list, create wizard, detail, editor, payments, reconcile.',
      '- Service Logs: upload, review queue, AI extract, convert to invoice.',
      '- Customers / Vehicles: fleet CRM and unit records.',
      '- Catalog: parts, labor, fees, packages, rates.',
      '- Messages: team chat and DMs.',
      '- Users: staff accounts, approvals, permissions.',
      '- Control Panel (admin): business, invoice, AI/Susan, email, Quo SMS, backup, security.',
      '- Templates: invoice designer + email/SMS template editors.',
      '- System Logs: platform-wide audit events.',
      '- Billing: integration credentials (OpenRouter, Vultr, Cloudflare, Quo).',
      '- Portal Requests / Deletion Requests / Staples / Announcements: ops queues.',
      'Customer portal is a separate area under /portal for customer accounts only.',
    ].join('\n'),
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    area: 'dashboard',
    pageKeys: ['dashboard'],
    tags: ['dashboard', 'attention', 'review queue', 'overdue', 'needs attention'],
    summary: 'Needs attention table and review sidebar for logs, portal requests, and AI work.',
    body: [
      'Page: /dashboard',
      'Purpose: daily ops landing page.',
      'Needs attention: overdue invoices and drafts needing action.',
      'Review queue (sidebar): service logs awaiting review, portal requests, AI extractions pending accept/reject.',
      'Quick actions typically include New Invoice and jumping into queues.',
      'What Susan cannot do: open queues or change statuses for the user — give navigation steps instead.',
    ].join('\n'),
  },
  {
    id: 'invoices-list',
    title: 'Invoices list',
    area: 'invoices',
    pageKeys: ['invoices'],
    tags: ['invoices', 'list', 'filter', 'status', 'draft', 'sent', 'paid', 'void', 'overdue'],
    summary: 'Browse, filter, and open invoices; start new invoices from here.',
    body: [
      'Page: /invoices',
      'Statuses include draft, sent, paid, void; overdue is derived from due date + open balance.',
      'Staff can filter/search, open detail, or start New Invoice.',
      'Bulk actions may include print/PDF depending on permissions.',
      'Permission: invoices.read / create / update / send as granted by role.',
    ].join('\n'),
  },
  {
    id: 'invoice-wizard',
    title: 'New Invoice wizard',
    area: 'invoices',
    pageKeys: ['create'],
    tags: ['wizard', 'new invoice', 'create', 'line items', 'service log', 'draft', 'finalize'],
    summary: 'Step flow: customer → vehicle → optional service log → dates → lines → review.',
    body: [
      'Page: /invoices/new',
      'Steps: Customer → Vehicle → Service log (when AI extraction enabled) → Dates → Line items → Review.',
      'Service log step: upload front/back photos, QR phone upload, optional AI extract, attach log to draft invoice.',
      'Line items step: guided/voice entry or manual table; if log photos exist, reveal slider compares photos vs lines.',
      'Draft save assigns invoice number; finalize/send locks and notifies.',
      'Cannot invent line items from thin air — when AI extracts, user still reviews before accepting.',
    ].join('\n'),
  },
  {
    id: 'invoice-editor',
    title: 'Invoice editor',
    area: 'invoices',
    pageKeys: ['editor'],
    tags: ['editor', 'edit invoice', 'line items', 'save', 'ai audit', 'field photos', 'reveal'],
    summary: 'Edit draft/unlocked invoices: details, narrative, lines, optional field-photo reveal, PDF tab.',
    body: [
      'Page: /invoices/:id/edit',
      'Tabs: Invoice | Service log (if linked) | PDF preview (if permitted).',
      'Invoice tab: customer/unit/dates, complaint + internal notes, line items table, change history.',
      'When linked service log has photos: Line items section includes a reveal slider (top track + ball) between Field photos and Line items.',
      'Header actions on lines: AI (line audit report), Add Package, Add line. Catalog search is via description autocomplete.',
      'Save runs line audit gate when enabled; editing session lock prevents two editors clobbering each other.',
      'Paid/void invoices are not editable.',
    ].join('\n'),
  },
  {
    id: 'invoice-detail',
    title: 'Invoice detail / view',
    area: 'invoices',
    pageKeys: ['invoice-detail'],
    tags: ['invoice detail', 'view', 'payment', 'send', 'pdf', 'photos tab'],
    summary: 'Read invoice, send/resend, record payment, PDF preview, linked service-log photos.',
    body: [
      'Page: /invoices/:id',
      'Tabs: Details | Photos (if service-log images) | PDF preview.',
      'Photos tab uses the same ServiceLogPhotoManager gallery as the editor (zoom/pan, browse).',
      'Actions (permissioned): Edit, Send/Resend, Record payment, PDF download/print, Staples PrintMe, delete/reassign when allowed.',
      'Record payment: amount/method/date; rejects overpayment.',
      'Finalize/send generates official PDF and customer notifications.',
    ].join('\n'),
  },
  {
    id: 'service-logs',
    title: 'Service logs',
    area: 'service-logs',
    pageKeys: ['servicelogs'],
    tags: ['service log', 'upload', 'review', 'ai extract', 'sheet', 'photos', 'convert'],
    summary: 'Mechanic field logs with photos, AI extraction, review, and convert-to-invoice.',
    body: [
      'Pages: /service-logs, /service-logs/new, /service-logs/:id',
      'Paper sheet: printable checklist from Edit Template on /service-logs (catalog.manage.all); QR upload for phone photos.',
      'Edit Template can Generate from demand: ranks catalog items by invoice frequency, uses multiple AI calls to propose simple section titles, packs left/right under Letter capacity with QR void, then review/reject/edit before applying to the editor (Save sheet still required).',
      'Photos: max 2 (front/back). AI extraction classifies handwritten vs printed_form.',
      'Printed/template pages lock checked items to the active sheet editor list; handwritten pages require high per-line confidence.',
      'Statuses move through draft/uploaded/ai_processing/ready_for_review/converted_to_invoice etc.',
      'Convert/attach to invoice copies draft lines; accepted extraction can store checkmark overlays for invoice edit photos.',
      'Susan (AI Administrator) can review deletion requests — separate from platform help.',
    ].join('\n'),
  },
  {
    id: 'customers',
    title: 'Customers',
    area: 'customers',
    pageKeys: ['customers'],
    tags: ['customers', 'portal', 'credentials', 'billing', 'price list'],
    summary: 'Customer records, portal enablement, credential emails, linked vehicles/invoices.',
    body: [
      'Pages: /customers, /customers/new, /customers/:id, edit.',
      'Fields: display name, contacts, billing/shipping, payment terms, tax exempt, price list, portal flags.',
      'Portal: enable per customer; send credential emails from customer actions (logged).',
      'Customers only see their own portal data. Staff cannot ask Susan to create customers — guide through UI steps.',
    ].join('\n'),
  },
  {
    id: 'vehicles',
    title: 'Vehicles / units',
    area: 'vehicles',
    pageKeys: ['vehicles'],
    tags: ['vehicles', 'unit', 'fleet tag', 'vin', 'bus'],
    summary: 'Fleet units listed by tag; VIN decode; linked to customers and invoices/logs.',
    body: [
      'Pages: /vehicles, new, detail, edit.',
      'Primary identity is fleet tag / bus number style unit label — shops think in tags first.',
      'VIN decode can fill year/make/model when adding.',
      'Units attach to a customer; invoices and service logs require customer + vehicle.',
    ].join('\n'),
  },
  {
    id: 'catalog',
    title: 'Catalog',
    area: 'catalog',
    pageKeys: ['catalog'],
    tags: ['catalog', 'parts', 'labor', 'fees', 'packages', 'rates', 'auto-sort', 'billed items'],
    summary: 'Billable catalog items, packages, and labor rates used when building invoice lines.',
    body: [
      'Page: /catalog',
      'Line types: part, labor, fee. Packages expand into multiple lines in invoice editor/wizard.',
      'Invoice description autocomplete searches catalog; keyword/verb rules in Control Panel help detect line types.',
      'Service-log sheet items can link to catalog ids but are sheet-local by default.',
      'Page actions (⋮ menu, managers): Audit catalog — wording mistakes, wrong part/labor types, missing categories, and duplicates; review then apply.',
      'Auto-sort categories — propose categories for uncategorized items via Catalog Detection keywords; review then apply.',
      'Find billed items — scan invoice lines for common free-text charges (side marks like R/S and L/S are stripped first), audit the list, and add selected rows to the catalog.',
    ].join('\n'),
  },
  {
    id: 'users-roles',
    title: 'Users, roles, and permissions',
    area: 'users',
    pageKeys: ['admin'],
    tags: ['users', 'roles', 'permissions', 'approve', 'susan account', 'super admin'],
    summary: 'Staff account types, signup approval, permission overrides; Susan system account is locked.',
    body: [
      'Pages: /users, /users/:id, /admin/roles.',
      'Account types: super_admin, admin, manager, accountant, mechanic, viewer, external_auditor, customer.',
      'Pending signups are approved/rejected on Users. Overrides allow/deny individual permission keys.',
      'Susan system email susan.ai@dorinc.system cannot be edited, deactivated, deleted, invited, or password-reset — even by admin.',
      'Super Admin accounts have extra protection on role/deactivation paths.',
    ].join('\n'),
  },
  {
    id: 'control-panel',
    title: 'Control Panel settings',
    area: 'admin',
    pageKeys: ['admin'],
    tags: ['control panel', 'settings', 'smtp', 'backup', 'ai', 'quo', 'business'],
    summary: 'Accordion settings for business, invoices, AI/Susan, email, Quo SMS, backup, security.',
    body: [
      'Page: /admin (Control Panel).',
      'Sections: Business, Invoices, Catalog Detection, Line Detection, Chat, Notifications, Email, Billing Integrations, Susan (AI), Import/Export, Backup & Restore, Security, Quo SMS.',
      'No .env for day-to-day app settings — configure in UI / Server Setup Wizard.',
      'Susan AI panel: enable features, models, spend caps, OpenRouter key test.',
      'Quo panel: SMS credentials, webhook, test send; staff can receive notifications by SMS and text Susan for help.',
    ].join('\n'),
  },
  {
    id: 'susan-help',
    title: 'Susan platform help (in-app + SMS)',
    area: 'ai',
    pageKeys: ['default', 'account', 'admin'],
    tags: ['susan', 'help', 'chat', 'sms', 'assistant', 'tool', 'knowledge'],
    summary: 'Susan answers how-to questions in-app and via SMS; SMS also has a YES-confirmed action menu (send invoice, send estimate, email).',
    body: [
      'In-app: floating Platform Assistant widget (staff layout). Uses POST /api/ai/help.',
      'SMS: staff with messageNotifyChannel=sms text the Quo number; susan-sms threads keep short history and call the same askPlatformHelp pipeline with channel=sms.',
      'Susan explains the product and can read invoices, service logs, customers, and catalog via tools when the staffer has permission.',
      'SMS also has a numbered action menu (text MENU): send/resend invoice, send estimate, email a customer or any address, plus the same lookups.',
      'Mutating SMS actions always preview first; staff reply YES to send or NO/CANCEL to stop. Web help stays read-only.',
      'Tools: get_app_knowledge, lookup_invoice, lookup_service_log, lookup_customer, search_catalog; SMS-only: list_sms_actions, send_invoice, send_estimate, send_email (permission-filtered).',
      'Invoice lookup: INV-000713 / invoice 713; unpaid|overdue|stats for KPIs. SL lookup: SL-0713 or review queue.',
      'On invoice/service-log/customer detail pages, Current record id is sent so Susan can answer about “this” record.',
      'Other Susan roles: daily summary notes, AI Administrator deletion reviews — not the help chat.',
      'If AI is disabled or spend-capped, built-in keyword FAQ fallback answers are used.',
    ].join('\n'),
  },
  {
    id: 'messages',
    title: 'Messages / team chat',
    area: 'messages',
    pageKeys: ['default'],
    tags: ['messages', 'chat', 'dm', 'team'],
    summary: 'Internal staff messaging (team + DM), separate from Susan help and customer email.',
    body: [
      'Page: /messages',
      'Conversation kinds include team chat and direct messages. Not customer portal chat.',
      'Notification preferences (email vs SMS) live on Account / user notify settings.',
      'Susan help chat is separate from Messages.',
    ].join('\n'),
  },
  {
    id: 'templates',
    title: 'Templates (invoice, email, SMS)',
    area: 'templates',
    pageKeys: ['designer'],
    tags: ['templates', 'pdf', 'email template', 'sms template', 'designer'],
    summary: 'Invoice PDF designer plus outbound email and SMS template editors.',
    body: [
      'Invoice designer: /templates/designer — layout for official invoice PDFs.',
      'Email templates: Control Panel → Notifications / email template editor; activate overrides system defaults.',
      'SMS templates: catalog-driven types for Quo outbound notifications; activate/deactivate/reset from admin APIs/UI.',
      'Changing templates affects future sends/PDFs, not historical locked PDFs unless regenerated per product rules.',
    ].join('\n'),
  },
  {
    id: 'portal',
    title: 'Customer portal',
    area: 'portal',
    pageKeys: ['customers'],
    tags: ['portal', 'customer portal', 'requests', 'estimates'],
    summary: 'Customer-facing area for invoices, vehicles, estimates, and change requests.',
    body: [
      'Routes under /portal/* for customer accounts only.',
      'Customers view own invoices/vehicles/estimates and submit portal requests (service, invoice change, vehicle change, documents, general, new vehicle).',
      'Staff review portal requests under Portal Requests.',
      'Credential emails grant/reset portal login; customers never see internal notes.',
    ].join('\n'),
  },
  {
    id: 'billing-integrations',
    title: 'Billing integrations & credentials',
    area: 'billing',
    pageKeys: ['admin'],
    tags: ['billing', 'openrouter', 'vultr', 'cloudflare', 'quo', 'api key'],
    summary: 'Store and test third-party credentials used by AI, hosting, and SMS.',
    body: [
      'Page: /billing and Control Panel → Billing Integrations / Quo.',
      'OpenRouter powers Susan features. Quo powers SMS notifications and Susan SMS help.',
      'Keys are encrypted at rest; reveal/test actions are audited and rate-limited.',
      'Spend caps for AI live under Susan AI settings.',
    ].join('\n'),
  },
  {
    id: 'backup-security',
    title: 'Backup, security, and system logs',
    area: 'admin',
    pageKeys: ['admin', 'audit'],
    tags: ['backup', 'restore', 'security', 'audit', 'system logs', 'access gate'],
    summary: 'Encrypted backups, access-gate/geo security, and platform audit log.',
    body: [
      'Backup & Restore in Control Panel: manual/scheduled encrypted archives, optional Google Drive.',
      'Security: access gate, outside-geo verification, suspicious activity alerts.',
      'System Logs (/system-logs): settings changes, role updates, backups, security events.',
      'Per-record history (invoice/customer/vehicle) stays on each detail page.',
    ].join('\n'),
  },
  {
    id: 'announcements',
    title: 'Announcements',
    area: 'announcements',
    pageKeys: ['default'],
    tags: ['announcements', 'required', 'login messages'],
    summary: 'Required login messages that can gate staff until acknowledged.',
    body: [
      'Announcements: admin create/list under Login Messages; required announcements can gate staff until acknowledged.',
      'Staff land on /announcements/required when a message is pending.',
    ].join('\n'),
  },
  {
    id: 'staples-print',
    title: 'Staples PrintMe',
    area: 'staples',
    pageKeys: ['invoices'],
    tags: ['staples', 'printme', 'print'],
    summary: 'Optional Staples PrintMe flow for sending invoice PDFs to print.',
    body: [
      'Staff Staples area / invoice actions can attach invoice PDFs for PrintMe email workflows when enabled.',
      'Requires appropriate staples/print permissions. Not related to Susan help SMS.',
    ].join('\n'),
  },
  {
    id: 'account',
    title: 'My Account',
    area: 'account',
    pageKeys: ['account'],
    tags: ['account', 'password', 'sessions', 'notifications', 'sms notify'],
    summary: 'Profile, password, sessions, and notification channel preferences.',
    body: [
      'Page: /account',
      'Update name/profile, change password, review sessions, choose email vs SMS notification channel.',
      'SMS notifications require a valid phone and Quo configured; choosing SMS also enables texting Susan for platform help.',
    ].join('\n'),
  },
]

function tokenize(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length >= 2)
}

function scoreDoc(doc: AppKnowledgeDoc, queryTokens: string[], pageContext?: string): number {
  if (!queryTokens.length && !pageContext) return 0
  const hay = tokenize([
    doc.id,
    doc.title,
    doc.area,
    doc.summary,
    doc.tags.join(' '),
    doc.pageKeys.join(' '),
    doc.body,
  ].join(' '))
  const haySet = new Set(hay)
  let score = 0
  for (const token of queryTokens) {
    if (haySet.has(token)) score += 3
    else if (hay.some(h => h.includes(token) || token.includes(h))) score += 1
  }
  // Prefer title/tag hits
  const titleTokens = new Set(tokenize(`${doc.title} ${doc.tags.join(' ')}`))
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 4
  }
  const page = String(pageContext ?? '').trim().toLowerCase()
  if (page && doc.pageKeys.some(k => k.toLowerCase() === page)) score += 8
  if (page && doc.area.toLowerCase() === page) score += 3
  return score
}

export interface AppKnowledgeHit {
  id: string
  title: string
  area: string
  pageKeys: string[]
  summary: string
  body: string
  score: number
}

function toHit(doc: AppKnowledgeDoc, score: number): AppKnowledgeHit {
  return {
    id: doc.id,
    title: doc.title,
    area: doc.area,
    pageKeys: doc.pageKeys,
    summary: doc.summary,
    body: doc.body,
    score,
  }
}

export function searchAppKnowledge(input: {
  query?: string | null
  pageContext?: string | null
  area?: string | null
  limit?: number
}): AppKnowledgeHit[] {
  const queryTokens = tokenize(String(input.query ?? ''))
  const limit = Math.min(8, Math.max(1, Number(input.limit) || 3))
  const areaFilter = String(input.area ?? '').trim().toLowerCase()
  const scoped = APP_KNOWLEDGE_DOCS.filter(
    doc => !areaFilter || doc.area.toLowerCase() === areaFilter || doc.id.toLowerCase() === areaFilter,
  )

  // Area-only lookup: return docs in that area (or id match).
  if (!queryTokens.length && areaFilter) {
    return scoped.slice(0, limit).map(doc => toHit(doc, 1))
  }

  const ranked = scoped
    .map(doc => toHit(doc, scoreDoc(doc, queryTokens, input.pageContext ?? undefined)))
    .filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  if (ranked.length) return ranked.slice(0, limit)

  // Soft fallback: pageContext-only or first overview docs
  if (input.pageContext) {
    const byPage = APP_KNOWLEDGE_DOCS.filter(d =>
      d.pageKeys.some(k => k.toLowerCase() === String(input.pageContext).toLowerCase()),
    )
    if (byPage.length) {
      return byPage.slice(0, limit).map(doc => toHit(doc, 1))
    }
  }

  if (areaFilter && scoped.length) {
    return scoped.slice(0, limit).map(doc => toHit(doc, 0))
  }

  return APP_KNOWLEDGE_DOCS.slice(0, Math.min(limit, 2)).map(doc => toHit(doc, 0))
}

export function listAppKnowledgeAreas(): Array<{ area: string, title: string }> {
  const byArea = new Map<string, string>()
  for (const doc of APP_KNOWLEDGE_DOCS) {
    if (!byArea.has(doc.area)) byArea.set(doc.area, doc.title)
  }
  return [...byArea.entries()]
    .map(([area, title]) => ({ area, title }))
    .sort((a, b) => a.area.localeCompare(b.area))
}

export function formatAppKnowledgeForTool(
  hits: AppKnowledgeHit[],
  detail: 'summary' | 'full' = 'full',
): string {
  if (!hits.length) {
    return 'No matching application knowledge documents were found.'
  }
  return hits.map((hit, index) => {
    const head = `### ${index + 1}. ${hit.title} (${hit.area})\nSummary: ${hit.summary}`
    if (detail === 'summary') return head
    return `${head}\n${hit.body}`
  }).join('\n\n')
}
