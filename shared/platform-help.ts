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
  { keys: ['create', 'new invoice', 'wizard'], text: '<p>To create an invoice:</p><ol><li>Go to <b>Invoices → New Invoice</b> or click <b>+ New Invoice</b> on the dashboard.</li><li>Choose customer and vehicle, then add line items.</li><li>Review totals and click <b>Save draft</b> or <b>Finalize &amp; send</b>.</li></ol>' },
  { keys: ['add customer', 'create customer', 'new customer'], text: '<p>I cannot add customers for you, but you can in the UI:</p><ol><li>Open <b>Customers</b> from the left navigation.</li><li>Click <b>New Customer</b> (or <b>Add Customer</b>).</li><li>Complete the required fields (name, contact info, billing/shipping, payment terms, price list).</li><li>Click <b>Save</b>.</li></ol>' },
  { keys: ['finalize', 'send', 'lock'], text: '<b>Finalize & send</b> locks the invoice, generates the official PDF, and notifies the customer by email and portal. After finalize, line totals cannot be edited without creating a revision.' },
  { keys: ['draft', 'save'], text: 'Drafts can be saved at any wizard step or from the Invoice Editor. Saving assigns an invoice number and updates totals. Find drafts in <b>Invoices</b> with the Draft status filter.' },
  { keys: ['payment', 'record', 'balance'], text: 'Open the invoice detail page and click <b>Record payment</b>. Enter amount, method, and date. Amounts over the open balance are rejected.' },
  { keys: ['pdf', 'template'], text: 'Official PDFs use your active invoice template. Customize layout in <b>Control Panel → Template Designer</b>. Customers can download PDFs from the portal; staff can email them from the invoice page.' },
  { keys: ['email template', 'email templates'], text: 'Edit outbound email copy in <b>Administration → Email Templates</b> (also linked from <b>Control Panel → Notifications</b>). Save a template, then set it active to override the system default.' },
  { keys: ['portal', 'customer', 'credential'], text: 'Enable portal access per customer in their detail page. <b>Credential emails</b> are sent manually from the customer menu (logged every time). Customers see only their invoices, vehicles, and can submit requests.' },
  { keys: ['service log', 'upload', 'review'], text: 'Mechanics upload logs from <b>Service Logs</b>. Accountants review the queue, optionally approve AI-extracted line items, then create an invoice from the log.' },
  { keys: ['description assist', 'ai line'], text: '<b>Line item audit</b> runs when you save an invoice. Review any suggested fixes to description, qty, or rate before the save completes.' },
  { keys: ['role', 'permission', 'accountant', 'mechanic', 'admin'], text: 'Account types: <b>Super Admin</b> (full system), <b>Accountant</b> (billing + approvals), <b>Mechanic</b> (vehicles + logs), <b>Customer</b> (portal only), <b>Viewer</b> (read-only). Permissions are enforced on every action.' },
  { keys: ['vehicle', 'tag', 'vin'], text: 'Vehicles are listed by <b>fleet tag</b> first because that is how shops think about fleet assets. VIN decode auto-fills year/make when you add a vehicle.' },
  { keys: ['moderation', 'approve', 'signup', 'pending'], text: 'The <b>Users</b> page shows pending signups. Approve or reject — every action writes an audit entry.' },
  { keys: ['env', 'setup', 'smtp', 'database', 'control panel'], text: 'DORINC is configured in the UI — no .env secrets for app settings. Use <b>Control Panel</b> or the <b>Server setup wizard</b> for database, SMTP, encryption, PDF worker, backup, and AI credentials.' },
  { keys: ['audit', 'log', 'system logs'], text: 'Platform-wide events live in <b>System Logs</b> — settings changes, role updates, backups, and security events. <b>Invoice, customer, and vehicle change history</b> is on each record detail page.' },
  { keys: ['overdue', 'reminder'], text: 'An invoice becomes <b>overdue</b> when past its due date with an open balance. Use <b>Send</b> on the invoice detail page to email the customer.' },
  { keys: ['backup', 'restore'], text: 'Encrypted backups can be run manually from <b>Control Panel → Backup</b>. Configure schedule and Google Drive from the control panel.' },
]

const DEFAULT_FALLBACK = 'I can help with invoices, service logs, roles, PDFs, the customer portal, and system setup. Ask about a specific page or workflow you are working on.'

const ALLOWED_HELP_TAG_NAMES = new Set(['b', 'strong', 'ol', 'ul', 'li', 'p', 'br', 'small', 'h4', 'h3', 'em'])

const HELP_SECTION_TITLE = /^(Steps|Tips|What I see|Quick answer|Notes)$/i

function groupParagraphsUnderSection(
  html: string,
  section: string,
  listClass: string,
  tag: 'ol' | 'ul',
): string {
  const re = new RegExp(
    `(<h4 class="help-section">${section}<\\/h4>)([\\s\\S]*?)(?=<h4 class="help-section">|$)`,
    'i',
  )
  return html.replace(re, (_, header: string, body: string) => {
    if (new RegExp(`<${tag}[\\s>]`, 'i').test(body)) {
      return header + body.replace(
        new RegExp(`<${tag}`, 'i'),
        `<${tag} class="${listClass}"`,
      )
    }
    const paragraphs = [...body.matchAll(/<p(?: class="help-lead")?>([\s\S]*?)<\/p>/gi)]
    if (!paragraphs.length) return header + body
    const items = paragraphs.map(m => `<li>${m[1]!.trim()}</li>`).join('')
    const rest = body.replace(/<p(?: class="help-lead")?>([\s\S]*?)<\/p>/gi, '').trim()
    return `${header}<${tag} class="${listClass}">${items}</${tag}>${rest}`
  })
}

function addListClasses(html: string): string {
  return html
    .replace(/<ol(?![^>]*class=)/gi, '<ol class="help-steps"')
    .replace(/<ul(?![^>]*class=)/gi, '<ul class="help-tips"')
}

/** Convert numbered paragraph lines (e.g. <p>1. Go to…</p>) into list items under Steps. */
function convertNumberedParagraphs(html: string): string {
  return html.replace(
    /(<h4 class="help-section">Steps<\/h4>)([\s\S]*?)(?=<h4 class="help-section">|$)/i,
    (_, header: string, body: string) => {
      if (/<ol[\s>]/i.test(body)) return header + body
      const converted = body.replace(
        /<p(?: class="help-lead")?>\s*\d+[.)]\s*([\s\S]*?)<\/p>/gi,
        (_m, item: string) => `<li>${item.trim()}</li>`,
      )
      if (!/<li>/i.test(converted)) return header + body
      const items = [...converted.matchAll(/<li>[\s\S]*?<\/li>/gi)].map(m => m[0]).join('')
      const rest = converted.replace(/<li>[\s\S]*?<\/li>/gi, '').trim()
      return `${header}<ol class="help-steps">${items}</ol>${rest}`
    },
  )
}

/** Turn loose paragraphs under Steps/Tips headers into styled lists. */
export function structureHelpSections(html: string): string {
  let out = html.replace(
    /<p>\s*(Steps|Tips|What I see|Quick answer|Notes)\s*:?\s*<\/p>/gi,
    '<h4 class="help-section">$1</h4>',
  )
  out = out.replace(
    /<h4(?: class="help-section")?>(Steps|Tips|What I see|Quick answer|Notes)\s*:?\s*<\/h4>/gi,
    '<h4 class="help-section">$1</h4>',
  )
  out = out.replace(
    /<p>\s*<b>(Steps|Tips|What I see|Quick answer|Notes)<\/b>\s*:?\s*<\/p>/gi,
    '<h4 class="help-section">$1</h4>',
  )
  out = groupParagraphsUnderSection(out, 'Steps', 'help-steps', 'ol')
  out = groupParagraphsUnderSection(out, 'Tips', 'help-tips', 'ul')
  out = groupParagraphsUnderSection(out, 'What I see', 'help-tips', 'ul')
  out = convertNumberedParagraphs(out)
  out = addListClasses(out)
  if (!out.includes('help-lead') && !out.includes('help-section')) {
    return out
  }
  out = out.replace(/^\s*<p>(?![^<]*class="help-lead")([\s\S]*?)<\/p>/, '<p class="help-lead">$1</p>')
  return out
}

/** Normalize AI/fallback help answers into clean, safe HTML with numbered steps. */
export function formatPlatformHelpHtml(raw: string): string {
  let text = raw.trim()
  if (!text) return ''

  // Drop truncated HTML tags (common when max_tokens cuts off mid-response).
  text = text.replace(/<[^>]*$/, '')

  // Plain-text responses → HTML blocks.
  if (!/<[a-z][\s>]/i.test(text)) {
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
    const parts: string[] = []
    let stepLines: string[] = []
    let tipLines: string[] = []
    let mode: 'intro' | 'steps' | 'tips' | 'body' = 'intro'

    const flushSteps = () => {
      if (!stepLines.length) return
      parts.push(`<ol class="help-steps">${stepLines.map(l => `<li>${l}</li>`).join('')}</ol>`)
      stepLines = []
    }
    const flushTips = () => {
      if (!tipLines.length) return
      parts.push(`<ul class="help-tips">${tipLines.map(l => `<li>${l}</li>`).join('')}</ul>`)
      tipLines = []
    }

    for (const line of lines) {
      const mdHeading = line.match(/^#{1,4}\s+(.+)$/)
      if (mdHeading) {
        flushSteps()
        flushTips()
        const title = mdHeading[1]!.trim().replace(/:$/, '')
        parts.push(`<h4 class="help-section">${title}</h4>`)
        mode = /^tips$/i.test(title) ? 'tips' : /^steps$/i.test(title) ? 'steps' : 'body'
        continue
      }
      if (HELP_SECTION_TITLE.test(line.replace(/:$/, ''))) {
        flushSteps()
        flushTips()
        const title = line.replace(/:$/, '')
        parts.push(`<h4 class="help-section">${title}</h4>`)
        mode = /^tips$/i.test(title) ? 'tips' : /^steps$/i.test(title) ? 'steps' : 'body'
        continue
      }
      const numbered = line.match(/^\d+[.)]\s+(.*)$/)
      if (numbered) {
        flushTips()
        mode = 'steps'
        stepLines.push(numbered[1]!.trim())
        continue
      }
      const bullet = line.match(/^[-*•]\s+(.*)$/)
      if (bullet) {
        flushSteps()
        mode = 'tips'
        tipLines.push(bullet[1]!.trim())
        continue
      }
      if (mode === 'steps') {
        stepLines.push(line)
        continue
      }
      if (mode === 'tips') {
        tipLines.push(line)
        continue
      }
      flushSteps()
      flushTips()
      const cls = parts.length === 0 ? 'help-lead' : ''
      parts.push(cls ? `<p class="${cls}">${line}</p>` : `<p>${line}</p>`)
      mode = 'body'
    }
    flushSteps()
    flushTips()
    text = parts.join('')
  }

  // Markdown headings → section headers.
  text = text.replace(/^#{1,4}\s+(.+)$/gm, (_, title: string) => `<h4 class="help-section">${title.trim()}</h4>`)
  text = text.replace(/^\*\*(.+?)\*\*\s*$/gm, (_, title: string) => `<h4 class="help-section">${title.trim()}</h4>`)

  // Convert markdown-style numbered steps to an ordered list.
  if (!/<ol[\s>]/i.test(text) && /^\s*\d+\.\s+/m.test(text)) {
    const lines = text.split(/\n+/)
    const parts: string[] = []
    let inList = false
    for (const line of lines) {
      const step = line.match(/^\s*\d+\.\s+(.*)$/)
      if (step) {
        if (!inList) {
          parts.push('<ol class="help-steps">')
          inList = true
        }
        parts.push(`<li>${step[1]!.trim()}</li>`)
      }
      else {
        if (inList) {
          parts.push('</ol>')
          inList = false
        }
        const trimmed = line.trim()
        if (trimmed) parts.push(`<p>${trimmed}</p>`)
      }
    }
    if (inList) parts.push('</ol>')
    text = parts.join('')
  }

  // Convert markdown bullet lists when no HTML list present.
  if (!/<ul[\s>]/i.test(text) && /^\s*[-*•]\s+/m.test(text)) {
    const lines = text.split(/\n+/)
    const parts: string[] = []
    let inList = false
    for (const line of lines) {
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
      if (bullet) {
        if (!inList) {
          parts.push('<ul class="help-tips">')
          inList = true
        }
        parts.push(`<li>${bullet[1]!.trim()}</li>`)
      }
      else {
        if (inList) {
          parts.push('</ul>')
          inList = false
        }
        const trimmed = line.trim()
        if (trimmed && !/^<\/?(?:p|ol|ul|li)/i.test(trimmed)) parts.push(`<p>${trimmed}</p>`)
        else if (trimmed) parts.push(trimmed)
      }
    }
    if (inList) parts.push('</ul>')
    text = parts.join('')
  }

  text = text.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (match, name: string) =>
    ALLOWED_HELP_TAG_NAMES.has(name.toLowerCase()) ? match : '',
  )

  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = structureHelpSections(text)
  return text.trim()
}

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

/** Apply list formatting to fallback answers for consistent chat rendering. */
export function formatPlatformHelpAnswer(raw: string): string {
  return formatPlatformHelpHtml(raw)
}

export function helpSuggestionsForPage(pageKey: string): string[] {
  return HELP_SUGGESTIONS[pageKey] ?? HELP_SUGGESTIONS.default!
}

export function helpContextLabel(pageKey: string): string {
  const label = HELP_PAGE_LABELS[pageKey] ?? pageKey.replace(/-/g, ' ')
  return `Viewing · ${label}`
}
