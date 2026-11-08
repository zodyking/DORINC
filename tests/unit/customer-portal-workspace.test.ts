import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { invoiceWorkspaceSettingsSchema } from '../../shared/validators/workspace-settings'
import { DEFAULT_INVOICE_SETTINGS } from '../../shared/workspace-settings-defaults'

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

describe('app-wide customer portal switch', () => {
  it('defaults on in invoice workspace settings', () => {
    expect(DEFAULT_INVOICE_SETTINGS.customerPortalEnabled).toBe(true)
    expect(invoiceWorkspaceSettingsSchema.parse({}).customerPortalEnabled).toBe(true)
  })

  it('exposes the toggle on invoice settings and persists it', () => {
    const panel = source('app/components/admin/settings/SettingsInvoicePanel.vue')
    expect(panel).toContain('Customer portal')
    expect(panel).toContain('form.customerPortalEnabled')
    expect(panel).toContain('signed-in customer portal users are signed out')

    const save = source('server/services/workspace-settings.service.ts')
    expect(save).toContain('customerPortalEnabled: settings.customerPortalEnabled')
    expect(save).toContain('export async function isCustomerPortalEnabled')

    const patch = source('server/api/admin/settings/invoice.patch.ts')
    expect(patch).toContain('revokeActiveCustomerPortalSessions')
    expect(patch).toContain('if (!settings.customerPortalEnabled)')
  })

  it('hides the customer login card and switcher when the portal is off', () => {
    const screen = source('app/components/auth/AuthScreen.vue')
    expect(screen).toContain('customerPortalEnabled')
    expect(screen).toContain("card.value = 'staff'")
    expect(screen).toContain('card === \'customer\' && customerPortalEnabled')
    expect(screen).toContain('card === \'staff\' && customerPortalEnabled')

    const login = source('app/pages/auth/login.vue')
    expect(login).toContain("return 'staff'")
    expect(login).toContain('customerPortalEnabled === false')
  })

  it('advertises the flag on the public business endpoint', () => {
    const pub = source('server/api/public/business.get.ts')
    expect(pub).toContain('customerPortalEnabled')
    expect(pub).toContain('isCustomerPortalEnabled')
  })

  it('rejects customer sign-in and silently drops portal sessions when off', () => {
    const auth = source('server/auth/auth.service.ts')
    expect(auth).toContain('isCustomerPortalEnabled')
    expect(auth).toContain("throw new AuthError('PORTAL_DISABLED')")

    const session = source('server/middleware/auth-session.ts')
    expect(session).toContain('isCustomerPortalEnabled')
    expect(session).toContain('staleSessionCookie')

    const portal = source('server/services/portal-access.service.ts')
    expect(portal).toContain('export async function revokeActiveCustomerPortalSessions')
    expect(portal).toContain("eq(accountTypes.key, 'customer')")
  })

  it('rewrites the invoice email when the portal is off', () => {
    const templates = source('server/mail/customer-email-templates.ts')
    expect(templates).toContain('View invoice online')
    expect(templates).toContain('available online')
    expect(templates).toContain('customerPortalEnabled')

    const send = source('server/services/invoice-send.service.ts')
    expect(send).toContain('resolveInvoiceOnlineAccessLink')
    expect(send).toContain('isCustomerPortalEnabled')
  })
})
