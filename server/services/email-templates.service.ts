import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { emailTemplates } from '../db/schema/email-templates'
import {
  EMAIL_TEMPLATE_CATALOG,
  applyEmailTemplateContent,
  getEmailTemplateDefinition,
  hasEmailTemplateHtmlSource,
  normalizeEmailTemplateContent,
  type EmailTemplateContent,
} from '../../shared/email-template-catalog'
import { buildStyledEmail } from '../mail/email-layout'
import { interpolateEmailTemplate } from '../mail/email-template-override.mjs'
import { getAppUrl } from './app-config.service'
import { resolveEmailBrand } from './email-branding.service'

export type EmailTemplatesServiceErrorCode
  = 'NOT_FOUND'
    | 'INVALID_TYPE'
    | 'VALIDATION'

export class EmailTemplatesServiceError extends Error {
  constructor(public readonly code: EmailTemplatesServiceErrorCode) {
    super(code)
  }
}

function contentEquals(a: EmailTemplateContent, b: EmailTemplateContent) {
  return JSON.stringify(normalizeEmailTemplateContent(a, a))
    === JSON.stringify(normalizeEmailTemplateContent(b, b))
}

export async function ensureEmailTemplatesSeeded(db: Db) {
  for (const def of EMAIL_TEMPLATE_CATALOG) {
    const [existing] = await db.select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(eq(emailTemplates.typeKey, def.typeKey))
      .limit(1)
    if (existing) continue
    await db.insert(emailTemplates).values({
      typeKey: def.typeKey,
      name: def.name,
      isActive: false,
      content: normalizeEmailTemplateContent(def.defaults, def.defaults),
    })
  }
}

export async function listEmailTemplates(db: Db) {
  await ensureEmailTemplatesSeeded(db)
  const rows = await db.select().from(emailTemplates)

  const byKey = new Map(rows.map(r => [r.typeKey, r]))
  return EMAIL_TEMPLATE_CATALOG.map((def) => {
    const row = byKey.get(def.typeKey)
    const defaults = normalizeEmailTemplateContent(def.defaults, def.defaults)
    const content = row
      ? normalizeEmailTemplateContent(row.content, defaults)
      : defaults
    return {
      typeKey: def.typeKey,
      name: def.name,
      description: def.description,
      audience: def.audience,
      group: def.group,
      isActive: row?.isActive ?? false,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      hasCustomContent: row ? !contentEquals(content, defaults) : false,
      hasHtmlSource: hasEmailTemplateHtmlSource(content),
    }
  })
}

async function renderFromFields(
  db: Db,
  typeKey: string,
  content: EmailTemplateContent,
) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  const vars = { ...def.sampleVars }
  const resolved = applyEmailTemplateContent({ ...content, htmlSource: '' }, vars)
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const sampleActionHref = vars.verifyUrl
    || vars.resetUrl
    || vars.detailUrl
    || vars.messagesUrl
    || vars.invoiceUrl
    || vars.reviewUrl
    || vars.usersUrl
    || `${appUrl.replace(/\/$/, '')}/dashboard`

  const note = (resolved.noteTitle || resolved.noteBody)
    ? { title: resolved.noteTitle || 'Note', body: resolved.noteBody || '' }
    : undefined

  return buildStyledEmail({
    subject: resolved.subject,
    text: [
      resolved.headline,
      '',
      resolved.lead,
      note ? `${note.title}: ${note.body}` : '',
      resolved.primaryActionLabel ? `${resolved.primaryActionLabel}: ${sampleActionHref}` : '',
    ].filter(Boolean).join('\n'),
    eyebrow: resolved.eyebrow || undefined,
    headline: resolved.headline,
    lead: resolved.lead,
    note,
    primaryAction: resolved.primaryActionLabel
      ? { href: sampleActionHref, label: resolved.primaryActionLabel }
      : undefined,
    details: Object.entries(vars).slice(0, 6).map(([label, value]) => ({
      label,
      value,
    })),
    appUrl,
    brand,
  })
}

export async function getEmailTemplateDetail(db: Db, typeKey: string) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  await ensureEmailTemplatesSeeded(db)
  const [row] = await db.select().from(emailTemplates)
    .where(eq(emailTemplates.typeKey, typeKey))
    .limit(1)

  if (!row) throw new EmailTemplatesServiceError('NOT_FOUND')

  const defaults = normalizeEmailTemplateContent(def.defaults, def.defaults)
  const content = normalizeEmailTemplateContent(row.content, defaults)
  const baseline = await renderFromFields(db, typeKey, content)

  return {
    typeKey: def.typeKey,
    name: def.name,
    description: def.description,
    audience: def.audience,
    group: def.group,
    isActive: row.isActive,
    content,
    defaults,
    baselineHtml: baseline.html,
    hasHtmlSource: hasEmailTemplateHtmlSource(content),
    variables: def.variables,
    sampleVars: def.sampleVars,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }
}

export async function getActiveEmailTemplateContent(
  db: Db,
  typeKey: string,
): Promise<EmailTemplateContent | null> {
  try {
    const [row] = await db.select({
      isActive: emailTemplates.isActive,
      content: emailTemplates.content,
    })
      .from(emailTemplates)
      .where(eq(emailTemplates.typeKey, typeKey))
      .limit(1)
    if (!row?.isActive) return null
    const def = getEmailTemplateDefinition(typeKey)
    if (!def) return null
    return normalizeEmailTemplateContent(row.content, def.defaults)
  }
  catch {
    return null
  }
}

export async function saveEmailTemplate(
  db: Db,
  typeKey: string,
  input: { content: Partial<EmailTemplateContent>, activate?: boolean },
  actorUserId?: string | null,
) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  await ensureEmailTemplatesSeeded(db)
  const content = normalizeEmailTemplateContent(input.content, def.defaults)
  const now = new Date()

  const [row] = await db.update(emailTemplates)
    .set({
      content,
      name: def.name,
      ...(input.activate === true ? { isActive: true } : {}),
      ...(input.activate === false ? { isActive: false } : {}),
      updatedBy: actorUserId ?? null,
      updatedAt: now,
    })
    .where(eq(emailTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new EmailTemplatesServiceError('NOT_FOUND')
  return getEmailTemplateDetail(db, typeKey)
}

export async function setEmailTemplateActive(
  db: Db,
  typeKey: string,
  isActive: boolean,
  actorUserId?: string | null,
) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  await ensureEmailTemplatesSeeded(db)
  const [row] = await db.update(emailTemplates)
    .set({
      isActive,
      updatedBy: actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new EmailTemplatesServiceError('NOT_FOUND')
  return getEmailTemplateDetail(db, typeKey)
}

export async function resetEmailTemplate(
  db: Db,
  typeKey: string,
  actorUserId?: string | null,
) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  await ensureEmailTemplatesSeeded(db)
  const defaults = normalizeEmailTemplateContent(def.defaults, def.defaults)
  const [row] = await db.update(emailTemplates)
    .set({
      content: defaults,
      isActive: false,
      updatedBy: actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new EmailTemplatesServiceError('NOT_FOUND')
  return getEmailTemplateDetail(db, typeKey)
}

export async function previewEmailTemplate(
  db: Db,
  typeKey: string,
  contentInput?: Partial<EmailTemplateContent> | null,
) {
  const def = getEmailTemplateDefinition(typeKey)
  if (!def) throw new EmailTemplatesServiceError('INVALID_TYPE')

  const content = normalizeEmailTemplateContent(contentInput ?? def.defaults, def.defaults)
  const vars = { ...def.sampleVars }
  const resolved = applyEmailTemplateContent(content, vars)
  const fromFields = await renderFromFields(db, typeKey, content)

  if (hasEmailTemplateHtmlSource(content)) {
    return {
      subject: resolved.subject || fromFields.subject,
      text: fromFields.text,
      html: interpolateEmailTemplate(content.htmlSource, vars),
      resolved,
      usedHtmlSource: true,
    }
  }

  return {
    subject: fromFields.subject,
    text: fromFields.text,
    html: fromFields.html,
    resolved,
    usedHtmlSource: false,
  }
}
