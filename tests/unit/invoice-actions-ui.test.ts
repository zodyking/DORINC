import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('invoice action UI contracts', () => {
  it('hosts the bulk-send modal outside the closing page-actions menu', () => {
    const component = source('app/components/BulkSendInvoicesButton.vue')
    const page = source('app/pages/invoices/index.vue')

    expect(component).toContain('hideTrigger?: boolean')
    expect(component).toContain('defineExpose({ openModal })')
    expect(component).toContain('v-if="canSend && !hideTrigger"')

    const menuEnd = page.indexOf('</StaffPageHead>')
    const hiddenHost = page.indexOf('ref="bulkSendRef"')
    expect(menuEnd).toBeGreaterThan(0)
    expect(hiddenHost).toBeGreaterThan(menuEnd)
  })

  it('renders Edit before Send or Resend in invoice row menus', () => {
    const component = source('app/components/invoices/InvoiceListRowActions.vue')
    const menu = component.slice(
      component.indexOf('<PageActionsMenu>'),
      component.indexOf('</PageActionsMenu>'),
    )

    expect(menu.indexOf('Edit')).toBeGreaterThan(0)
    expect(menu.indexOf('Edit')).toBeLessThan(menu.indexOf('{{ sendLabel }}'))
  })
})
