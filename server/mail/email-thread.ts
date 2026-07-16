import { randomUUID } from 'node:crypto'
import { formatPersonNameShort } from '../../shared/format/person-name'
import { resolveEmailBrand } from '../services/email-branding.service'
import type { Db } from '../db/client'
import { emailParagraph, escapeHtml, wrapEmailHtml } from './email-layout'

export function buildStaffEmailFooter(staffName: string, brandLegal: string): string {
  const short = formatPersonNameShort(staffName)
  const line = short ? `${short} · ${brandLegal}` : brandLegal
  return `\n\n—\n${line}`
}

export function buildStaffEmailHtmlFooter(staffName: string, brand: Awaited<ReturnType<typeof resolveEmailBrand>>): string {
  const short = formatPersonNameShort(staffName)
  const line = short ? `${short} · ${brand.brandLegal}` : brand.brandLegal
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')
  return `
<table role="presentation" width="100%" style="margin-top:24px;border-top:1px solid #e5e7eb;">
  <tr><td style="padding-top:16px;font-size:13px;color:#64748b;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
    <strong style="color:#374151;">${escapeHtml(line)}</strong><br>
    ${escapeHtml(contact)}
  </td></tr>
</table>`
}

export async function buildOutboundEmailBodies(
  db: Db,
  staffName: string,
  bodyText: string,
): Promise<{ text: string, html: string }> {
  const brand = await resolveEmailBrand(db)
  const trimmed = bodyText.trim()
  const textFooter = buildStaffEmailFooter(staffName, brand.brandLegal)
  const messageHtml = emailParagraph(escapeHtml(trimmed).replace(/\n/g, '<br>'))
  const signatureHtml = buildStaffEmailHtmlFooter(staffName, brand)

  const html = wrapEmailHtml({
    appUrl: brand.appUrl,
    brand,
    preheader: trimmed.slice(0, 120),
    bodyHtml: `${messageHtml}${signatureHtml}`,
    headerBadge: 'Message',
    footerNote: null,
    footerLinks: false,
  })

  return {
    text: `${trimmed}${textFooter}`,
    html,
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
