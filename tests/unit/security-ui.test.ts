// Unit tests for suspicious activity helpers (P3-10).
import { describe, expect, it } from 'vitest'
import {
  formatSuspiciousAlertIps,
  formatSuspiciousAlertUser,
  recoveryTestStatusClass,
  suspiciousAlertRuleLabel,
  suspiciousAlertSeverityClass,
} from '../../app/utils/admin-panel-ui'

describe('admin-panel-ui security helpers (P3-09/10)', () => {
  it('maps recovery test status to pill classes', () => {
    expect(recoveryTestStatusClass('passed')).toBe('ok')
    expect(recoveryTestStatusClass('failed')).toBe('over')
    expect(recoveryTestStatusClass('running')).toBe('warn')
  })

  it('maps suspicious alert severity and rule labels', () => {
    expect(suspiciousAlertSeverityClass('high')).toBe('over')
    expect(suspiciousAlertSeverityClass('medium')).toBe('warn')
    expect(suspiciousAlertRuleLabel('auth.failed_login_burst')).toBe('Failed logins')
    expect(suspiciousAlertRuleLabel('backup.restore_attempt')).toBe('Backup restore')
  })

  it('formats suspicious alert user and IP fields', () => {
    expect(formatSuspiciousAlertUser({
      actorName: 'Jane Admin',
      actorEmail: 'jane@example.com',
    })).toBe('Jane Admin (jane@example.com)')
    expect(formatSuspiciousAlertUser({ actorEmail: 'jane@example.com' })).toBe('jane@example.com')
    expect(formatSuspiciousAlertUser({})).toBe('—')

    expect(formatSuspiciousAlertIps({ ipAddresses: ['1.2.3.4', '5.6.7.8'] })).toBe('1.2.3.4, 5.6.7.8')
    expect(formatSuspiciousAlertIps({ ipAddress: '1.2.3.4' })).toBe('1.2.3.4')
    expect(formatSuspiciousAlertIps({})).toBe('—')
  })
})
