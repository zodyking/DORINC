// Unit tests for suspicious activity helpers (P3-10).
import { describe, expect, it } from 'vitest'
import {
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
})
