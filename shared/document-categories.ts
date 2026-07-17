/** Semantic document categories stored on app_files.document_category. */
export const FILE_DOCUMENT_CATEGORIES = ['vehicle_registration', 'tax_exemption_form'] as const
export type FileDocumentCategory = (typeof FILE_DOCUMENT_CATEGORIES)[number]

export const FILE_DOCUMENT_CATEGORY_LABELS: Record<FileDocumentCategory, string> = {
  vehicle_registration: 'Vehicle registration',
  tax_exemption_form: 'Tax exemption form',
}
