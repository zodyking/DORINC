import { describe, expect, it } from 'vitest'
import {
  isProtectedAppPath,
  isPublicAppPath,
  isUnauthorizedError,
  loginPathForRoute,
} from '../../app/utils/auth-session'

describe('auth session helpers', () => {
  it('detects public paths', () => {
    expect(isPublicAppPath('/auth/login')).toBe(true)
    expect(isPublicAppPath('/setup')).toBe(true)
    expect(isPublicAppPath('/invoices')).toBe(false)
  })

  it('detects protected paths', () => {
    expect(isProtectedAppPath('/invoices')).toBe(true)
    expect(isProtectedAppPath('/portal/invoices')).toBe(true)
    expect(isProtectedAppPath('/auth/login')).toBe(false)
  })

  it('builds login paths by area', () => {
    expect(loginPathForRoute('/invoices')).toBe('/auth/login?card=staff')
    expect(loginPathForRoute('/portal')).toBe('/auth/login')
  })

  it('recognizes unauthorized fetch errors', () => {
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true)
    expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true)
    expect(isUnauthorizedError({ data: { code: 'UNAUTHENTICATED' } })).toBe(true)
    expect(isUnauthorizedError({ statusCode: 403 })).toBe(false)
  })
})
