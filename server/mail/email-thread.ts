import { randomUUID } from 'node:crypto'
import { formatPersonNameShort } from '../../shared/format/person-name'
import { signatureAccountTypeLabel } from '../../shared/format/account-type-label'
import { resolveEmailBrand, type EmailBrandContext } from '../services/email-branding.service'
import type { Db } from '../db/client'
import { EMAIL_TOKENS, escapeHtml, wrapEmailHtml } from './email-layout'

/**
 * Fallback header subheading for outbound customer mail when no subject is
 * available. Kept short and descriptive — the subject line is preferred.
 */
export const CUSTOMER_EMAIL_TAGLINE = 'Fleet & onsite repair services'

export function toCustomerEmailBrand(brand: EmailBrandContext): EmailBrandContext {
  return {
    ...brand,
    brandTagline: CUSTOMER_EMAIL_TAGLINE,
  }
}

/** Plain-text sign-off: bold-style dash name on its own line, role beneath it. */
export function buildStaffEmailFooter(staffName: string, accountTypeLabel: string): string {
  const short = formatPersonNameShort(staffName) || staffName.trim()
  const nameLine = short ? `— ${short}` : '—'
  return accountTypeLabel ? `\n\n${nameLine}\n${accountTypeLabel}` : `\n\n${nameLine}`
}

/**
 * HTML sign-off appended to the message body: a bold "— First L." line with the
 * sender's account type underneath. Company contact details already live in the
 * shared email footer, so they are intentionally omitted here.
 */
export function buildStaffEmailSignature(staffName: string, accountTypeLabel: string): string {
  const short = formatPersonNameShort(staffName) || staffName.trim()
  const nameLine = short ? `— ${escapeHtml(short)}` : '—'
  const roleLine = accountTypeLabel
    ? `<div style="margin-top:2px;color:${EMAIL_TOKENS.muted};font-size:13px;line-height:18px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(accountTypeLabel)}</div>`
    : ''

  return `
<div style="margin-top:24px;font-family:${EMAIL_TOKENS.font};">
  <div style="color:${EMAIL_TOKENS.ink};font-size:15px;font-weight:700;line-height:20px;">${nameLine}</div>
  ${roleLine}
</div>`
}

function buildMessageBodyHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  if (!paragraphs.length) {
    return `<p style="margin:0;color:${EMAIL_TOKENS.ink};font-size:16px;line-height:26px;font-family:${EMAIL_TOKENS.font};"></p>`
  }

  return paragraphs.map((paragraph, index) => {
    const html = escapeHtml(paragraph).replace(/\n/g, '<br>')
    const margin = index === paragraphs.length - 1 ? '0' : '0 0 16px'
    return `<p style="margin:${margin};color:${EMAIL_TOKENS.ink};font-size:16px;line-height:26px;font-family:${EMAIL_TOKENS.font};">${html}</p>`
  }).join('')
}

export interface OutboundEmailInput {
  staffName: string
  /** Internal account-type key of the sender (admin, manager, …). */
  accountTypeKey?: string | null
  bodyText: string
  /** Email subject — shown as the header subheading (more relevant than a tagline). */
  subject?: string
}

export async function buildOutboundEmailBodies(
  db: Db,
  input: OutboundEmailInput,
): Promise<{ text: string, html: string, brand: EmailBrandContext }> {
  const resolved = toCustomerEmailBrand(await resolveEmailBrand(db))
  const subheading = input.subject?.trim()
  const brand: EmailBrandContext = subheading
    ? { ...resolved, brandTagline: subheading }
    : resolved

  const trimmed = input.bodyText.trim()
  const accountTypeLabel = signatureAccountTypeLabel(input.accountTypeKey)
  const textFooter = buildStaffEmailFooter(input.staffName, accountTypeLabel)
  const messageHtml = buildMessageBodyHtml(trimmed)
  const signatureHtml = buildStaffEmailSignature(input.staffName, accountTypeLabel)

  const html = wrapEmailHtml({
    appUrl: brand.appUrl,
    brand,
    // Omit title/headline so the message body is the focus (not a repeated brand H1).
    preheader: trimmed.slice(0, 120),
    bodyHtml: `${messageHtml}${signatureHtml}`,
    headerBadge: '',
    footerNote: null,
    footerLinks: false,
  })

  return {
    text: `${trimmed}${textFooter}`,
    html,
    brand,
  }
}

export function generateInternetMessageId(domain = 'dorinc.local'): string {
  return `<${randomUUID()}@${domain}>`
}

export function normalizeEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/)
  return (match?.[1] ?? raw).trim().toLowerCase()
}

export function extractEmailAddresses(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.flatMap(item => item.split(',')).map(normalizeEmailAddress).filter(Boolean)
}

export function subjectWithRePrefix(subject: string): string {
  const trimmed = subject.trim()
  if (/^re:/i.test(trimmed)) return trimmed
  return `Re: ${trimmed}`
}

export function buildReferences(existing: string | null | undefined, parentId: string | null | undefined): string | null {
  const parts = (existing ?? '').split(/\s+/).filter(Boolean)
  if (parentId && !parts.includes(parentId)) parts.push(parentId)
  return parts.length ? parts.join(' ') : null
}
