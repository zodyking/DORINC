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
    expect(src).toContain('shouldRedirectHtmlAccessGate')
    expect(src).toContain('/auth/access-restricted')
  })

  it('does not bounce anonymous homepage visitors on IP geo', () => {
    const gate = readFileSync(resolve('server/services/access-gate.service.ts'), 'utf8')
    expect(gate).toContain('if (!input.signedIn) return false')
    expect(src).toContain('sessionCoords')
    expect(src).toContain('coordsForHtmlAccessGate')
    expect(src).toContain('!sessionCoords')
  })

  it('prefers login GPS on the session over IP geolocation', () => {
    const auth = readFileSync(resolve('server/auth/auth.service.ts'), 'utf8')
    expect(auth).toContain('geoLatitude: row.session.geoLatitude ?? null')
    expect(auth).toContain('geoLongitude: row.session.geoLongitude ?? null')
    expect(src).toContain('resolved.geoLatitude')
    expect(src).toContain('resolved.geoLongitude')
  })

  it('does not issue verification emails from HTML visits', () => {
    expect(src).not.toContain('quietlyIssueOutsideGeoChallenge')
    expect(src).not.toContain('shouldIssueChallenge')
  })
})
