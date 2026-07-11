import { describe, expect, it } from 'vitest'
import { getBuiltInInvoicePdfTemplate } from '../../server/services/invoice-template-source.service'
import { BLADE_INVOICE_TEMPLATE_VIEW } from '../../shared/invoice-template-design'

describe('built-in invoice PDF template', () => {
  it('ships Blade view and design settings without a database row', () => {
    const builtIn = getBuiltInInvoicePdfTemplate()
    expect(builtIn.isBuiltIn).toBe(true)
    expect(builtIn.templateVersionId).toBeNull()
    expect(builtIn.bladeView).toBe(BLADE_INVOICE_TEMPLATE_VIEW)
    expect(builtIn.bladeSource).toBeNull()
    expect(builtIn.designSettings.pageSize).toBe('Letter')
    expect(builtIn.designSettings.marginInches).toBe(0.5)
  })
})
