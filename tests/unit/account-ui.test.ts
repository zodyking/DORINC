import { describe, expect, it } from 'vitest'
import {
  formatLastLogin,
  formatMemberSince,
  sessionDeviceLabel,
  sessionLocation,
  validateNewPassword,
} from '../../app/utils/account-ui'

describe('account-ui helpers (P1-35)', () => {
  it('validates minimum password length', () => {
    expect(validateNewPassword('short')).toMatch(/Minimum/)
    expect(validateNewPassword('a-long-password-123')).toBeNull()
    expect(validateNewPassword('')).toMatch(/Enter/)
  })

  it('parses common user agents into device labels', () => {
    expect(sessionDeviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0')).toBe('Windows · Chrome')
    expect(sessionDeviceLabel('Mozilla/5.0 (iPhone) Safari/604.1')).toBe('iPhone · Safari')
    expect(sessionDeviceLabel(null)).toBe('Unknown device')
  })

  it('shows recorded device location for sessions, not raw IP', () => {
    expect(sessionLocation('Brooklyn, NY', false)).toBe('Brooklyn, NY')
    expect(sessionLocation('Brooklyn, NY', true)).toBe('Brooklyn, NY · this device')
    expect(sessionLocation(null, false)).toBe('—')
    expect(sessionLocation('  ', true)).toBe('— · this device')
  })

  it('formats member since dates', () => {
    expect(formatMemberSince('2023-01-15T12:00:00.000Z')).toMatch(/Jan 2023/)
  })

  it('formats last login for today', () => {
    const today = new Date()
    today.setHours(9, 30, 0, 0)
    expect(formatLastLogin(today.toISOString())).toMatch(/^Today/)
  })
})
