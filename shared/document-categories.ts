/** Semantic document categories stored on app_files.document_category. */
export const FILE_DOCUMENT_ACTIVE_CATEGORIES = ['vehicle_registration', 'tax_exemption_form'] as const
export type FileDocumentActiveCategory = (typeof FILE_DOCUMENT_ACTIVE_CATEGORIES)[number]

export const FILE_DOCUMENT_PENDING_CATEGORIES = [
  'vehicle_registration_pending',
  'tax_exemption_form_pending',
] as const
export type FileDocumentPendingCategory = (typeof FILE_DOCUMENT_PENDING_CATEGORIES)[number]

export const FILE_DOCUMENT_CATEGORIES = [
  ...FILE_DOCUMENT_ACTIVE_CATEGORIES,
  ...FILE_DOCUMENT_PENDING_CATEGORIES,
] as const
export type FileDocumentCategory = (typeof FILE_DOCUMENT_CATEGORIES)[number]

/** Legal / official document titles shown in UI. */
export const FILE_DOCUMENT_CATEGORY_LABELS: Record<FileDocumentActiveCategory, string> = {
  vehicle_registration: 'Certificate of Registration',
  tax_exemption_form: 'Sales Tax Exemption Certificate',
}

export const FILE_DOCUMENT_CATEGORY_DESCRIPTIONS: Record<FileDocumentActiveCategory, string> = {
  vehicle_registration: 'Official vehicle registration issued by the DMV or licensing authority (PDF or image).',
  tax_exemption_form: 'Signed resale or sales tax exemption certificate on file (e.g. ST-120, ST-121, or equivalent).',
}

const PENDING_BY_ACTIVE: Record<FileDocumentActiveCategory, FileDocumentPendingCategory> = {
  vehicle_registration: 'vehicle_registration_pending',
  tax_exemption_form: 'tax_exemption_form_pending',
}

const ACTIVE_BY_PENDING: Record<FileDocumentPendingCategory, FileDocumentActiveCategory> = {
  vehicle_registration_pending: 'vehicle_registration',
  tax_exemption_form_pending: 'tax_exemption_form',
}

export function isActiveDocumentCategory(value: string): value is FileDocumentActiveCategory {
  return (FILE_DOCUMENT_ACTIVE_CATEGORIES as readonly string[]).includes(value)
}

export function toPendingDocumentCategory(active: FileDocumentActiveCategory): FileDocumentPendingCategory {
  return PENDING_BY_ACTIVE[active]
}

export function toActiveDocumentCategory(category: FileDocumentCategory): FileDocumentActiveCategory {
  if (isActiveDocumentCategory(category)) return category
  return ACTIVE_BY_PENDING[category as FileDocumentPendingCategory]
}

export function documentCategoryLabel(category: FileDocumentActiveCategory): string {
  return FILE_DOCUMENT_CATEGORY_LABELS[category]
}
