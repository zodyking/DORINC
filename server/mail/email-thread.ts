import { randomUUID } from 'node:crypto'
import { formatPersonNameShort } from '../../shared/format/person-name'
import { resolveEmailBrand } from '../services/email-branding.service'
import type { Db } from '../db/client'
import { escapeHtml, wrapEmailHtml } from './email-layout'

export function buildStaffEmailFooter(staffName: string, brandLegal: string): string {
  const short = formatPersonNameShort(staffName)
  const line = short ? `${short} · ${brandLegal}` : brandLegal
  return `\n\n—\n${line}`
}

export function buildStaffEmailHtmlFooter(staffName: string, brand: Awaited<ReturnType<typeof resolveEmailBrand>>): string {
  const short = formatPersonNameShort(staffName)
  const sender = short || brand.brandName
  const contactLinks = [
    brand.phone
      ? `<a href="tel:${escapeHtml(brand.phone.replace(/\D/g, ''))}" style="color:#64748b;text-decoration:none;">${escapeHtml(brand.phone)}</a>`
      : '',
    brand.email
      ? `<a href="mailto:${escapeHtml(brand.email)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(brand.email)}</a>`
      : '',
    brand.website
      ? `<a href="${escapeHtml(brand.website)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(brand.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`
      : '',
  ].filter(Boolean).join('<span style="color:#cbd5e1;"> &nbsp;·&nbsp; </span>')

  return `
<table role="presentation" width="100%" style="margin-top:32px;border-top:1px solid #e5e7eb;">
  <tr>
    <td style="padding-top:20px;">
      <table role="presentation">
        <tr>
          <td style="width:3px;background:#4f46e5;border-radius:3px;"></td>
          <td style="padding-left:14px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:14px;font-weight:700;line-height:20px;color:#111827;">${escapeHtml(sender)}</div>
            <div style="padding-top:2px;font-size:12px;line-height:18px;color:#64748b;">${escapeHtml(brand.brandLegal)}</div>
            ${contactLinks ? `<div style="padding-top:7px;font-size:12px;line-height:20px;">${contactLinks}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
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
  const messageHtml = `<div style="color:#334155;font-size:16px;line-height:27px;font-family:Arial,Helvetica,sans-serif;word-break:break-word;">${escapeHtml(trimmed).replace(/\n/g, '<br>')}</div>`
  const signatureHtml = buildStaffEmailHtmlFooter(staffName, brand)

  const html = wrapEmailHtml({
    appUrl: brand.appUrl,
    brand,
    preheader: trimmed.slice(0, 120),
    bodyHtml: `${messageHtml}${signatureHtml}`,
    headerBadge: 'Message',
    footerNote: null,
    footerLinks: false,
    footerAddress: false,
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
