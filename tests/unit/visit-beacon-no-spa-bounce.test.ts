import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('visit beacon does not bounce SPA', () => {
  it('always returns blocked:false redirectTo:null after recording', () => {
    const src = readFileSync(resolve('server/api/security/visit-beacon.post.ts'), 'utf8')
    expect(src).toContain('Never instruct the SPA to navigate away')
    expect(src).toMatch(/blocked:\s*false,\s*redirectTo:\s*null/)
    expect(src).not.toContain("redirectTo = '/auth/access-restricted'")
  })

  it('client plugin no longer navigates on beacon blocked', () => {
    const src = readFileSync(resolve('app/plugins/02.security-visit.client.ts'), 'utf8')
    expect(src).not.toContain('navigateTo(res.redirectTo)')
    expect(src).not.toContain('res?.blocked')
  })
})

describe('HTML gate accepts bypass without tab-session header', () => {
  it('does not require tab session on document loads', () => {
    const src = readFileSync(resolve('server/middleware/guard-access-gate.ts'), 'utf8')
    expect(src).toContain('requireTabSession: false')
    expect(src).toContain("decision.reason === 'geo_unknown'")
    expect(src).not.toContain('requireTabSession: true')
  })
})
