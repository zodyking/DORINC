import { describe, expect, it } from 'vitest'
import {
  generatePortalTempPassword,
  isPortalTempPasswordShape,
} from '../../server/auth/portal-password'

describe('generatePortalTempPassword', () => {
  it('always returns a 10-character phrase with digit and special', () => {
    for (let i = 0; i < 40; i++) {
      const password = generatePortalTempPassword()
      expect(password).toHaveLength(10)
      expect(isPortalTempPasswordShape(password)).toBe(true)
    }
  })
})
