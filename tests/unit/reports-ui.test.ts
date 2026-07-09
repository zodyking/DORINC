import { describe, expect, it } from 'vitest'
import {
  agingBucketTone,
  reportMoney,
  reportPercent,
  reportPeriodLabel,
  reportTabLabel,
} from '../../app/utils/reports-ui'

describe('reports-ui (P3-06)', () => {
  it('labels report tabs', () => {
    expect(reportTabLabel('revenue')).toBe('Revenue')
    expect(reportTabLabel('aging')).toBe('A/R Aging')
    expect(reportTabLabel('productivity')).toBe('Mechanic productivity')
  })

  it('formats money and periods', () => {
    expect(reportMoney('1234.5')).toMatch(/\$1,234\.50/)
    expect(reportPeriodLabel('2026-07')).toMatch(/Jul/)
  })

  it('maps aging bucket tones', () => {
    expect(agingBucketTone('current')).toBe('ok')
    expect(agingBucketTone('90_plus')).toBe('bad')
  })

  it('formats conversion percent', () => {
    expect(reportPercent(42.5)).toBe('42.5%')
    expect(reportPercent(null)).toBe('—')
  })
})
