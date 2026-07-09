import { describe, expect, it } from 'vitest'
import {
  allocateUniquePortalUsername,
  normalizePortalUsername,
  portalUsernameFromCompanyName,
} from '../../shared/format/portal-username'

describe('portalUsernameFromCompanyName', () => {
  it('uses the first significant word of a company name', () => {
    expect(portalUsernameFromCompanyName('Hollis Logistics')).toBe('hollis')
    expect(portalUsernameFromCompanyName('Marren Farms LLC')).toBe('marren')
  })

  it('strips punctuation and stop words', () => {
    expect(portalUsernameFromCompanyName('ABC Trucking Co.')).toBe('abctruck')
    expect(portalUsernameFromCompanyName('The Oak Group')).toBe('oak')
  })

  it('normalizes to lowercase alphanumeric', () => {
    expect(normalizePortalUsername('Hello World!')).toBe('helloworld')
  })
})

describe('allocateUniquePortalUsername', () => {
  it('returns the base when available', async () => {
    const username = await allocateUniquePortalUsername('Hollis Logistics', async () => false)
    expect(username).toBe('hollis')
  })

  it('appends a numeric suffix when taken', async () => {
    const taken = new Set(['hollis', 'hollis2'])
    const username = await allocateUniquePortalUsername(
      'Hollis Logistics',
      async candidate => taken.has(candidate),
    )
    expect(username).toBe('hollis3')
  })
})
