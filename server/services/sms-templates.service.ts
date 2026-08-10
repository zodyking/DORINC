import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { smsTemplates } from '../db/schema/sms-templates'
import {
  SMS_TEMPLATE_CATALOG,
  applySmsTemplateContent,
  interpolateSmsTemplate,
  normalizeSmsTemplateContent,
  smsTemplateByKey,
  type SmsTemplateContent,
} from '../../shared/sms-template-catalog'

export type SmsTemplatesServiceErrorCode
  = 'NOT_FOUND'
    | 'INVALID_TYPE'
    | 'VALIDATION'

export class SmsTemplatesServiceError extends Error {
  constructor(public readonly code: SmsTemplatesServiceErrorCode) {
    super(code)
  }
}

function contentEquals(a: SmsTemplateContent, b: SmsTemplateContent) {
  return JSON.stringify(normalizeSmsTemplateContent(a, a))
    === JSON.stringify(normalizeSmsTemplateContent(b, b))
}

export async function ensureSmsTemplatesSeeded(db: Db) {
  for (const def of SMS_TEMPLATE_CATALOG) {
    const [existing] = await db.select({ id: smsTemplates.id })
      .from(smsTemplates)
      .where(eq(smsTemplates.typeKey, def.typeKey))
      .limit(1)
    if (existing) continue
    await db.insert(smsTemplates).values({
      typeKey: def.typeKey,
      name: def.name,
      isActive: false,
      content: normalizeSmsTemplateContent(def.defaults, def.defaults),
    })
  }
}

export async function listSmsTemplates(db: Db) {
  await ensureSmsTemplatesSeeded(db)
  const rows = await db.select().from(smsTemplates)
  const byKey = new Map(rows.map(r => [r.typeKey, r]))

  return SMS_TEMPLATE_CATALOG.map((def) => {
    const row = byKey.get(def.typeKey)
    const defaults = normalizeSmsTemplateContent(def.defaults, def.defaults)
    const content = row
      ? normalizeSmsTemplateContent(row.content, defaults)
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
      bodyPreview: content.body.slice(0, 120),
    }
  })
}

export async function getSmsTemplateDetail(db: Db, typeKey: string) {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')

  await ensureSmsTemplatesSeeded(db)
  const [row] = await db.select().from(smsTemplates)
    .where(eq(smsTemplates.typeKey, typeKey))
    .limit(1)

  if (!row) throw new SmsTemplatesServiceError('NOT_FOUND')

  const defaults = normalizeSmsTemplateContent(def.defaults, def.defaults)
  const content = normalizeSmsTemplateContent(row.content, defaults)

  return {
    typeKey: def.typeKey,
    name: def.name,
    description: def.description,
    audience: def.audience,
    group: def.group,
    isActive: row.isActive,
    content,
    defaults,
    variables: def.variables,
    sampleVars: def.sampleVars,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }
}

export async function getActiveSmsTemplateContent(
  db: Db,
  typeKey: string,
): Promise<SmsTemplateContent | null> {
  try {
    const [row] = await db.select({
      isActive: smsTemplates.isActive,
      content: smsTemplates.content,
    })
      .from(smsTemplates)
      .where(eq(smsTemplates.typeKey, typeKey))
      .limit(1)
    if (!row?.isActive) return null
    const def = smsTemplateByKey(typeKey)
    if (!def) return null
    return normalizeSmsTemplateContent(row.content, def.defaults)
  }
  catch {
    return null
  }
}

/** Resolve body for sending: active override, else catalog default. */
export async function resolveSmsBody(
  db: Db,
  typeKey: string,
  vars: Record<string, string | null | undefined>,
): Promise<string> {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')
  const override = await getActiveSmsTemplateContent(db, typeKey)
  const content = normalizeSmsTemplateContent(override ?? def.defaults, def.defaults)
  return applySmsTemplateContent(content, vars).body.trim()
}

export async function saveSmsTemplate(
  db: Db,
  typeKey: string,
  input: { content: Partial<SmsTemplateContent>, activate?: boolean },
  actorUserId?: string | null,
) {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')

  const content = normalizeSmsTemplateContent(input.content, def.defaults)
  if (!content.body.trim()) throw new SmsTemplatesServiceError('VALIDATION')
  if (content.body.length > 480) throw new SmsTemplatesServiceError('VALIDATION')

  await ensureSmsTemplatesSeeded(db)
  const now = new Date()

  const [row] = await db.update(smsTemplates)
    .set({
      content,
      name: def.name,
      ...(input.activate === true ? { isActive: true } : {}),
      ...(input.activate === false ? { isActive: false } : {}),
      updatedBy: actorUserId ?? null,
      updatedAt: now,
    })
    .where(eq(smsTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new SmsTemplatesServiceError('NOT_FOUND')
  return getSmsTemplateDetail(db, typeKey)
}

export async function setSmsTemplateActive(
  db: Db,
  typeKey: string,
  isActive: boolean,
  actorUserId?: string | null,
) {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')

  await ensureSmsTemplatesSeeded(db)
  const [row] = await db.update(smsTemplates)
    .set({
      isActive,
      updatedBy: actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(smsTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new SmsTemplatesServiceError('NOT_FOUND')
  return getSmsTemplateDetail(db, typeKey)
}

export async function resetSmsTemplate(
  db: Db,
  typeKey: string,
  actorUserId?: string | null,
) {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')

  await ensureSmsTemplatesSeeded(db)
  const defaults = normalizeSmsTemplateContent(def.defaults, def.defaults)
  const [row] = await db.update(smsTemplates)
    .set({
      content: defaults,
      isActive: false,
      updatedBy: actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(smsTemplates.typeKey, typeKey))
    .returning()

  if (!row) throw new SmsTemplatesServiceError('NOT_FOUND')
  return getSmsTemplateDetail(db, typeKey)
}

export async function previewSmsTemplate(
  typeKey: string,
  contentInput?: Partial<SmsTemplateContent> | null,
) {
  const def = smsTemplateByKey(typeKey)
  if (!def) throw new SmsTemplatesServiceError('INVALID_TYPE')

  const content = normalizeSmsTemplateContent(contentInput ?? def.defaults, def.defaults)
  const body = interpolateSmsTemplate(content.body, def.sampleVars)
  return {
    body,
    characterCount: body.length,
    resolved: applySmsTemplateContent(content, def.sampleVars),
  }
}
