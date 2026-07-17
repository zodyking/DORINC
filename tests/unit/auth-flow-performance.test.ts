import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('public auth flow performance contracts', () => {
  it('verifies on the first page mount without a second navigation', () => {
    const page = source('app/pages/auth/verify-email.vue')
    expect(page).toContain('window.history.replaceState')
    expect(page).toContain('void verifyToken(token)')
    expect(page).not.toContain('navigateTo(')
  })

  it('does not probe the authenticated session on public auth pages', () => {
    const plugin = source('app/plugins/auth.ts')
    expect(plugin).toContain('!isPublicAppPath(route.path)')
  })

  it('queues account verification mail and defers audit logging', () => {
    const route = source('server/api/auth/signup.post.ts')
    expect(route).toContain('await enqueueVerificationEmail')
    expect(route).toContain('void writeAudit')
    expect(route).not.toContain('await sendVerificationEmail')
  })
})
