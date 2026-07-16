import { randomUUID } from 'node:crypto'
import { formatPersonNameShort } from '../../shared/format/person-name'
import { resolveEmailBrand, type EmailBrandContext } from '../services/email-branding.service'
import type { Db } from '../db/client'
import { EMAIL_TOKENS, escapeHtml, wrapEmailHtml } from './email-layout'

/** Customer-facing tagline — never expose the internal "Accounting workspace" label. */
export const CUSTOMER_EMAIL_TAGLINE = 'Onsite repairs'

export function toCustomerEmailBrand(brand: EmailBrandContext): EmailBrandContext {
  return {
    ...brand,
    brandTagline: CUSTOMER_EMAIL_TAGLINE,
  }
}

export function buildStaffEmailFooter(staffName: string, brandLegal: string): string {
  const short = formatPersonNameShort(staffName)
  const line = short ? `${short} · ${brandLegal}` : brandLegal
  return `\n\n—\n${line}`
}

function contactLinkHtml(brand: EmailBrandContext): string {
  const parts: string[] = []
  if (brand.phone) {
    const tel = brand.phone.replace(/[^\d+]/g, '')
    parts.push(
      tel
        ? `<a href="tel:${escapeHtml(tel)}" style="color:${EMAIL_TOKENS.accent};text-decoration:none;">${escapeHtml(brand.phone)}</a>`
        : escapeHtml(brand.phone),
    )
  }
  if (brand.email) {
    parts.push(
      `<a href="mailto:${escapeHtml(brand.email)}" style="color:${EMAIL_TOKENS.accent};text-decoration:none;">${escapeHtml(brand.email)}</a>`,
    )
  }
  if (brand.website) {
    const href = /^https?:\/\//i.test(brand.website) ? brand.website : `https://${brand.website}`
    parts.push(
      `<a href="${escapeHtml(href)}" style="color:${EMAIL_TOKENS.accent};text-decoration:none;">${escapeHtml(brand.website.replace(/^https?:\/\//i, ''))}</a>`,
    )
  }
  return parts.join(
    `<span style="color:${EMAIL_TOKENS.faint};padding:0 6px;">·</span>`,
  )
}

export function buildStaffEmailHtmlFooter(staffName: string, brand: EmailBrandContext): string {
  const short = formatPersonNameShort(staffName) || staffName.trim() || brand.brandName
  const initial = escapeHtml((short.charAt(0) || brand.logoInitial || 'D').toUpperCase())
  const contact = contactLinkHtml(brand)

  return `
<table role="presentation" width="100%" style="margin-top:28px;border-collapse:separate;">
  <tr>
    <td style="padding:0;">
      <table role="presentation" width="100%" style="border:1px solid ${EMAIL_TOKENS.border};border-radius:12px;background:#f8fafc;">
        <tr>
          <td style="padding:18px 20px;">
            <table role="presentation" width="100%">
              <tr>
                <td valign="top" style="width:44px;">
                  <div style="width:44px;height:44px;border-radius:999px;background:${EMAIL_TOKENS.accent};color:#ffffff;font-size:16px;font-weight:700;line-height:44px;text-align:center;font-family:${EMAIL_TOKENS.font};">
                    ${initial}
                  </div>
                </td>
                <td valign="middle" style="padding-left:14px;font-family:${EMAIL_TOKENS.font};">
                  <div style="color:${EMAIL_TOKENS.ink};font-size:15px;font-weight:700;line-height:20px;">
                    ${escapeHtml(short)}
                  </div>
                  <div style="color:${EMAIL_TOKENS.muted};font-size:13px;line-height:18px;padding-top:2px;">
                    ${escapeHtml(brand.brandLegal)}
                  </div>
                  ${contact
                    ? `<div style="color:${EMAIL_TOKENS.muted};font-size:13px;line-height:20px;padding-top:8px;">${contact}</div>`
                    : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
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

export async function buildOutboundEmailBodies(
  db: Db,
  staffName: string,
  bodyText: string,
): Promise<{ text: string, html: string, brand: EmailBrandContext }> {
  const brand = toCustomerEmailBrand(await resolveEmailBrand(db))
  const trimmed = bodyText.trim()
  const textFooter = buildStaffEmailFooter(staffName, brand.brandLegal)
  const messageHtml = buildMessageBodyHtml(trimmed)
  const signatureHtml = buildStaffEmailHtmlFooter(staffName, brand)

  const html = wrapEmailHtml({
    appUrl: brand.appUrl,
    brand,
    title: brand.brandName,
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
