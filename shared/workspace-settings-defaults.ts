import { DEFAULT_CATALOG_CATEGORIES } from './catalog-default-categories'
import { DEFAULT_CATEGORY_KEYWORDS } from './catalog-category-keywords'
import {
  DEFAULT_LABOR_DESCRIPTION_VERBS,
  DEFAULT_PART_DESCRIPTION_VERBS,
  DEFAULT_FEE_DESCRIPTION_VERBS,
} from './line-item-type-from-description'

export interface BusinessProfile {
  businessName: string
  phone: string
  email: string
  website: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  businessName: '',
  phone: '',
  email: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
}

export interface LineTypeVerbSettings {
  part: string[]
  labor: string[]
  fee: string[]
}

export const DEFAULT_LINE_TYPE_VERBS: LineTypeVerbSettings = {
  part: [...DEFAULT_PART_DESCRIPTION_VERBS],
  labor: [...DEFAULT_LABOR_DESCRIPTION_VERBS],
  fee: [...DEFAULT_FEE_DESCRIPTION_VERBS],
}

export type CatalogKeywordMap = Record<string, string[]>

/** Full default keyword map keyed by category name. */
export function defaultCatalogKeywordMap(): CatalogKeywordMap {
  const map: CatalogKeywordMap = {}
  for (const name of DEFAULT_CATALOG_CATEGORIES) {
    map[name] = [...(DEFAULT_CATEGORY_KEYWORDS[name] ?? [name])]
  }
  return map
}

export interface InvoiceWorkspaceSettings {
  defaultPaymentTermsDays: number
  shopSuppliesPercent: string
  managerApprovalThreshold: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceWorkspaceSettings = {
  defaultPaymentTermsDays: 30,
  shopSuppliesPercent: '3.5',
  managerApprovalThreshold: '5000.00',
}
