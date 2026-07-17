import { describe, expect, it } from 'vitest'
import {
  FILE_DOCUMENT_CATEGORY_LABELS,
  documentCategoryLabel,
  toPendingDocumentCategory,
} from '../../shared/document-categories'

describe('document-categories', () => {
  it('uses legal document titles', () => {
    expect(documentCategoryLabel('tax_exemption_form')).toBe('Sales Tax Exemption Certificate')
    expect(documentCategoryLabel('vehicle_registration')).toBe('Certificate of Registration')
    expect(FILE_DOCUMENT_CATEGORY_LABELS.tax_exemption_form).toContain('Certificate')
  })

  it('maps active categories to pending review categories', () => {
    expect(toPendingDocumentCategory('tax_exemption_form')).toBe('tax_exemption_form_pending')
    expect(toPendingDocumentCategory('vehicle_registration')).toBe('vehicle_registration_pending')
  })
})
