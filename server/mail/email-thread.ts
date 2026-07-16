import { randomUUID } from 'node:crypto'
import { formatPersonNameShort } from '../../shared/format/person-name'
import { resolveEmailBrand } from '../services/email-branding.service'
import type { Db } from '../db/client'

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
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px;">
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
  ${line}<br>
  ${contact}
</p>`
}

export async function buildOutboundEmailBodies(
  db: Db,
  staffName: string,
  bodyText: string,
): Promise<{ text: string, html: string }> {
  const brand = await resolveEmailBrand(db)
  const textFooter = buildStaffEmailFooter(staffName, brand.brandLegal)
  const htmlFooter = buildStaffEmailHtmlFooter(staffName, brand)
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return {
    text: `${bodyText.trim()}${textFooter}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;"><p style="margin:0;">${escaped}</p>${htmlFooter}</div>`,
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
