import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('access gate API exemption (Option A)', () => {
  const src = readFileSync(resolve('server/middleware/guard-access-gate.ts'), 'utf8')

  it('exempts all /api routes from the HTML/geofence middleware', () => {
    expect(src).toContain("'/api/'")
    expect(src).toMatch(/if \(path\.startsWith\('\/api\/'\)\) return/)
  })

  it('does not throw access_blocked from the access-gate middleware', () => {
    // API 403 access_blocked lived in the removed API enforcement block.
    expect(src).not.toContain("reason: 'access_blocked'")
    expect(src).not.toContain('apiError')
  })

  it('still enforces the fence on HTML document navigations', () => {
    expect(src).toContain('isPageNavigation')
    expect(src).toContain('evaluateAccessDecision')
    expect(src).toContain('/auth/access-restricted')
  })
})
