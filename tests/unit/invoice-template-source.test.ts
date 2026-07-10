import { describe, expect, it } from 'vitest'
import { getBuiltInInvoicePdfTemplate } from '../../server/services/invoice-template-source.service'

describe('built-in invoice PDF template', () => {
  it('ships HTML and design settings without a database row', () => {
    const builtIn = getBuiltInInvoicePdfTemplate()
    expect(builtIn.isBuiltIn).toBe(true)
    expect(builtIn.templateVersionId).toBeNull()
    expect(builtIn.htmlContent).toContain('<!doctype html>')
    expect(builtIn.designSettings.pageSize).toBe('Letter')
    expect(builtIn.designSettings.marginInches).toBe(0.5)
  })
})
