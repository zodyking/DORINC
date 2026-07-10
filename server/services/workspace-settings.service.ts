import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import {
  DEFAULT_BUSINESS_PROFILE,
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_LINE_TYPE_VERBS,
  defaultCatalogKeywordMap,
  type BusinessProfile,
  type CatalogKeywordMap,
  type InvoiceWorkspaceSettings,
  type LineTypeVerbSettings,
} from '../../shared/workspace-settings-defaults'
import {
  businessProfileSchema,
  catalogKeywordMapSchema,
  invoiceWorkspaceSettingsSchema,
  lineTypeVerbsSchema,
} from '../../shared/validators/workspace-settings'
import { MANAGER_APPROVAL_THRESHOLD_KEY } from './billing-settings.service'

export const WORKSPACE_SETTING_KEYS = {
  business: 'workspace.business_profile',
  catalogKeywords: 'workspace.catalog_keywords',
  lineTypeVerbs: 'workspace.line_type_verbs',
  invoice: 'workspace.invoice_settings',
} as const

async function readJson<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1)
  return (row?.value as T | null) ?? null
}

async function writeJson(db: Db, key: string, value: unknown, updatedBy?: string) {
  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1)

  if (existing) {
    await db.update(appSettings)
      .set({ value, updatedBy: updatedBy ?? null, updatedAt: new Date() })
      .where(eq(appSettings.key, key))
  }
  else {
    await db.insert(appSettings).values({
      key,
      value,
      updatedBy: updatedBy ?? null,
    })
  }
}

export async function getBusinessProfile(db: Db): Promise<BusinessProfile> {
  const raw = await readJson<Record<string, unknown>>(db, WORKSPACE_SETTING_KEYS.business)
  const legacyName = typeof raw?.tradeName === 'string' && raw.tradeName.trim()
    ? raw.tradeName.trim()
    : typeof raw?.legalName === 'string' && raw.legalName.trim()
      ? raw.legalName.trim()
      : ''
  const businessName = typeof raw?.businessName === 'string' && raw.businessName.trim()
    ? raw.businessName.trim()
    : legacyName
  return businessProfileSchema.parse({ ...DEFAULT_BUSINESS_PROFILE, ...raw, businessName })
}

export async function saveBusinessProfile(db: Db, input: BusinessProfile, updatedBy: string) {
  const profile = businessProfileSchema.parse(input)
  await writeJson(db, WORKSPACE_SETTING_KEYS.business, profile, updatedBy)
  return profile
}

export async function getCatalogKeywordMap(db: Db): Promise<CatalogKeywordMap> {
  const raw = await readJson<CatalogKeywordMap>(db, WORKSPACE_SETTING_KEYS.catalogKeywords)
  const defaults = defaultCatalogKeywordMap()
  if (!raw) return defaults
  const parsed = catalogKeywordMapSchema.parse(raw)
  return { ...defaults, ...parsed }
}

export async function saveCatalogKeywordMap(db: Db, input: CatalogKeywordMap, updatedBy: string) {
  const map = catalogKeywordMapSchema.parse(input)
  await writeJson(db, WORKSPACE_SETTING_KEYS.catalogKeywords, map, updatedBy)
  return map
}

export async function getLineTypeVerbs(db: Db): Promise<LineTypeVerbSettings> {
  const raw = await readJson<LineTypeVerbSettings>(db, WORKSPACE_SETTING_KEYS.lineTypeVerbs)
  if (!raw) return { ...DEFAULT_LINE_TYPE_VERBS }
  const parsed = lineTypeVerbsSchema.parse(raw)
  return {
    part: parsed.part.length ? parsed.part : [...DEFAULT_LINE_TYPE_VERBS.part],
    labor: parsed.labor.length ? parsed.labor : [...DEFAULT_LINE_TYPE_VERBS.labor],
    fee: parsed.fee.length ? parsed.fee : [...DEFAULT_LINE_TYPE_VERBS.fee],
  }
}

export async function saveLineTypeVerbs(db: Db, input: LineTypeVerbSettings, updatedBy: string) {
  const verbs = lineTypeVerbsSchema.parse(input)
  await writeJson(db, WORKSPACE_SETTING_KEYS.lineTypeVerbs, verbs, updatedBy)
  return verbs
}

export async function getInvoiceWorkspaceSettings(db: Db): Promise<InvoiceWorkspaceSettings> {
  const raw = await readJson<InvoiceWorkspaceSettings>(db, WORKSPACE_SETTING_KEYS.invoice)
  const [thresholdRow] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MANAGER_APPROVAL_THRESHOLD_KEY))
    .limit(1)
  const threshold = (thresholdRow?.value as { amount?: string } | null)?.amount
  const merged = {
    ...DEFAULT_INVOICE_SETTINGS,
    ...raw,
    managerApprovalThreshold: threshold ?? raw?.managerApprovalThreshold ?? DEFAULT_INVOICE_SETTINGS.managerApprovalThreshold,
  }
  return invoiceWorkspaceSettingsSchema.parse(merged)
}

export async function saveInvoiceWorkspaceSettings(
  db: Db,
  input: InvoiceWorkspaceSettings,
  updatedBy: string,
) {
  const settings = invoiceWorkspaceSettingsSchema.parse(input)
  await writeJson(db, WORKSPACE_SETTING_KEYS.invoice, {
    defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
    shopSuppliesPercent: settings.shopSuppliesPercent,
  }, updatedBy)
  await writeJson(db, MANAGER_APPROVAL_THRESHOLD_KEY, {
    amount: settings.managerApprovalThreshold,
  }, updatedBy)
  return settings
}

/** Staff-facing detection rules (no secrets). */
export async function getDetectionSettings(db: Db) {
  const [catalogKeywords, lineTypeVerbs] = await Promise.all([
    getCatalogKeywordMap(db),
    getLineTypeVerbs(db),
  ])
  return { catalogKeywords, lineTypeVerbs }
}

export async function getPublicBusinessProfile(db: Db): Promise<BusinessProfile> {
  return getBusinessProfile(db)
}
